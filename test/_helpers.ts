import {initInstance} from '@refinio/one.core/lib/instance';
import type {Instance, OneObjectTypeNames, Recipe} from '@refinio/one.core/lib/recipes';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';

const defaultDbName = 'testDb';

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
    initialRecipes?: readonly Recipe[];
    initiallyEnabledReverseMapTypes?: Array<[OneObjectTypeNames, null | Set<string>]>;
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
 * @param {Recipe[]} options.initialRecipes
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
    encryptStorage = false,
    initialRecipes = [],
    initiallyEnabledReverseMapTypes = [['Plan', null]]
}: StorageHelpersInitOpts = {}): Promise<Instance> {
    return await initInstance({
        name,
        email,
        secret,
        secretEncryptionKey,
        publicEncryptionKey,
        secretSignKey,
        publicSignKey,
        wipeStorage: deleteDb,
        encryptStorage,
        directory: 'test/' + dbKey,
        initialRecipes: [...RecipesStable, ...RecipesExperimental],
        initiallyEnabledReverseMapTypes: new Map(initiallyEnabledReverseMapTypes)
    });
}
