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
    RelationCertificateReverseMap,
    RightToDeclareTrustedKeysForEverybodyCertificateReverseMap,
    RightToDeclareTrustedKeysForSelfCertificateReverseMap,
    TrustKeysCertificateReverseMap
];

const CertificateRecipes: Recipe[] = [
    AccessUnversionedObjectCertificateRecipe,
    AccessVersionedObjectCertificateRecipe,
    AffirmationCertificateRecipe,
    RelationCertificateRecipe,
    RightToDeclareTrustedKeysForEverybodyCertificateRecipe,
    RightToDeclareTrustedKeysForSelfCertificateRecipe,
    TrustKeysCertificateRecipe
];

export default CertificateRecipes;
