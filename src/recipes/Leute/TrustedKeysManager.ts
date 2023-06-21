import type {PublicKey} from '@refinio/one.core/lib/crypto/encryption';
import type {PublicSignKey} from '@refinio/one.core/lib/crypto/sign';
import {getDefaultKeys} from '@refinio/one.core/lib/keychain/keychain';
import type {
    OneObjectInterfaces,
    OneObjectTypeNames,
    OneObjectTypes,
    Person
} from '@refinio/one.core/lib/recipes';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {getAllVersionMapEntries} from '@refinio/one.core/lib/version-map-query';
import type {LeuteModel} from '../../models';
import ProfileModel from '../../models/Leute/ProfileModel';
import {getOrCreate} from '../../utils/MapUtils';
import type {AffirmationCertificate, TrustKeysCertificate} from '../CertificateRecipes';
import type {Signature} from '../SignatureRecipes';
import type {Profile} from './Profile';

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

export default class TrustedKeysManager {
    private leute: LeuteModel;

    constructor(leute: LeuteModel) {
        this.leute = leute;
    }

    /*getTrustedKeys(): Promise<
        Map<SHA256IdHash>,
        Array<{
            reason: string;
            key: PublicSignKey;
        }>
    > {}*/

    /*    async getTrustedKeysForPerson(person: SHA256IdHash<Person>): Promise<PublicSignKey[]> {
        // If we have a secret key we trust it unconditionally at the moment.
        if (hasDefaultKeys(person)) {
            await getDefaultKeys()
        }
        const defaultKey = await getDefaultKeys(person);
        defaultKey.
    }*/

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

            affirmationCertificates: await getCertificates(profileHash, 'AffirmationCertificate'),
            trustKeysCertificates: await getCertificates(profileHash, 'TrustKeysCertificate')
        };
    }
}

type ArrayElement<A> = A extends readonly (infer T)[] ? T : A;

type CertificateData<T extends OneObjectTypes> = {
    signature: Signature<T>;
    signatureHash: SHA256Hash<Signature<T>>;
    certificate: T;
    certificateHash: SHA256Hash<T>;
};

async function getCertificates<T extends OneObjectTypeNames>(
    data: SHA256Hash,
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
                signatureHash
            });
        }
    }

    return certificates;
}
