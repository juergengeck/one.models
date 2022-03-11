import Watchdog from '../../Watchdog';
import ConnectionPlugin from '../ConnectionPlugin';
import type {IConnection} from '../IConnection';

/**
 * Check if message is a pong.
 * @param message
 */
function isPong(message: Uint8Array | string): boolean {
    try {
        if (typeof message !== 'string') {
            return false;
        }
        const messageObj = JSON.parse(message);
        return messageObj.command === 'comm_pong';
    } catch (e) {
        return false;
    }
}

/**
 * Check if message is a ping.
 * @param message
 */
function isPing(message: Uint8Array | string): boolean {
    try {
        if (typeof message !== 'string') {
            return false;
        }
        const messageObj = JSON.parse(message);
        return messageObj.command === 'comm_ping';
    } catch (e) {
        return false;
    }
}

export class PingImplementation extends ConnectionPlugin {
    private readonly connection: IConnection;
    private readonly watchdog: Watchdog;
    private readonly pingWatchdog: Watchdog;

    constructor(connection: IConnection, pingInterval: number, roundTripTime: number = 2000) {
        super();

        this.connection = connection;
        this.watchdog = new Watchdog(pingInterval + roundTripTime);
        this.pingWatchdog = new Watchdog(pingInterval);
        this.watchdog.onTimeout(() => {
            this.connection.terminate('PingPong: Connection timed out.');
        });
        this.pingWatchdog.onTimeout(() => {
            this.sendPing(); // TODO the send method can't be the global send. It needs to be
            // the send for that specific level.
        });
    }

    transformIncomingMessage(message: Uint8Array | string): Uint8Array | string | null {
        // When we receive a pong we restart the watchdog (For the pinger)
        if (!isPong(message)) {
            this.watchdog.restart();
            this.pingWatchdog.restart();
            return null;
        }
        return message;
    }

    public enable() {
        this.watchdog.enable();
        this.pingWatchdog.enable();
    }

    public disable() {
        this.watchdog.disable();
        this.pingWatchdog.disable();
    }

    /**
     * Send Ping Message
     */
    private sendPing(): void {
        this.connection.send(JSON.stringify({command: 'comm_ping'}));
    }
}

export class PongImplementation extends ConnectionPlugin {
    private readonly connection: IConnection;
    private readonly watchdog: Watchdog;

    constructor(connection: IConnection, pingInterval: number, roundTripTime: number = 2000) {
        super();

        this.connection = connection;
        this.watchdog = new Watchdog(pingInterval + 2 * roundTripTime);
        this.watchdog.onTimeout(() => {
            this.connection.terminate('PingPong: Connection timed out.');
        });
    }

    transformIncomingMessage(message: Uint8Array | string): Uint8Array | string | null {
        if (!isPing(message)) {
            this.watchdog.restart();

            try {
                this.sendPong();
            } catch (err) {
                this.connection.terminate('PingPong: Sending pong failed.');
            }
            return null;
        }
        return message;
    }

    public enable() {
        this.watchdog.enable();
    }

    public disable() {
        this.watchdog.disable();
    }

    /**
     * Send Pong Message
     */
    private sendPong(): void {
        this.connection.send(JSON.stringify({command: 'comm_pong'}));
    }
}
