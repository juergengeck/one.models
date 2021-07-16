import type WebSocket from 'isomorphic-ws';

/**
 * Creates a string that identifies the websocket.
 *
 * Perfect for writing debug messages, but imperfect for privacy. We should use pseudonyms for the debugging case and
 * <redacted> for productive versions.
 *
 * @param {WebSocket | null} ws - The websocket instance for which to generate the identifier.
 * @returns {string}
 */
export function wslogId(ws: WebSocket | null): string {
    // TODO: We should use pseudonyms based on an hashing algorithm or something, because we don't want to
    //  have ip addresses in the logs.

    try {
        // @ts-ignore
        if (!ws || !ws._socket) {
            return '<noinfo>';
        }

        // @ts-ignore
        return ws._socket.remoteAddress.toString() + ':' + ws._socket.remotePort.toString();
    } catch (e) {
        return '<noinfo>';
    }
}

/**
 * This prints the contents of the passed array buffer as hex values to the console.
 *
 * Good for debugging stuff.
 *
 * @param {string} name - Name that is prepended
 * @param {Uint8Array} data - The data to print
 */
export function printUint8Array(name: string, data: Uint8Array): void {
    console.log(' ---- ' + name + ': ' + Buffer.from(data).toString('hex'));
}
