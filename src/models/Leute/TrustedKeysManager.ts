import type {PublicSignKey} from '@refinio/one.core/lib/crypto/sign';
import {getInstanceIdHash} from '@refinio/one.core/lib/instance';
import {getPublicKeys} from '@refinio/one.core/lib/keychain/key-storage-public';
import {getDefaultKeys, hasDefaultKeys} from '@refinio/one.core/lib/keychain/keychain';
import type {
    OneObjectInterfaces,
    OneObjectTypeNames,
    OneObjectTypes,
    Person
} from '@refinio/one.core/lib/recipes';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {getObjectByIdHash} from '@refinio/one.core/lib/storage-versioned-objects';
import {hexToUint8Array} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {getAllVersionMapEntries} from '@refinio/one.core/lib/version-map-query';
import tweetnacl from 'tweetnacl';
import type {LeuteModel} from '../index';
import ProfileModel from './ProfileModel';
import {getOrCreate} from '../../utils/MapUtils';
import type {AffirmationCertificate, TrustKeysCertificate} from '../../recipes/CertificateRecipes';
import type {Signature} from '../../recipes/SignatureRecipes';
import type {Profile} from '../../recipes/Leute/Profile';

export type CertificateData<T extends OneObjectTypes> = {
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
    trusted: boolean;
    trustReason: string;
    reason: string;

    personId: SHA256IdHash<Person>;
    owner: SHA256IdHash<Person>;
    profileId: string;

    profileHash: SHA256Hash<Profile>;
    profileIdHash: SHA256IdHash<Profile>;

    timestamp: number;

    affirmationCertificates: Array<CertificateData<AffirmationCertificate>>;
    trustKeysCertificates: Array<CertificateData<TrustKeysCertificate>>;
};

//type ArrayElement<A> = A extends readonly (infer T)[] ? T : A;

export default class TrustedKeysManager {
    private leute: LeuteModel;

    constructor(leute: LeuteModel) {
        this.leute = leute;
    }

    async init(): Promise<void> {}

    async shutdown(): Promise<void> {}

    async getTrustedKeysForPerson(person: SHA256IdHash<Person>): Promise<PublicSignKey[]> {
        // If we have a secret key we trust it unconditionally at the moment.
        if (await hasDefaultKeys(person)) {
            const defaultKeys = await getDefaultKeys(person);
            const keys = await getPublicKeys(defaultKeys);
            return [keys.publicSignKey];
        }

        return [];
    }

    async verifySignature(signature: Signature): Promise<boolean> {
        const trustedKeys = await this.getTrustedKeysForPerson(signature.issuer);
        for (const trustedKey of trustedKeys) {
            if (TrustedKeysManager.verifySignatureLowLevel(trustedKey, signature)) {
                return true;
            }
        }
        return false;
    }

    static verifySignatureLowLevel(key: PublicSignKey, signature: Signature): boolean {
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

    async buildCertificateMap(): Promise<void> {
        const profilesMap = new Map<SHA256IdHash<Profile>, Map<SHA256Hash<Profile>, ProfileData>>();
        const keys = new Map<HexString, ProfileData[]>();
        const keysForPerson = new Map<SHA256IdHash<Person>, HexString>();

        const me = await this.leute.me();
        const others = await this.leute.others();

        // Iterate over someones to get all identities and their profiles & extended data

        for (const someone of [me, ...others]) {
            for (const identity of someone.identities()) {
                for (const profileModel of await someone.profiles(identity)) {
                    const profileIdHash = profileModel.idHash;

                    const newMapIdEntry = new Map<SHA256Hash<Profile>, ProfileData>();

                    const profilesMapIdEntry = getOrCreate(
                        profilesMap,
                        profileModel.idHash,
                        () => new Map()
                    );

                    for (const versionMapEntry of await getAllVersionMapEntries(profileIdHash)) {
                        await profileModel.loadVersion(versionMapEntry.hash);
                        profilesMapIdEntry.set(
                            versionMapEntry.hash,
                            await this.getProfileData(
                                versionMapEntry.hash,
                                versionMapEntry.timestamp
                            )
                        );
                    }
                }
            }
        }
    }

    async getProfileData(
        profileHash: SHA256Hash<Profile>,
        timestamp: number
    ): Promise<ProfileData> {
        const profile = await ProfileModel.constructFromVersion(profileHash);

        return {
            trusted: false,
            trustReason: '',
            reason: 'N/A',

            personId: profile.personId,
            owner: profile.owner,
            profileId: profile.profileId,

            profileHash: profileHash,
            profileIdHash: profile.idHash,

            timestamp,

            affirmationCertificates: await this.getCertificatesOfType(
                profileHash,
                'AffirmationCertificate'
            ),
            trustKeysCertificates: await this.getCertificatesOfType(
                profileHash,
                'TrustKeysCertificate'
            )
        };
    }
}
