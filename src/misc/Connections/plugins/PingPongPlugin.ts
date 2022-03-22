import Watchdog from '../../Watchdog';
import ConnectionPlugin, {
    ConnectionIncomingEvent,
    ConnectionOutgoingEvent
} from '../ConnectionPlugin';

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

export class PingPlugin extends ConnectionPlugin {
    private readonly watchdog: Watchdog;
    private readonly pingWatchdog: Watchdog;

    constructor(pingInterval: number, roundTripTime: number = 2000) {
        super('ping');

        this.watchdog = new Watchdog(pingInterval + roundTripTime);
        this.pingWatchdog = new Watchdog(pingInterval);
        this.watchdog.onTimeout(() => {
            this.eventCreationFunctions.createOutogingEvent({
                type: 'close',
                reason: 'Ping: Connection timed out',
                terminate: true
            });
        });
        this.pingWatchdog.onTimeout(() => {
            this.eventCreationFunctions.createOutogingEvent({
                type: 'message',
                data: JSON.stringify({command: 'ping'})
            });
        });
    }

    public transformIncomingEvent(event: ConnectionIncomingEvent): ConnectionIncomingEvent | null {
        if (event.type === 'opened') {
            this.enable();
        }

        if (event.type === 'closed') {
            this.disable();
        }

        if (event.type === 'message') {
            if (isPong(event.data)) {
                this.watchdog.restart();
                this.pingWatchdog.restart();
                return null;
            }
        }

        return event;
    }

    public transformOutgoingEvent(event: ConnectionOutgoingEvent): ConnectionOutgoingEvent | null {
        return event;
    }

    public enable() {
        this.watchdog.enable();
        this.pingWatchdog.enable();
    }

    public disable() {
        this.watchdog.disable();
        this.pingWatchdog.disable();
    }
}

export class PongPlugin extends ConnectionPlugin {
    private readonly watchdog: Watchdog;

    constructor(pingInterval: number, roundTripTime: number = 2000) {
        super('pong');

        this.watchdog = new Watchdog(pingInterval + 2 * roundTripTime);
        this.watchdog.onTimeout(() => {
            this.eventCreationFunctions.createOutogingEvent({
                type: 'close',
                reason: 'Pong: Connection timed out',
                terminate: true
            });
        });
    }

    public transformIncomingEvent(event: ConnectionIncomingEvent): ConnectionIncomingEvent | null {
        if (event.type === 'opened') {
            this.enable();
        }

        if (event.type === 'closed') {
            this.disable();
        }

        if (event.type === 'message') {
            if (isPing(event.data)) {
                this.watchdog.restart();
                this.eventCreationFunctions.createOutogingEvent({
                    type: 'message',
                    data: JSON.stringify({command: 'pong'})
                });
                return null;
            }
        }

        return event;
    }

    public transformOutgoingEvent(event: ConnectionOutgoingEvent): ConnectionOutgoingEvent | null {
        return event;
    }

    public enable() {
        this.watchdog.enable();
    }

    public disable() {
        this.watchdog.disable();
    }
}
