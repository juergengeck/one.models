/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import {
    Group,
    OneObjectTypes,
    Person,
    SHA256Hash,
    SHA256IdHash,
    VersionedObjectResult
} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    getObjectByIdObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {getInstanceOwnerIdHash} from 'one.core/lib/instance';

export const FreedaAccessGroups = {
    partner: 'partners',
    clinic: 'clinic',
    myself: 'myself'
};

/**
 *
 * @description Access Model class
 * @augments EventEmitter
 */
export default class AccessModel extends EventEmitter {
    constructor() {
        super();
    }

    /**
     *
     */
    async init() {}

    /**
     *
     * @param {AccessGroupNames}groupName
     * @returns { Promise<SHA256IdHash<Person>[]> }
     */
    async getAccessGroupPersons(groupName: string): Promise<SHA256IdHash<Person>[]> {
        const group = await this.getAccessGroupByName(groupName);
        return group === undefined ? [] : group.obj.person;
    }

    /**
     *
     * @param {AccessGroupNames}name
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
        }
    }

    /**
     * @param {string} name
     * @param {SHA256IdHash<Person>} personId
     * @returns {Promise<void>}
     */
    async addPersonToAccessGroup(name: string, personId: SHA256IdHash<Person>): Promise<void> {
        const group = await this.getAccessGroupByName(name);
        /** add the person only if it does not exist and prevent unnecessary one updates **/
        if (
            group.obj.person.find(
                (accPersonIdHash: SHA256IdHash<Person>) => accPersonIdHash === personId
            ) === undefined
        ) {
            group.obj.person.push(personId);
            console.log('person added to the group:', group);
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                group.obj
            );
        }
    }

    async giveGroupAccessToObject(groupName: string, objectHash: SHA256Hash<OneObjectTypes>) {
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
            const group = await createSingleObjectThroughPurePlan(
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
            console.log('group created:', group);
            const accessPlainObject = {
                id: group.idHash,
                person: [await getInstanceOwnerIdHash()],
                group: [],
                mode: SET_ACCESS_MODE.REPLACE
            };
            const access = await createSingleObjectThroughPurePlan(
                {
                    module: '@one/access',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                [accessPlainObject]
            );
            console.log('access to group created:', access);
        }
    }
}
