import EventEmitter from "events";
import {Supply, UnversionedObjectResult} from "@OneCoreTypes";
import {
    createSingleObjectThroughPurePlan,
    onUnversionedObj,
    SET_ACCESS_MODE,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {getInstanceOwnerIdHash} from "one.core/lib/instance";

/**
 * Model that implements functions for sending a supply and demand to the matching server
 */
export default class MatchingModel extends EventEmitter {
    async init() {
        this.registerHooks();
    }

    private registerHooks(): void {
        onUnversionedObj.addListener(async (caughtObject: UnversionedObjectResult) => {
            if (caughtObject.obj.$type$ === 'MatchResponse') {
                console.log(caughtObject);
            }
        });
    }

    async sendSupplyObject(supplyInput: string): Promise<void> {
        const supply = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/supply',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Supply',
                identity: 'local',
                match: supplyInput
            }
        )) as UnversionedObjectResult<Supply>;

        const matchServer = await calculateIdHashOfObj({
            $type$: 'Person',
            email: 'person@match.one'
        });

        // eslint-disable-next-line no-console
        console.log('sending supply object to match server');

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: supply.hash,
                    person: [matchServer, getInstanceOwnerIdHash()],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }
async sendDemandObject(demandInput: string): Promise<void> {
        const demand = (await createSingleObjectThroughPurePlan(
            {
                module: '@module/demand',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Demand',
                identity: 'local',
                match: demandInput
            }
        )) as UnversionedObjectResult<Supply>;

        const matchServer = await calculateIdHashOfObj({
            $type$: 'Person',
            email: 'person@match.one'
        });

        // eslint-disable-next-line no-console
        console.log('sending demand object to match server');

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: demand.hash,
                    person: [matchServer, getInstanceOwnerIdHash()],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }
}
