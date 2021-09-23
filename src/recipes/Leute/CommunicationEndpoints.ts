import type {Instance, Keys, OneObjectTypeNames, Person, Recipe} from 'one.core/lib/recipes';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';

// #### Typescript interfaces ####

/**
 * This represents a way on how to communicate with a person.
 * examples:
 * - address
 * - telephone number
 * - one instance with keys
 */
export interface OneInstanceEndpoint {
    $type$: 'OneInstanceEndpoint';
    personId: SHA256IdHash<Person>;
    instanceId: SHA256IdHash<Instance>;
    personKeys: SHA256Hash<Keys> | undefined;
    instanceKeys: SHA256Hash<Keys>;
    url: string;
}

export interface Email {
    $type$: 'Email';
    email: string;
}

// #### type check magic ####

export type CommunicationEndpointInterfaces = {
    OneInstanceEndpoint: OneInstanceEndpoint;
    Email: Email;
};
export type CommunicationEndpointTypes =
    CommunicationEndpointInterfaces[keyof CommunicationEndpointInterfaces];
export type CommunicationEndpointTypeNames = keyof CommunicationEndpointInterfaces;
export const CommunicationEndpointTypeNameSet = new Set<OneObjectTypeNames | '*'>([
    'OneInstanceEndpoint',
    'Email'
]);

/**
 * Checks if the endpoint is of a specific enpoint type.
 *
 * @param endpoint
 * @param type
 */
export function isEndpointOfType<T extends CommunicationEndpointTypeNames>(
    endpoint: CommunicationEndpointTypes,
    type: T
): endpoint is CommunicationEndpointInterfaces[T] {
    return endpoint.$type$ === type;
}

// #### Recipes ####

export const OneInstanceEndpointRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'OneInstanceEndpoint',
    rule: [
        {
            itemprop: 'personId',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}
        },
        {
            itemprop: 'instanceId',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Instance'])}
        },
        {
            itemprop: 'personKeys',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['Keys'])},
            optional: true
        },
        {
            itemprop: 'instanceKeys',
            itemtype: {type: 'referenceToObj', allowedTypes: new Set(['Keys'])}
        },
        {
            itemprop: 'url',
            itemtype: {type: 'string'}
        }
    ]
};

export const EmailRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Email',
    rule: [
        {
            itemprop: 'email',
            itemtype: {type: 'string'}
        }
    ]
};

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        OneInstanceEndpoint: OneInstanceEndpoint;
        Email: Email;
    }
}

export default [OneInstanceEndpointRecipe, EmailRecipe];
