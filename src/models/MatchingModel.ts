import EventEmitter from "events";
import {
    UnversionedObjectResult,
} from "@OneCoreTypes";
import {
    onUnversionedObj,
} from 'one.core/lib/storage';

/**
 * Model that connects to the one.match server
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
}
