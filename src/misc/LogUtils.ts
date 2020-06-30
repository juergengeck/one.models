import WebSocket from "ws";

export function wslogId(ws: WebSocket | null): string {
    // TODO: We should use pseudonyms based on an hashing algorithm or somthing, because we don't want to
    //  have ip adresses in the logs.

    try {
        // @ts-ignore
        if (!ws || !ws._socket) {
            return '<noinfo>';
        }

        // @ts-ignore
        return ws._socket.remoteAddress.toString() + ':' + ws._socket.remotePort.toString();
    }
    catch(e) {
        return '<noinfo>'
    }
}

export function printUint8Array(name: string, data: Uint8Array): void {
    console.log(' ---- ' + name + ': ' + Buffer.from(data).toString('hex'));
}

