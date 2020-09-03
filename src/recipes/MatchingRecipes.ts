import {Recipe} from '@OneCoreTypes';

declare module '@OneCoreTypes' {
    export interface OneUnversionedObjectInterfaces {
        Supply: Supply;
        Demand: Demand;
        MatchResponse: MatchResponse;
        RequestCatalog: RequestCatalog;
    }

    export interface OneVersionedObjectInterfaces {
        SupplyMap: SupplyMap;
        DemandMap: DemandMap;
        MatchMap: MatchMap;
        Catalog: Catalog;
    }

    /**
     * @typedef {object} MatchResponse
     * @property {'MatchResponse'} type
     * @property {string} identity
     * @property {string} match
     */
    export interface MatchResponse {
        $type$: 'MatchResponse';
        identity: string;
        match: string;
        identityOfDemand: boolean;
    }

    /**
     * @typedef {object} Supply
     * @property {'Supply'} type
     * @property {string} identity
     * @property {string} match
     * @property {number} timestamp
     */
    export interface Supply {
        $type$: 'Supply';
        identity: string;
        match: string;
        isActive: boolean;
        timestamp: number;
    }

    /**
     * @typedef {object} Demand
     * @property {'Demand'} type
     * @property {string} identity
     * @property {string} match
     * @property {number} timestamp
     */
    export interface Demand {
        $type$: 'Demand';
        identity: string;
        match: string;
        isActive: boolean;
        timestamp: number;
    }

    /**
     * @typedef {object} SupplyMap
     * @property {'SupplyMap'} type
     * @property {string} name
     * @property {Map<string, Supply>} map
     */
    export interface SupplyMap {
        $type$: 'SupplyMap';
        name: string;
        map?: Map<string, Supply>;
    }

    /**
     * @typedef {object} RequestCatalog
     * @property {'RequestCatalog'} type
     * @property {string} identity
     * @property {number} timestamp
     */
    export interface RequestCatalog {
        $type$: 'RequestCatalog';
        identity: string;
        timestamp: number;
    }

    /**
     * @typedef {object} DemandMap
     * @property {'DemandMap'} type
     * @property {string} name
     * @property {Map<string, Demand>} map
     */
    export interface DemandMap {
        $type$: 'DemandMap';
        name: string;
        map?: Map<string, Demand>;
    }

    /**
     * contains all demands and supply tags for the catalog
     * @typedef {object} Catalog
     * @property {'Catalog'} type
     * @property {'string'} name
     * @property {Array<string>} array
     */
    export interface Catalog {
        $type$: 'Catalog';
        name: string;
        array: Array<string>;
    }

    /**
     * @typedef {object} MatchMap
     * @property {'MatchMap'} type
     * @property {string} name
     * @property Array<MatchResponse> array
     */
    export interface MatchMap {
        $type$: 'MatchMap';
        name: string;
        array?: Array<MatchResponse>;
    }
}

export const SupplyRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Supply',
    rule: [
        {
            itemprop: 'identity',
            valueType: 'string'
        },
        {
            itemprop: 'match',
            valueType: 'string'
        },
        {
            itemprop: 'isActive',
            valueType: 'boolean'
        },
        {
            itemprop: 'timestamp',
            valueType: 'number'
        }
    ]
};

export const DemandRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Demand',
    rule: [
        {
            itemprop: 'identity',
            valueType: 'string'
        },
        {
            itemprop: 'match',
            valueType: 'string'
        },
        {
            itemprop: 'isActive',
            valueType: 'boolean'
        },
        {
            itemprop: 'timestamp',
            valueType: 'number'
        }
    ]
};

export const SupplyMapRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'SupplyMap',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'map',
            valueType: 'Map'
        }
    ]
};

export const DemandMapRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DemandMap',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'map',
            valueType: 'Map'
        }
    ]
};
export const CatalogRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Catalog',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'array',
            list: 'orderedByONE'
        }
    ]
};

export const RequestCatalogRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'RequestCatalog',
    rule: [
        {
            itemprop: 'identity',
            valueType: 'string'
        },
        {
            itemprop: 'timestamp',
            valueType: 'number'
        }
    ]
};

export const MatchingResponseRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'MatchResponse',
    rule: [
        {
            itemprop: 'identity',
            valueType: 'string'
        },
        {
            itemprop: 'match',
            valueType: 'string'
        },
        {
            // will be true if the above identity belongs to
            // the person who has send the Demand object
            itemprop: 'identityOfDemand',
            valueType: 'boolean'
        }
    ]
};

export const MatchMapRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'MatchMap',
    rule: [
        {
            itemprop: 'name',
            valueType: 'string',
            isId: true
        },
        {
            itemprop: 'array',
            list: 'orderedByONE'
        }
    ]
};

// Export recipes
const MatchingRecipes: Recipe[] = [
    SupplyRecipe,
    DemandRecipe,
    SupplyMapRecipe,
    DemandMapRecipe,
    MatchingResponseRecipe,
    MatchMapRecipe,
    CatalogRecipe,
    RequestCatalogRecipe
];

export default MatchingRecipes;
