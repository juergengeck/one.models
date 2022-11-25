import type {OneVersionedObjectTypeNames} from '@refinio/one.core/lib/recipes';

// The recipe itself is covered by one.core, but this reverse map is needed by misc/instance.ts

export const InstanceReverseMapsForIdObjects: [OneVersionedObjectTypeNames, Set<string>][] = [
    ['Instance', new Set(['owner'])]
];
