import {expect} from 'chai';
import EncryptionPlugin from '../lib/misc/Connections/plugins/EncryptionPlugin';

/**
 * Test for testing the encrypted connection
 */
describe('encrypted connection tests', () => {
    it('test the nonce counter conversion function', async function () {
        const one = EncryptionPlugin.nonceCounterToArray(1);
        expect(one).to.be.eql(
            new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
        );
        const tho = EncryptionPlugin.nonceCounterToArray(1000);
        expect(tho).to.be.eql(
            new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x03, 0xe8
            ])
        );
        const mil = EncryptionPlugin.nonceCounterToArray(1000000);
        expect(mil).to.be.eql(
            new Uint8Array([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0f, 0x42, 0x40
            ])
        );
    });
});
