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
export type CommunicationEndpointTypes = OneInstanceEndpoint | Email;
export const CommunicationEndpointTypeNameSet = new Set<OneObjectTypeNames | '*'>([
    'OneInstanceEndpoint',
    'Email'
]);
export interface CommunicationEndpoint {}

export interface OneInstanceEndpoint extends CommunicationEndpoint {
    $type$: 'OneInstanceEndpoint';
    personId: SHA256IdHash<Person>;
    instanceId: SHA256IdHash<Instance>;
    personKeys: SHA256Hash<Keys> | undefined;
    instanceKeys: SHA256Hash<Keys>;
    url: string;
}

export interface Email extends CommunicationEndpoint {
    $type$: 'Email';
    email: string;
}

// #### Recipes ####

export const OneInstanceEndpointRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'OneInstanceEndpoint',
    rule: [
        {
            itemprop: 'personId',
            referenceToId: new Set(['Person'])
        },
        {
            itemprop: 'instanceId',
            referenceToId: new Set(['Instance'])
        },
        {
            itemprop: 'personKeys',
            referenceToObj: new Set(['Keys']),
            optional: true
        },
        {
            itemprop: 'instanceKeys',
            referenceToObj: new Set(['Keys'])
        },
        {
            itemprop: 'url',
            valueType: 'string'
        }
    ]
};

export const EmailRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Email',
    rule: [
        {
            itemprop: 'email',
            valueType: 'string'
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
