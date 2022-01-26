import type {OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import {SignatureReverseMaps} from './SignatureRecipes';
import {CertificateReverseMaps} from './CertificateRecipes';

const ReverseMapsExperimental: [OneObjectTypeNames, Set<string>][] = [
    ...SignatureReverseMaps,
    ...CertificateReverseMaps
];

export default ReverseMapsExperimental;
