import type {Keys, Person} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';
import {storeIdObject} from '@refinio/one.core/lib/storage-versioned-objects';
import {createDefaultKeys} from '@refinio/one.core/lib/keychain/keychain';

/**
 * Creates a new person by creating a Person IdObject.
 *
 * Throws if the person with this email already exists.
 *
 * @param email
 */
export async function createPerson(email?: string): Promise<SHA256IdHash<Person>> {
    const result = await createPersonIfNotExist(email);

    if (result.exists) {
        throw new Error('Instance already exists');
    }

    return result.personId;
}

/**
 * Creates a new person by creating a Person IdObject.
 *
 * @param email
 */
export async function createPersonIfNotExist(email?: string): Promise<{
    personId: SHA256IdHash<Person>;
    exists: boolean;
}> {
    if (email === undefined) {
        email = await createRandomString(64);
    }

    const status = await storeIdObject({
        $type$: 'Person',
        email
    });

    return {
        personId: status.idHash,
        exists: status.status === 'exists'
    };
}

/**
 * Creates a person with a default set of keys.
 *
 * @param email
 */
export async function createPersonWithDefaultKeys(email?: string): Promise<{
    personId: SHA256IdHash<Person>;
    personKeys: SHA256Hash<Keys>;
}> {
    const personId = await createPerson(email);
    const personKeys = await createDefaultKeys(personId);
    return {personId, personKeys};
}
