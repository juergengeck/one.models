/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import type {Access, Group, IdAccess, Person} from 'one.core/lib/recipes';
import {
    createSingleObjectThroughPurePlan,
    getObjectByIdObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import type {VersionedObjectResult} from 'one.core/lib/storage';
import {serializeWithType} from 'one.core/lib/util/promise';
import {OEvent} from '../misc/OEvent';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';

const ACCESS_LOCKS = {
    GROUP_LOCK: 'GROUP_LOCK'
} as const;

/**
 *
 * @description Access Model class
 * @augments EventEmitter
 */
export default class AccessModel extends EventEmitter {
    /**
     * Event is emitted when:
     * - a access group is created
     * - persons are added to the access group
     * - persons are removed from the access group
     */
    public onGroupsUpdated = new OEvent<() => void>();

    constructor() {
        super();
    }

    /**
     *
     */
    async init() {}

    /**
     *
     * @param {string | string[]}groupName
     * @returns { Promise<SHA256IdHash<Person>[]> }
     */
    async getAccessGroupPersons(groupName: string | string[]): Promise<SHA256IdHash<Person>[]> {
        return await serializeWithType(ACCESS_LOCKS.GROUP_LOCK, async () => {
            if (Array.isArray(groupName)) {
                return [
                    ...new Set(
                        (
                            await Promise.all(
                                groupName.map(async group => {
                                    const groupObj = await this.getAccessGroupByName(group);
                                    return groupObj === undefined ? [] : groupObj.obj.person;
                                })
                            )
                        ).reduce((acc, curr) => acc.concat(curr), [])
                    )
                ];
            } else {
                const group = await this.getAccessGroupByName(groupName);
                return group === undefined ? [] : group.obj.person;
            }
        });
    }

    /**
     *
     * @param {string}name
     * @param {SHA256IdHash<Person>}personId
     * @returns {Promise<void>}
     */
    async removePersonFromAccessGroup(name: string, personId: SHA256IdHash<Person>): Promise<void> {
        const group = await this.getAccessGroupByName(name);
        /** add the person only if it does not exist and prevent unnecessary one updates **/

        const foundIndex = group.obj.person.findIndex(
            (accPersonIdHash: SHA256IdHash<Person>) => accPersonIdHash === personId
        );
        if (foundIndex !== undefined) {
            group.obj.person.splice(foundIndex, 1);
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                group.obj
            );
            this.emit('groups_updated');
            this.onGroupsUpdated.emit();
        }
    }

    /**
     * @param {string} name
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<void>}
     */
    async addPersonToAccessGroup(name: string, personId: SHA256IdHash<Person>): Promise<void> {
        return await serializeWithType(ACCESS_LOCKS.GROUP_LOCK, async () => {
            const group = await this.getAccessGroupByName(name);
            /** add the person only if it does not exist and prevent unnecessary one updates **/
            if (
                group.obj.person.find(
                    (accPersonIdHash: SHA256IdHash<Person>) => accPersonIdHash === personId
                ) === undefined
            ) {
                group.obj.person.push(personId);
                await createSingleObjectThroughPurePlan(
                    {
                        module: '@one/identity',
                        versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                    },
                    group.obj
                );

                this.emit('groups_updated');
                this.onGroupsUpdated.emit();
            }
        });
    }

    async giveGroupAccessToObject(
        groupName: string,
        objectHash: SHA256Hash
    ): Promise<VersionedObjectResult<Access | IdAccess>> {
        const group = await this.getAccessGroupByName(groupName);
        return await createSingleObjectThroughPurePlan(
            {
                module: '@one/access',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            [
                {
                    object: objectHash,
                    person: [],
                    group: [...group.obj.person],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }

    /**
     *
     * @param {string} name
     * @returns {Promise<VersionedObjectResult<Group>>}
     */
    async getAccessGroupByName(name: string): Promise<VersionedObjectResult<Group>> {
        return await getObjectByIdObj({$type$: 'Group', name: name});
    }

    /**
     *
     * @param {string} name
     * @returns {Promise<void>}
     */
    async createAccessGroup(name: string): Promise<void> {
        try {
            await getObjectByIdObj({$type$: 'Group', name: name});
        } catch (ignored) {
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                {
                    $type$: 'Group',
                    name: name,
                    person: []
                }
            );
            this.emit('groups_updated');
            this.onGroupsUpdated.emit();
        }
    }
}
