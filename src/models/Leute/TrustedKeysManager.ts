import {ensurePublicSignKey} from '@refinio/one.core/lib/crypto/sign';
import type {PublicSignKey} from '@refinio/one.core/lib/crypto/sign';
import {getInstanceIdHash} from '@refinio/one.core/lib/instance';
import {getPublicKeys} from '@refinio/one.core/lib/keychain/key-storage-public';
import {
    getDefaultKeys,
    getListOfCompleteKeys,
    hasDefaultKeys
} from '@refinio/one.core/lib/keychain/keychain';
import type {
    OneObjectInterfaces,
    OneObjectTypeNames,
    OneObjectTypes,
    Person
} from '@refinio/one.core/lib/recipes';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {getObjectByIdHash} from '@refinio/one.core/lib/storage-versioned-objects';
import {
    hexToUint8Array,
    uint8arrayToHexString
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {getAllVersionMapEntries} from '@refinio/one.core/lib/version-map-query';
import tweetnacl from 'tweetnacl';
import type {RightToDeclareTrustedKeysForEverybodyCertificate} from '../../recipes/Certificates/RightToDeclareTrustedKeysForEverybodyCertificate';
import type {LeuteModel} from '../index';
import ProfileModel from './ProfileModel';
import {getOrCreate} from '../../utils/MapUtils';
import type {Signature} from '../../recipes/SignatureRecipes';
import type {Profile} from '../../recipes/Leute/Profile';

export type CertificateData<T extends OneObjectTypes = OneObjectTypes> = {
    signature: Signature;
    signatureHash: SHA256Hash<Signature>;
    certificate: T;
    certificateHash: SHA256Hash<T>;
    trusted: boolean;
};

export type KeysWithReason = {
    reason: string;
    key: PublicSignKey;
};

export type ProfileData = {
    personId: SHA256IdHash<Person>;
    owner: SHA256IdHash<Person>;
    profileId: string;

    profileHash: SHA256Hash<Profile>;
    profileIdHash: SHA256IdHash<Profile>;

    timestamp: number;
    keys: HexString[];

    certificates: Array<CertificateData>;
};

//type ArrayElement<A> = A extends readonly (infer T)[] ? T : A;

export type RootKeyMode = 'MainId' | 'All';

export type KeyTrustInfo = {
    key: HexString;
    trusted: boolean;
    reason: string;
    sources: {
        issuer: SHA256IdHash<Person>;
        certificateType: OneObjectTypeNames;
        keyTrustInfo: KeyTrustInfo;
    }[];
};

/**
 *
 * Trust levels:
 *
 * - Inner circle (just me):
 * -- Only local keys of main identity
 * -- Local and remote keys of main identity
 * -- Only local keys of me someone
 * -- Local and remote keys of me someone
 * - Others
 * -- TrustKeysCertificate by inner circle and persons that have the right to issue trusted keys
 */
export default class TrustedKeysManager {
    private leute: LeuteModel;

    // Mapping from key to profiles that references them.
    private keysToProfileMap = new Map<HexString, Map<SHA256Hash<Profile>, ProfileData>>();

    // Keys collected from all profiles referencing person
    private keysOfPerson = new Map<SHA256IdHash<Person>, Set<HexString>>();

    // Cache used for DP algorithm to determine trust
    private keysTrustCache = new Map<HexString, KeyTrustInfo>();

    // Map that stores the rights of a person
    private personRightsMap = new Map<
        SHA256IdHash<Person>,
        {
            rightToDeclareTrustedKeysForEverybody: boolean;
            rightToDeclareTrustedKeysForSelf: boolean;
        }
    >();

    /**
     * Constructor
     *
     * @param leute
     */
    constructor(leute: LeuteModel) {
        this.leute = leute;
    }

    async init(): Promise<void> {
        await this.updatePersonRightsMap();
        await this.updateKeysMaps();
    }

    async shutdown(): Promise<void> {
        // empty by design
    }

    async refreshCaches(): Promise<void> {
        await this.updatePersonRightsMap();
        await this.updateKeysMaps();
    }

    // #### Keys for person interface ####

    async getTrustedKeysForPerson(person: SHA256IdHash<Person>): Promise<PublicSignKey[]> {
        const keys = await this.getKeysForPerson(person);
        return keys.filter(k => k.trustInfo.trusted).map(k => k.key);
    }

    async getKeysForPerson(
        person: SHA256IdHash<Person>
    ): Promise<{key: PublicSignKey; trustInfo: KeyTrustInfo}[]> {
        const keys = this.keysOfPerson.get(person);

        if (keys === undefined || keys.size === 0) {
            return [];
        }

        const keysWithInfo: {key: PublicSignKey; trustInfo: KeyTrustInfo}[] = [];
        for (const key of keys) {
            keysWithInfo.push({
                key: ensurePublicSignKey(hexToUint8Array(key)),
                trustInfo: await this.getKeyTrustInfo(key)
            });
        }

        return keysWithInfo;
    }

    // #### Trusted key interface ####

    /**
     * Check if this key is trusted.
     *
     * @param key
     */
    async isKeyTrusted(key: HexString): Promise<boolean> {
        return (await this.getKeyTrustInfo(key)).trusted;
    }

    /**
     * Get the trust information for aspecific key.
     *
     * @param key
     */
    async getKeyTrustInfo(key: HexString): Promise<KeyTrustInfo> {
        // Fast exit if we already have the value
        const cache = this.keysTrustCache.get(key);
        if (cache !== undefined) {
            return cache;
        }

        // If we do not have a trust state, then call the DP algorithm
        const rootKeys = await this.getRootKeys('MainId');
        return this.getKeyTrustInfoDP(
            key,
            rootKeys.map(k => ({
                key: uint8arrayToHexString(k),
                trusted: true,
                sources: [],
                reason: 'root key'
            })),
            []
        );
    }

    /**
     * Verifies that the signature was signed by a trusted key of the issuer.
     *
     * @param signature
     */
    async verifySignatureWithTrustedKeys(signature: Signature): Promise<boolean> {
        const trustedKeys = await this.getTrustedKeysForPerson(signature.issuer);
        return verifySignatureWithMultipleKeys(trustedKeys, signature) !== undefined;
    }

    // #### Root key interface ####

    async isSignedByRootKey(signature: Signature, mode: RootKeyMode = 'MainId'): Promise<boolean> {
        const me = await this.leute.me();
        const myMainId = await me.mainIdentity();

        if (signature.issuer !== myMainId) {
            return false;
        }

        const trustedKeys = await this.getRootKeys(mode);
        return verifySignatureWithMultipleKeys(trustedKeys, signature) !== undefined;
    }

    async getRootKeys(mode: RootKeyMode): Promise<PublicSignKey[]> {
        const me = await this.leute.me();
        const rootKeys = new Set<PublicSignKey>();

        const addLocalKeysForPerson = async (person: SHA256IdHash<Person>) => {
            const completeKeys = (
                await Promise.all((await getListOfCompleteKeys(person)).map(k => getObject(k.keys)))
            ).map(k => k.publicSignKey);
            const keysfromProfiles = this.keysOfPerson.get(person) || new Set<HexString>();

            for (const keyFromProfile of keysfromProfiles) {
                if (completeKeys.includes(keyFromProfile)) {
                    rootKeys.add(ensurePublicSignKey(hexToUint8Array(keyFromProfile)));
                }
            }
        };

        if (mode === 'MainId') {
            await addLocalKeysForPerson(await me.mainIdentity());
        } else if (mode === 'All') {
            for (const identity of me.identities()) {
                await addLocalKeysForPerson(identity);
            }
        }

        return [...rootKeys];
    }

    // ######## Certificate stuff ########

    async getCertificatesOfType<T extends OneObjectTypeNames>(
        data: SHA256Hash | SHA256IdHash,
        type: T
    ): Promise<Array<CertificateData<OneObjectInterfaces[T]>>> {
        const certificates: Array<CertificateData<OneObjectInterfaces[T]>> = [];

        const certificateHashes = await getAllEntries(data, type);
        for (const certificateHash of certificateHashes) {
            const certificate = await getObject(certificateHash);

            const signatureHashes = await getAllEntries(certificateHash, 'Signature');

            for (const signatureHash of signatureHashes) {
                const signature = await getObject(signatureHash);

                certificates.push({
                    certificate,
                    certificateHash,
                    signature,
                    signatureHash,
                    trusted: await this.verifySignatureWithTrustedKeys(signature)
                });
            }
        }

        return certificates;
    }

    async getCertificates(
        data: SHA256Hash | SHA256IdHash
    ): Promise<Array<CertificateData<OneObjectTypes>>> {
        const iHash = getInstanceIdHash();
        if (iHash === undefined) {
            throw new Error('Instance was not initialized');
        }

        const i = await getObjectByIdHash(iHash);

        const certificates: Array<CertificateData<OneObjectTypes>> = [];
        for (const type of i.obj.enabledReverseMapTypes.keys()) {
            const c = await this.getCertificatesOfType(data, type);
            certificates.push(...c);
        }

        return certificates;
    }

    /**
     * Check if data has a certificate of specified type issued by specific person.
     *
     * @param data - The data for which certificates should be checked.
     * @param type - Type of certificate to check
     */
    async isCertifiedByAnyone<CertT extends OneObjectTypeNames>(
        data: SHA256Hash | SHA256IdHash,
        type: CertT
    ): Promise<boolean> {
        return (await this.certifiedBy(data, type)).length > 0;
    }

    /**
     * Check if data has a certificate of specified type issued by a specific person.
     *
     * @param data - The data for which certificates should be checked.
     * @param certType - Type of certificate to check
     * @param issuer - Check if certified by this person
     */
    async isCertifiedBy<CertT extends OneObjectTypeNames>(
        data: SHA256Hash | SHA256IdHash,
        certType: CertT,
        issuer: SHA256IdHash<Person>
    ): Promise<boolean> {
        const certs = await this.getCertificatesOfType(data, certType);
        return certs.some(
            c => c.trusted && (issuer === undefined || c.signature.issuer === issuer)
        );
    }

    async certifiedBy<CertT extends OneObjectTypeNames>(
        hash: SHA256Hash | SHA256IdHash,
        certType: CertT
    ): Promise<SHA256IdHash<Person>[]> {
        const issuers = new Set<SHA256IdHash<Person>>();

        const certs = await this.getCertificatesOfType(hash, certType);
        for (const cert of certs) {
            if (cert.trusted) {
                issuers.add(cert.signature.issuer);
            }
        }

        return [...issuers];
    }

    // ######## AffirmationCertificate special functions ########

    async isAffirmedByAnyone(hash: SHA256Hash): Promise<boolean> {
        return this.isCertifiedByAnyone(hash, 'AffirmationCertificate');
    }

    async isAffirmedBy(hash: SHA256Hash, issuer: SHA256IdHash<Person>): Promise<boolean> {
        return this.isCertifiedBy(hash, 'AffirmationCertificate', issuer);
    }

    async affirmedBy(hash: SHA256Hash): Promise<SHA256IdHash<Person>[]> {
        return this.certifiedBy(hash, 'AffirmationCertificate');
    }

    // ######## Update internal data structures ########

    /**
     * Updates this.personRightsMap
     */
    private async updatePersonRightsMap(): Promise<void> {
        for (const person of await this.getAllPersonsFromLeute()) {
            const rights = {
                rightToDeclareTrustedKeysForEverybody: false,
                rightToDeclareTrustedKeysForSelf: false
            };

            const certs = await this.getCertificates(person);
            for (const cert of certs) {
                if (!(await this.isSignedByRootKey(cert.signature))) {
                    continue;
                }

                if (
                    cert.certificate.$type$ === 'RightToDeclareTrustedKeysForEverybodyCertificate'
                ) {
                    rights.rightToDeclareTrustedKeysForEverybody = true;
                }
                if (cert.certificate.$type$ === 'RightToDeclareTrustedKeysForSelfCertificate') {
                    rights.rightToDeclareTrustedKeysForSelf = true;
                }
            }

            this.personRightsMap.set(person, rights);
        }
    }

    /**
     * Updates this.keysToProfileMap and this.keysOfPerson
     */
    private async updateKeysMaps(): Promise<void> {
        const me = await this.leute.me();
        const others = await this.leute.others();

        for (const someone of [me, ...others]) {
            for (const identity of someone.identities()) {
                for (const profileModel of await someone.profiles(identity)) {
                    const profileIdHash = profileModel.idHash;
                    const newMapIdEntry = new Map<SHA256Hash<Profile>, ProfileData>();
                    for (const versionMapEntry of await getAllVersionMapEntries(profileIdHash)) {
                        const profileHash = versionMapEntry.hash;
                        await profileModel.loadVersion(profileHash);
                        const profileData = await this.getProfileData(
                            profileHash,
                            versionMapEntry.timestamp
                        );

                        if (identity !== profileData.personId) {
                            console.error(
                                `While building the trust maps we found a profile assigned to the wrong someone. This is a serious issue: profileIdHash=${profileIdHash} profileHash=${profileHash} someoneIdHash=${someone.idHash} identity=${identity} profilePersonId=${profileData.personId}`
                            );
                            continue;
                        }

                        // Fill keys and keysOfPerson map
                        for (const key of profileData.keys) {
                            getOrCreate(this.keysToProfileMap, key, () => new Map()).set(
                                profileData.profileHash,
                                profileData
                            );
                            getOrCreate(
                                this.keysOfPerson,
                                profileData.personId,
                                () => new Set()
                            ).add(key);
                        }
                    }
                }
            }
        }
    }

    // ######## Helpers for update* functions ########

    /**
     * Collects all interesting data about a profile - like certificates etc.
     *
     * @param profileHash
     * @param timestamp
     */
    private async getProfileData(
        profileHash: SHA256Hash<Profile>,
        timestamp: number
    ): Promise<ProfileData> {
        const profile = await ProfileModel.constructFromVersion(profileHash);
        const keys = profile.descriptionsOfType('SignKey');

        return {
            personId: profile.personId,
            owner: profile.owner,
            profileId: profile.profileId,

            profileHash: profileHash,
            profileIdHash: profile.idHash,

            timestamp,

            keys: keys.map(k => k.key),

            certificates: [
                ...(await this.getCertificatesOfType(profileHash, 'AffirmationCertificate')),
                ...(await this.getCertificatesOfType(profileHash, 'TrustKeysCertificate'))
            ]
        };
    }

    /**
     * Gets a list of all persons from leute by iterating all someones.
     */
    private async getAllPersonsFromLeute(): Promise<SHA256IdHash<Person>[]> {
        const me = await this.leute.me();
        const others = await this.leute.others();

        const persons = [];
        for (const someone of [me, ...others]) {
            persons.push(...someone.identities());
        }

        return persons;
    }

    /**
     * DP algorithm that determines trust for a key based on root keys.
     *
     * @param key
     * @param rootKeys
     * @param keyStack
     */
    private getKeyTrustInfoDP(
        key: HexString,
        rootKeys: KeyTrustInfo[],
        keyStack: HexString[]
    ): KeyTrustInfo {
        // Prevents endless loops by using a stack of keys
        if (keyStack.includes(key)) {
            return {
                key,
                trusted: false,
                sources: [],
                reason: 'endless loop'
            };
        }
        keyStack.push(key);

        try {
            const cache = this.keysTrustCache.get(key);
            if (cache !== undefined) {
                return cache;
            }

            // Get the data of profiles that contain this key
            const profileDataList = this.keysToProfileMap.get(key);
            if (profileDataList === undefined) {
                return {
                    key,
                    trusted: false,
                    sources: [],
                    reason: 'no profiles contain this key'
                };
            }

            // Iterate over all profiles and determine if the profile and its keys is trusted
            const keyTrustInfo: KeyTrustInfo = {
                key,
                trusted: false,
                sources: [],
                reason: 'no certificate found that applies trust'
            };

            for (const profileData of profileDataList.values()) {
                for (const certificate of profileData.certificates) {
                    // Step 1: Determine which key was used for creating the signature
                    let usedSignKey: HexString;
                    {
                        const issuerKeys = this.keysOfPerson.get(certificate.signature.issuer);
                        if (issuerKeys === undefined) {
                            continue;
                        }

                        const matchedKey = verifySignatureWithMultipleHexKeys(
                            [...issuerKeys],
                            certificate.signature
                        );

                        if (matchedKey === undefined) {
                            continue;
                        }

                        usedSignKey = matchedKey;
                    }

                    // Step 2: Determine which rights the issuer has
                    const rights = this.personRightsMap.get(certificate.signature.issuer) || {
                        rightToDeclareTrustedKeysForEverybody: false,
                        rightToDeclareTrustedKeysForSelf: false
                    };

                    // Step 3: Based on rights and certificate type inherit the trust
                    if (
                        (certificate.certificate.$type$ === 'TrustKeysCertificate' &&
                            rights.rightToDeclareTrustedKeysForEverybody) ||
                        (certificate.certificate.$type$ === 'AffirmationCertificate' &&
                            rights.rightToDeclareTrustedKeysForSelf)
                    ) {
                        const trustOfCertificate = this.getKeyTrustInfoDP(
                            usedSignKey,
                            rootKeys,
                            keyStack
                        );

                        if (trustOfCertificate.trusted) {
                            keyTrustInfo.trusted = true;
                            keyTrustInfo.reason = '';
                            keyTrustInfo.sources.push({
                                issuer: certificate.signature.issuer,
                                certificateType: certificate.certificate.$type$,
                                keyTrustInfo
                            });
                        }
                    }
                }
            }

            return keyTrustInfo;
        } finally {
            keyStack.pop();
        }
    }
}

function verifySignatureWithMultipleKeys(
    keys: PublicSignKey[],
    signature: Signature
): PublicSignKey | undefined {
    for (const key of keys) {
        if (verifySignatureWithSingleKey(key, signature)) {
            return key;
        }
    }

    return undefined;
}

function verifySignatureWithMultipleHexKeys<KeyT extends PublicSignKey | HexString>(
    keys: HexString[],
    signature: Signature
): HexString | undefined {
    const binaryKeys = keys.map(k => ensurePublicSignKey(hexToUint8Array(k)));

    const matchedKey = verifySignatureWithMultipleKeys(binaryKeys, signature);

    if (matchedKey === undefined) {
        return undefined;
    }

    return keys[binaryKeys.findIndex(k => k === matchedKey)];
}

function verifySignatureWithSingleKey(key: PublicSignKey, signature: Signature): boolean {
    return tweetnacl.sign.detached.verify(
        new TextEncoder().encode(signature.data), // string -> utf8 UInt8Array
        hexToUint8Array(signature.signature), // hex string -> UInt8Array (binary)
        key
    );
}
