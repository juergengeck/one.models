/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */

import EventEmitter from 'events';
import {Group, Person, SHA256IdHash, VersionedObjectResult} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    getObjectByIdObj,
    VERSION_UPDATES
} from 'one.core/lib/storage';

// @todo make it string
export enum AccessGroupNames {
    partners = 'partners',
    clinic = 'clinic'
}

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
    async init() {
        // remove , and create function that will give access to a channel info
        await this.createAccessGroup(AccessGroupNames.partners);
        await this.createAccessGroup(AccessGroupNames.clinic);
    }

    /**
     *
     * @param {AccessGroupNames}groupName
     * @returns { Promise<SHA256IdHash<Person>[]> }
     */
    async getAccessGroupPersons(groupName: AccessGroupNames): Promise<SHA256IdHash<Person>[]> {
        const group = await this.getAccessGroupByName(groupName);
        return group === undefined ? [] : group.obj.person;
    }

    /**
     *
     * @param {AccessGroupNames}name
     * @param {SHA256IdHash<Person>}personId
     * @returns {Promise<void>}
     */
    async removePersonFromAccessGroup(
        name: AccessGroupNames,
        personId: SHA256IdHash<Person>
    ): Promise<void> {
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
    async addPersonToAccessGroup(
        name: AccessGroupNames,
        personId: SHA256IdHash<Person>
    ): Promise<void> {
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
        }
    }

    /**
     *
     * @param {string} name
     * @returns {Promise<VersionedObjectResult<Group>>}
     */
    async getAccessGroupByName(name: AccessGroupNames): Promise<VersionedObjectResult<Group>> {
        return await getObjectByIdObj({$type$: 'Group', name: name});
    }

    /**
     *
     * @param {string} name
     * @returns {Promise<void>}
     */
    async createAccessGroup(name: AccessGroupNames): Promise<void> {
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
        }
    }
}
