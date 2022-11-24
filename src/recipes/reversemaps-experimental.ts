import type {OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import {SignatureReverseMaps} from './SignatureRecipes';
import {CertificateReverseMaps} from './CertificateRecipes';
import {InstanceReverseMaps} from './InstanceRecipes';

const ReverseMapsExperimental: [OneObjectTypeNames, Set<string>][] = [
    ...SignatureReverseMaps,
    ...CertificateReverseMaps,
    ...InstanceReverseMaps
];

export default ReverseMapsExperimental;
