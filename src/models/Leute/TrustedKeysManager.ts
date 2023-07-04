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
    /*private keys = new Map<
        SHA256IdHash<Person>,
        Map<
            HexString,
            {
                trusted: boolean;
                trustReason: string;
                source: string;
            }
        >
    >();*/

    profilesMap = new Map<SHA256IdHash<Profile>, Map<SHA256Hash<Profile>, ProfileData>>();
    keysToProfileMap = new Map<HexString, Map<SHA256Hash<Profile>, ProfileData>>();
    keysOfPerson = new Map<SHA256IdHash<Person>, Set<HexString>>();
    keysTrustCache = new Map<HexString, KeyTrustInfo>();

    personRightsMap = new Map<
        SHA256IdHash<Person>,
        {
            rightToDeclareTrustedKeysForEverybody: boolean;
            rightToDeclareTrustedKeysForSelf: boolean;
        }
    >();

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

    // #### Person certificates ####

    async getKeyTrustInfo(key: HexString): Promise<KeyTrustInfo> {
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

                        const matchedKey = TrustedKeysManager.verifySignatureWithMultipleHexKeys(
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

    private async getAllPersons(): Promise<SHA256IdHash<Person>[]> {
        const me = await this.leute.me();
        const others = await this.leute.others();

        const persons = [];
        for (const someone of [me, ...others]) {
            persons.push(...someone.identities());
        }

        return persons;
    }

    async getTrustedKeysForPerson(person: SHA256IdHash<Person>): Promise<PublicSignKey[]> {
        return [];
    }

    async checkCertificatesForKey<CertT extends OneObjectTypeNames>(
        keyToCheck: HexString,
        trustedKeys: PublicSignKey[],
        type: CertT
    ): Promise<boolean> {
        const keys =
            this.keysToProfileMap.get(keyToCheck) || new Map<SHA256Hash<Profile>, ProfileData>();

        for (const profileData of keys.values()) {
            const certs = profileData.certificates.filter(c => c.certificate.$type$ === type);
            for (const cert of certs) {
                if (
                    TrustedKeysManager.verifySignatureWithMultipleKeys(
                        trustedKeys,
                        cert.signature
                    ) !== undefined
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    async isSignedByRootKey(signature: Signature, mode: RootKeyMode = 'MainId'): Promise<boolean> {
        const me = await this.leute.me();
        const myMainId = await me.mainIdentity();

        if (signature.issuer !== myMainId) {
            return false;
        }

        const trustedKeys = await this.getRootKeys(mode);
        return (
            TrustedKeysManager.verifySignatureWithMultipleKeys(trustedKeys, signature) !== undefined
        );
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

    async verifySignature(signature: Signature): Promise<boolean> {
        const trustedKeys = await this.getTrustedKeysForPerson(signature.issuer);
        return (
            TrustedKeysManager.verifySignatureWithMultipleKeys(trustedKeys, signature) !== undefined
        );
    }

    static verifySignatureWithMultipleKeys(
        keys: PublicSignKey[],
        signature: Signature
    ): PublicSignKey | undefined {
        for (const key of keys) {
            if (TrustedKeysManager.verifySignatureWithSingleKey(key, signature)) {
                return key;
            }
        }

        return undefined;
    }

    static verifySignatureWithMultipleHexKeys<KeyT extends PublicSignKey | HexString>(
        keys: HexString[],
        signature: Signature
    ): HexString | undefined {
        const binaryKeys = keys.map(k => ensurePublicSignKey(hexToUint8Array(k)));

        const matchedKey = TrustedKeysManager.verifySignatureWithMultipleKeys(
            binaryKeys,
            signature
        );

        if (matchedKey === undefined) {
            return undefined;
        }

        return keys[binaryKeys.findIndex(k => k === matchedKey)];
    }

    static verifySignatureWithSingleKey(key: PublicSignKey, signature: Signature): boolean {
        return tweetnacl.sign.detached.verify(
            new TextEncoder().encode(signature.data), // string -> utf8 UInt8Array
            hexToUint8Array(signature.signature), // hex string -> UInt8Array (binary)
            key
        );
    }

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
                    trusted: await this.verifySignature(signature)
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
     * Check if an affirmation certificate signed by a trusted key points to the passed data.
     *
     * @param hash
     */
    async isAffirmedByTrustedParty(hash: SHA256Hash): Promise<boolean> {
        return this.hasTrustedCertificateOfType(hash, 'AffirmationCertificate');
    }

    async hasTrustedCertificateOfType<CertT extends OneObjectTypeNames>(
        data: SHA256Hash | SHA256IdHash,
        type: CertT
    ): Promise<boolean> {
        const certs = await this.getCertificates(data);
        return certs.some(c => c.trusted && c.certificate.$type$ === type);
    }

    // ######## Update internal data structures ########

    /**
     * Updates this.personRightsMap
     */
    private async updatePersonRightsMap(): Promise<void> {
        for (const person of await this.getAllPersons()) {
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
}
