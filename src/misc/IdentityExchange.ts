/**
 * This file implements helper functions to generate and import / export identities.
 */
import tweetnacl from 'tweetnacl';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Instance, Person, Plan} from '@refinio/one.core/lib/recipes';
import {
    getObjectByIdHash,
    getObjectByIdObj,
    storeVersionedObject
} from '@refinio/one.core/lib/storage-versioned-objects';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {createRandomString} from '@refinio/one.core/lib/system/crypto-helpers';

import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import type {OneInstanceEndpoint} from '../recipes/Leute/CommunicationEndpoints';
import {sign} from './Signature';
import ProfileModel from '../models/Leute/ProfileModel';
import type {InstanceOptions} from '@refinio/one.core/lib/instance';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {
    isHexString,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import {isHash} from '@refinio/one.core/lib/util/type-checks';

const DUMMY_PLAN_HASH =
    '0000000000000000000000000000000000000000000000000000000000000000' as SHA256Hash<Plan>;

// ######## Identity types ########

/**
 * Everything that is needed to contact an identity.
 */
export type Identity = {
    type: 'public';
    personEmail: string;
    instanceName: string;
    personKeyPublic: HexString;
    personSignKeyPublic: HexString;
    instanceKeyPublic: HexString;
    commServerUrl: string;
};

/**
 * Everything that is needed to impersonate an identity.
 *
 * This has the private keys in it, so it is very sensitive.
 */
export type IdentityWithSecrets = {
    type: 'secret';
    personEmail: string;
    instanceName: string;
    personKeySecret: HexString;
    personKeyPublic: HexString;
    personSignKeySecret: HexString;
    personSignKeyPublic: HexString;
    instanceKeySecret: HexString;
    instanceKeyPublic: HexString;
    commServerUrl: string;
};

/**
 * Check if passed object is an identity object.
 *
 * @param arg
 */
export function isIdentity(arg: any): arg is Identity {
    return (
        arg != null &&
        arg.type === 'public' &&
        typeof arg.personEmail === 'string' &&
        typeof arg.instanceName === 'string' &&
        isHexString(arg.personKeyPublic) &&
        isHexString(arg.personSignKeyPublic) &&
        isHexString(arg.instanceKeyPublic) &&
        typeof arg.commServerUrl === 'string'
    );
}

/**
 * Check if passed object is an identity object with private keys.
 *
 * @param arg
 */
export function isIdentityWithSecrets(arg: any): arg is IdentityWithSecrets {
    return (
        arg != null &&
        arg.type === 'secret' &&
        typeof arg.personEmail === 'string' &&
        typeof arg.instanceName === 'string' &&
        isHexString(arg.personKeySecret) &&
        isHexString(arg.personKeyPublic) &&
        isHexString(arg.personSignKeySecret) &&
        isHexString(arg.personSignKeyPublic) &&
        isHexString(arg.instanceKeySecret) &&
        isHexString(arg.instanceKeyPublic) &&
        typeof arg.commServerUrl === 'string'
    );
}

/**
 * Creates a new identity.
 *
 * Does not need a running one instance. It will generate new key pairs and if no personEmail or
 * instanceName is specified it will also generate random values for those.
 *
 * @param commServerUrl - The communication server url to include in the identity objects.
 * @param personEmail - The person email to use. If not specified a random string is used.
 * @param instanceName - The instance name to use. If not specified a random string is used.
 */
export async function generateNewIdentity(
    commServerUrl: string,
    personEmail?: string,
    instanceName?: string
): Promise<{
    secret: IdentityWithSecrets;
    public: Identity;
}> {
    if (personEmail === undefined) {
        personEmail = await createRandomString();
    }
    if (instanceName === undefined) {
        instanceName = await createRandomString();
    }
    const personKeyPair = tweetnacl.box.keyPair();
    const personSignKeyPair = tweetnacl.sign.keyPair();
    const instanceKeyPair = tweetnacl.box.keyPair();

    const identityWithSecrets: IdentityWithSecrets = {
        type: 'secret',
        personEmail,
        instanceName,
        personKeySecret: uint8arrayToHexString(personKeyPair.secretKey),
        personKeyPublic: uint8arrayToHexString(personKeyPair.publicKey),
        personSignKeySecret: uint8arrayToHexString(personSignKeyPair.secretKey),
        personSignKeyPublic: uint8arrayToHexString(personSignKeyPair.publicKey),
        instanceKeySecret: uint8arrayToHexString(instanceKeyPair.secretKey),
        instanceKeyPublic: uint8arrayToHexString(instanceKeyPair.publicKey),
        commServerUrl
    };

    const identity: Identity = {
        type: 'public',
        personEmail,
        instanceName,
        personKeyPublic: uint8arrayToHexString(personKeyPair.publicKey),
        personSignKeyPublic: uint8arrayToHexString(personSignKeyPair.publicKey),
        instanceKeyPublic: uint8arrayToHexString(instanceKeyPair.publicKey),
        commServerUrl
    };

    return {
        secret: identityWithSecrets,
        public: identity
    };
}

/**
 * Creates a one instance object from an identity object.
 *
 * This also signs the keys with our own key, so that they are considered trusted keys.
 *
 * @param identity
 */
export async function convertIdentityToOneInstanceEndpoint(
    identity: Identity
): Promise<UnversionedObjectResult<OneInstanceEndpoint>> {
    // Step 1: Create person object if it does not exist, yet
    let personHash: SHA256IdHash<Person>;

    try {
        personHash = (
            await getObjectByIdObj({
                $type$: 'Person',
                email: identity.personEmail
            })
        ).idHash;
    } catch (_ignore) {
        personHash = (
            await storeVersionedObject(
                {
                    $type$: 'Person',
                    email: identity.personEmail
                },
                DUMMY_PLAN_HASH
            )
        ).idHash;
    }

    // Step 2: Create person keys object
    const personKeysHash = (
        await storeUnversionedObject({
            $type$: 'Keys',
            owner: personHash,
            publicKey: identity.personKeyPublic,
            publicSignKey: identity.personSignKeyPublic
        })
    ).hash;

    // Step 3: Create person object if it does not exist, yet
    let instanceHash: SHA256IdHash<Instance>;
    try {
        instanceHash = (
            await getObjectByIdObj({
                $type$: 'Instance',
                name: identity.instanceName,
                owner: personHash,
                recipe: [],
                module: [],
                enabledReverseMapTypes: new Map()
            })
        ).idHash;
    } catch (_ignore) {
        instanceHash = (
            await storeVersionedObject(
                {
                    $type$: 'Instance',
                    name: identity.instanceName,
                    owner: personHash,
                    recipe: [],
                    module: [],
                    enabledReverseMapTypes: new Map()
                },
                DUMMY_PLAN_HASH
            )
        ).idHash;
    }

    // Step 4: Create instance keys object
    const instanceKeysHash = (
        await storeUnversionedObject({
            $type$: 'Keys',
            owner: instanceHash,
            publicKey: identity.instanceKeyPublic
        })
    ).hash;

    // Sign keys
    await sign(personKeysHash);
    await sign(instanceKeysHash);

    // Construct the OneInstanceEndpoint
    return storeUnversionedObject({
        $type$: 'OneInstanceEndpoint',
        personId: personHash,
        personKeys: personKeysHash,
        instanceId: instanceHash,
        instanceKeys: instanceKeysHash,
        url: identity.commServerUrl
    });
}

/**
 * Creates an identity object from a oneInstanceEndpoint hash
 *
 * @param oneInstanceEndpointOrHash
 */
export async function convertOneInstanceEndpointToIdentity(
    oneInstanceEndpointOrHash: SHA256Hash<OneInstanceEndpoint> | OneInstanceEndpoint
): Promise<Identity> {
    const oneInstanceEndpoint = isHash(oneInstanceEndpointOrHash)
        ? await getObject(oneInstanceEndpointOrHash)
        : oneInstanceEndpointOrHash;
    if (oneInstanceEndpoint.personKeys === undefined) {
        throw new Error('Person keys must not be undefined when exporting a OneInstanceEndpoint.');
    }
    const person = await getObjectByIdHash(oneInstanceEndpoint.personId);
    const personKeys = await getObject(oneInstanceEndpoint.personKeys);
    const instance = await getObjectByIdHash(oneInstanceEndpoint.instanceId);
    const instanceKeys = await getObject(oneInstanceEndpoint.instanceKeys);
    if (personKeys.publicSignKey === undefined) {
        throw new Error('Person needs a sign key when exporting a OneInstanceEndpoint.');
    }

    return {
        type: 'public',
        personEmail: person.obj.email,
        instanceName: instance.obj.name,
        personKeyPublic: personKeys.publicKey,
        personSignKeyPublic: personKeys.publicSignKey,
        instanceKeyPublic: instanceKeys.publicKey,
        commServerUrl: oneInstanceEndpoint.url
    };
}

/**
 * Create a profile from an identity file.
 *
 * This profile will have a single OneInstanceEndpoint if it didn't exist before.
 * If it existed, the OneInstanceEndpoint will be added to the existing profile.
 *
 * @param identity - The identity that is added to the profile
 * @param profileId - The profile identity string. Defaults to 'default'.
 * @param owner - The owner of the profile. If undefined use the owner personId of the Identity.
 */
export async function convertIdentityToProfile(
    identity: Identity,
    profileId: string = 'default',
    owner?: SHA256IdHash<Person>
): Promise<ProfileModel> {
    const oneInstanceEndpoint = await convertIdentityToOneInstanceEndpoint(identity);
    const personId = oneInstanceEndpoint.obj.personId;
    return await ProfileModel.constructWithNewProfile(
        personId,
        owner === undefined ? personId : owner,
        profileId,
        [oneInstanceEndpoint.obj]
    );
}

/**
 * Creates instance options based on an identity.
 *
 * @param identity
 * @param secret - secret is mandatory for InstanceOptions => this is used 1:1
 */
export function convertIdentityToInstanceOptions(
    identity: Identity | IdentityWithSecrets,
    secret: string
): InstanceOptions {
    if (isIdentity(identity)) {
        return {
            name: identity.instanceName,
            email: identity.personEmail,
            secret
        };
    } else {
        return {
            name: identity.instanceName,
            email: identity.personEmail,
            publicEncryptionKey: identity.personKeyPublic,
            secretEncryptionKey: identity.personKeySecret,
            publicSignKey: identity.personSignKeyPublic,
            secretSignKey: identity.personSignKeySecret,
            publicInstanceEncryptionKey: identity.instanceKeyPublic,
            secretInstanceEncryptionKey: identity.instanceKeySecret,
            secret
        };
    }
}
