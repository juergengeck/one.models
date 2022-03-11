export default class ConnectionPlugin {
    transformIncomingMessage(message: Uint8Array | string): Uint8Array | string | null {
        return message;
    }

    transformOutgoingMessage(message: Uint8Array | string): Uint8Array | string | null {
        return message;
    }
}
