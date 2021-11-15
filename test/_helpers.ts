/*
  eslint-disable global-require,
  @typescript-eslint/no-var-requires,
  @typescript-eslint/no-use-before-define,
  @typescript-eslint/no-unsafe-call
 */

import {initInstance, closeAndDeleteCurrentInstance} from '@refinio/one.core/lib/instance';
import {PLATFORMS} from '@refinio/one.core/lib/platforms';
import type {Instance, Module, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {VersionedObjectResult} from '@refinio/one.core/lib/storage';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from '@refinio/one.core/lib/storage';
import {platform} from '@refinio/one.core/lib/system/platform';
import * as StorageBase from '@refinio/one.core/lib/system/storage-base';
import type {AnyObject} from '@refinio/one.core/lib/util/object';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import {isNumber, isString} from '@refinio/one.core/lib/util/type-checks-basic';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';

// eslint-disable-next-line no-var, @typescript-eslint/no-unused-vars
declare var WorkerGlobalScope: any;

// Just requiring the module starts the server at it's default values so that it can run as a
// standalone script as well.
// const isBrowser =
//     (typeof window !== 'undefined' && getObjTypeName(window) === 'Window') ||
//     (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope);
// @ts-ignore - To TS this will always be either true or false when it checks the values
const isBrowser = platform === PLATFORMS.BROWSER;

const defaultDbName = 'testDb';

/**
 * @param {string} name
 * @param {string} code
 * @returns {Promise<VersionedObjectResult<Module>>}
 */
export function createCodeModule(
    name: string,
    code: string
): Promise<VersionedObjectResult<Module>> {
    return createSingleObjectThroughPurePlan(
        {
            module: '@one/module-importer',
            versionMapPolicy: {'*': VERSION_UPDATES.NONE}
        },
        {
            moduleName: name,
            version: '1.0',
            code
        }
    );
}

export interface StorageHelpersInitOpts {
    email?: string;
    secret?: string | null;
    secretEncryptionKey?: string;
    publicEncryptionKey?: string;
    secretSignKey?: string;
    publicSignKey?: string;
    name?: string;
    dbKey?: string;
    addTypes?: boolean;
    deleteDb?: boolean;
    encryptStorage?: boolean;
    initiallyEnabledReverseMapTypes?: Array<[OneObjectTypeNames, null | Set<string>]>;
}

/**
 * @returns {Promise<void>}
 */
export async function deleteTestDB(): Promise<void> {
    try {
        return await closeAndDeleteCurrentInstance();
    } catch (err) {
        if (!isString(err.message) || !err.message.startsWith('SB-NO-INIT1')) {
            throw err;
        }
    }
}

/**
 * @param {object} [options={}]
 * @param {string} [options.email]
 * @param {string|null} [options.secret]
 * @param {string} [options.name]
 * @param {string} [options.dbKey]
 * @param {boolean} [options.addTypes=true]
 * @param {boolean} [options.deleteDb=true]
 * @param {boolean} [options.encryptStorage=false]
 * @param {Array} [options.initiallyEnabledReverseMapTypes]
 * @param {string|undefined} options.publicEncryptionKey
 * @param {string|undefined} options.publicSignKey
 * @returns {Promise<Instance>}
 */
export async function init({
    email = 'test@test.com',
    secret = 'SECRET PASSWORD',
    secretEncryptionKey,
    publicEncryptionKey,
    secretSignKey,
    publicSignKey,
    name = 'test',
    dbKey = defaultDbName,
    addTypes = true,
    deleteDb = true,
    encryptStorage = isBrowser,
    initiallyEnabledReverseMapTypes = [['Plan', null]]
}: StorageHelpersInitOpts = {}): Promise<Instance> {
    if (deleteDb) {
        await deleteTestDB();
    }

    const instanceObj = await initInstance({
        name,
        email,
        secret,
        secretEncryptionKey,
        publicEncryptionKey,
        secretSignKey,
        publicSignKey,
        wipeStorage: deleteDb,
        encryptStorage,
        directory: isBrowser ? dbKey : 'test/' + dbKey,
        initialRecipes: [...RecipesStable, ...RecipesExperimental],
        initiallyEnabledReverseMapTypes: new Map(initiallyEnabledReverseMapTypes)
    });

    return instanceObj;
}
