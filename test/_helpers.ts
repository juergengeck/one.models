import {initInstance} from '@refinio/one.core/lib/instance';
import type {Instance, OneObjectTypeNames, Recipe} from '@refinio/one.core/lib/recipes';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {statSync} from 'fs';
import path from 'path';
import {readFile} from 'fs/promises';

export const defaultDbName = 'testDb';

export interface StorageHelpersInitOpts {
    email?: string;
    secret?: string | null;
    secretEncryptionKey?: HexString;
    publicEncryptionKey?: HexString;
    secretSignKey?: HexString;
    publicSignKey?: HexString;
    name?: string;
    dbKey?: string;
    addTypes?: boolean;
    deleteDb?: boolean;
    encryptStorage?: boolean;
    initialRecipes?: readonly Recipe[];
    initiallyEnabledReverseMapTypes?: Array<[OneObjectTypeNames, Set<string>]>;
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
    initiallyEnabledReverseMapTypes = [['Plan', new Set(['*'])]]
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

export function buildTestFile(): File {
    const filePath = './test/consent.pdf';
    const stats = statSync(filePath);

    // @ts-ignore enough for the test
    return {
        lastModified: stats.ctimeMs,
        name: path.basename(filePath),
        size: stats.size,
        type: 'application/pdf',
        arrayBuffer: () => readFile(filePath)
    };
}
