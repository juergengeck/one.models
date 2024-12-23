/**
 * Represents an event received from the WebSocket connection.
 * These events are processed through the plugin chain before being handled by the connection.
 */
export type ConnectionIncomingEvent =
    /** Received a message from the server */
    | {
          type: 'message';
          /** The message data, either as string or binary */
          data: Uint8Array | string;
      }
    /** Connection was successfully established */
    | {
          type: 'opened';
      }
    /** Connection was closed */
    | {
          type: 'closed';
          /** Reason for closure */
          reason: string;
          /** Whether the close was initiated locally or by the remote peer */
          origin: 'local' | 'remote';
      };

/**
 * Represents an event to be sent through the WebSocket connection.
 * These events are processed through the plugin chain before being sent.
 */
export type ConnectionOutgoingEvent =
    /** Send a message to the server */
    | {
          type: 'message';
          /** The message data to send, either as string or binary */
          data: Uint8Array | string;
      }
    /** Close the connection */
    | {
          type: 'close';
          /** Optional reason for closing */
          reason?: string;
          /** Whether to terminate immediately without waiting for acknowledgment */
          terminate: boolean;
      };

/**
 * Statistics about the connection's data transfer.
 */
export interface ConnectionStatistics {
    /** Number of bytes received */
    bytesReceived: number;
    /** Number of bytes sent */
    bytesSent: number;
}

/**
 * Base interface for all connection plugins.
 */
export interface ConnectionPlugin {
    /** Unique name of the plugin */
    readonly name: string;

    /**
     * Transform an incoming event.
     * @param event - The event to transform
     * @returns The transformed event, or null to stop event propagation
     */
    transformIncomingEvent?(event: ConnectionIncomingEvent): ConnectionIncomingEvent | null;

    /**
     * Transform an outgoing event.
     * @param event - The event to transform
     * @returns The transformed event, or null to stop event propagation
     */
    transformOutgoingEvent?(event: ConnectionOutgoingEvent): ConnectionOutgoingEvent | null;
} 