import {platform} from 'one.core/lib/system/platform';
import {PLATFORMS} from 'one.core/lib/platforms';
import {KeyValueStore as NodeKeyValueStore} from './KeyValueStore';

/**
 * Retrieves the light storage based on the {@link platform}.
 * @type {Storage}
 */
export const KeyValueStore: Storage = (() => {
    // @ts-ignore - ignored because "This condition will always return 'false'
    // since the types '"node"' and '"browser"' have no overlap.". This happens
    // because the development of one models is always on NODE_JS, so checking for browser
    // results in the above error.
    if (platform === PLATFORMS.BROWSER) {
        return localStorage;
    }

    const {KeyValueStore: NodeLightStorage} = require('./KeyValueStore');
    return new NodeKeyValueStore();
})();
