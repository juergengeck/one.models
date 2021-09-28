import {platform} from 'one.core/lib/system/platform';
import {PLATFORMS} from 'one.core/lib/platforms';

/**
 * Retrieves the light storage based on the {@link platform}.
 * @type {Storage}
 */
export const LightStorage: Storage = (() => {
    // @ts-ignore - ignored because "This condition will always return 'false'
    // since the types '"node"' and '"browser"' have no overlap.". This happens
    // because the development of one models is always on NODE_JS, so checking for browser
    // results in the above error.
    if (platform === PLATFORMS.BROWSER) {
        return localStorage;
    }

    const {default: NodeLightStorage} = require('./NodeLightStorage');
    return new NodeLightStorage();
})();
