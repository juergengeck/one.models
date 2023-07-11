import type {OneCertificateInterfaces} from '@OneObjectInterfaces';
import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import {
    AccessUnversionedObjectCertificateRecipe,
    AccessUnversionedObjectCertificateReverseMap
} from './AccessUnversionedObjectCertificate';
import {
    AccessVersionedObjectCertificateRecipe,
    AccessVersionedObjectCertificateReverseMap
} from './AccessVersionedObjectCertificate';
import {
    AffirmationCertificateRecipe,
    AffirmationCertificateReverseMap
} from './AffirmationCertificate';
import {LicenseRecipe, LicenseReverseMap} from './License';
import {RelationCertificateRecipe, RelationCertificateReverseMap} from './RelationCertificate';
import {
    RightToDeclareTrustedKeysForEverybodyCertificateRecipe,
    RightToDeclareTrustedKeysForEverybodyCertificateReverseMap
} from './RightToDeclareTrustedKeysForEverybodyCertificate';
import {
    RightToDeclareTrustedKeysForSelfCertificateRecipe,
    RightToDeclareTrustedKeysForSelfCertificateReverseMap
} from './RightToDeclareTrustedKeysForSelfCertificate';
import {TrustKeysCertificateRecipe, TrustKeysCertificateReverseMap} from './TrustKeysCertificate';

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
