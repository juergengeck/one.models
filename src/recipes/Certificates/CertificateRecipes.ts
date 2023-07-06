import type {OneUnversionedObjectInterfaces} from '@OneObjectInterfaces';
import type {OneCertificateInterfaces} from '@OneObjectInterfaces';
import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import {
    AccessUnversionedObjectCertificateRecipe,
    AccessUnversionedObjectCertificateReverseMap,
    AccessUnversionedObjectLicense
} from './AccessUnversionedObjectCertificate';
import {
    AccessVersionedObjectCertificateRecipe,
    AccessVersionedObjectCertificateReverseMap,
    AccessVersionedObjectLicense
} from './AccessVersionedObjectCertificate';
import type {AffirmationCertificate} from './AffirmationCertificate';
import {
    AffirmationCertificateRecipe,
    AffirmationCertificateReverseMap,
    AffirmationLicense
} from './AffirmationCertificate';
import type {License} from './License';
import {LicenseRecipe, LicenseReverseMap} from './License';
import {
    RelationCertificateRecipe,
    RelationCertificateReverseMap,
    RelationLicense
} from './RelationCertificate';
import {
    RightToDeclareTrustedKeysForEverybodyCertificateRecipe,
    RightToDeclareTrustedKeysForEverybodyCertificateReverseMap,
    RightToDeclareTrustedKeysForEverybodyLicense
} from './RightToDeclareTrustedKeysForEverybodyCertificate';
import {
    RightToDeclareTrustedKeysForSelfCertificateRecipe,
    RightToDeclareTrustedKeysForSelfCertificateReverseMap,
    RightToDeclareTrustedKeysForSelfLicense
} from './RightToDeclareTrustedKeysForSelfCertificate';
import {
    TrustKeysCertificateRecipe,
    TrustKeysCertificateReverseMap,
    TrustKeysLicense
} from './TrustKeysCertificate';

export const CertificateReverseMaps: [OneObjectTypeNames, Set<string>][] = [
    AccessUnversionedObjectCertificateReverseMap,
    AccessVersionedObjectCertificateReverseMap,
    AffirmationCertificateReverseMap,
    LicenseReverseMap,
    RelationCertificateReverseMap,
    RightToDeclareTrustedKeysForEverybodyCertificateReverseMap,
    RightToDeclareTrustedKeysForSelfCertificateReverseMap,
    TrustKeysCertificateReverseMap
];

const Certificates: Recipe[] = [
    AccessUnversionedObjectCertificateRecipe,
    AccessVersionedObjectCertificateRecipe,
    AffirmationCertificateRecipe,
    LicenseRecipe,
    RelationCertificateRecipe,
    RightToDeclareTrustedKeysForEverybodyCertificateRecipe,
    RightToDeclareTrustedKeysForSelfCertificateRecipe,
    TrustKeysCertificateRecipe
];

declare module '@OneObjectInterfaces' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface OneCertificateInterfaces {
        // Empty by design
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface OneUnversionedObjectInterfaces extends OneCertificateInterfaces {
        // Empty by design
    }
}

export type OneCertificateTypes = OneCertificateInterfaces[keyof OneCertificateInterfaces];
export type OneCertificateTypeNames = keyof OneCertificateInterfaces;

export default Certificates;
