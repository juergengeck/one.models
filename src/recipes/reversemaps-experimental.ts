import type {OneObjectTypeNames, OneVersionedObjectTypeNames} from '@refinio/one.core/lib/recipes';
import {SignatureReverseMaps} from './SignatureRecipes';
import {CertificateReverseMaps} from './CertificateRecipes';
import {ProfileReverseMaps, ProfileReverseMapsForIdObjects} from './Leute/Profile';
import {CommunicationEndpointReverseMaps} from './Leute/CommunicationEndpoints';

export const ReverseMapsExperimental: [OneObjectTypeNames, Set<string>][] = [
    ...SignatureReverseMaps,
    ...CertificateReverseMaps,
    ...ProfileReverseMaps,
    ...CommunicationEndpointReverseMaps
];

export const ReverseMapsForIdObjectsExperimental: [OneVersionedObjectTypeNames, Set<string>][] = [
    ...ProfileReverseMapsForIdObjects
];
