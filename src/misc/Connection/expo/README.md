# Expo WebSocket Integration

This directory contains a lightweight, plugin-based WebSocket implementation optimized for Expo/React Native. It provides a robust foundation for real-time communication with features like connection state management, statistics tracking, and promise-based operations.

## Core Components

### ExpoConnection

The main connection class that wraps Expo's WebSocket functionality. It provides:

- State management (connecting, open, closed)
- Event-based message handling
- Binary and text message support
- Plugin system for extensibility

```typescript
import { ExpoConnection } from './ExpoConnection';

const conn = new ExpoConnection('ws://example.com');
await conn.waitForOpen();
conn.send('Hello, server!');
```

### Plugins

The system includes several plugins for common functionality:

#### StatisticsPlugin
Tracks connection statistics like bytes sent/received:

```typescript
const stats = conn.statistics;
console.log(`Received: ${stats.bytesReceived} bytes`);
```

#### KeepAlivePlugin
Maintains connection health with periodic pings:

```typescript
const keepAlive = new KeepAlivePlugin({ interval: 30000 });
conn.addPlugin(keepAlive);
```

#### PromisePlugin
Adds promise-based message handling:

```typescript
const promisePlugin = new PromisePlugin();
conn.addPlugin(promisePlugin);

const response = await promisePlugin.sendAndWait({ type: 'query', data: 'info' });
```

## Support Classes

### MultiPromise
Utility class for managing multiple promises:

```typescript
const promise = new MultiPromise<string>();
promise.resolve('success');
await promise.promise;
```

### OEvent
Type-safe event emitter:

```typescript
const events = new OEvent<string>();
events.on((message) => console.log(message));
events.emit('Hello!');
```

## Features

- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Plugin System**: Extensible architecture for adding new functionality
- **Promise-Based**: Modern async/await API for easier development
- **State Management**: Robust connection state handling
- **Statistics**: Built-in tracking of connection metrics
- **Keep-Alive**: Automatic connection health monitoring
- **Binary Support**: Handles both text and binary messages
- **Error Handling**: Comprehensive error management

## Usage Examples

### Basic Connection

```typescript
const conn = new ExpoConnection('ws://example.com');

conn.on('message', (event) => {
    console.log('Received:', event.data);
});

await conn.waitForOpen();
conn.send('Hello!');
```

### With Plugins

```typescript
const conn = new ExpoConnection('ws://example.com');

// Add statistics tracking
const stats = new StatisticsPlugin();
conn.addPlugin(stats);

// Add keep-alive
const keepAlive = new KeepAlivePlugin({ interval: 30000 });
conn.addPlugin(keepAlive);

// Add promise support
const promise = new PromisePlugin();
conn.addPlugin(promise);

// Use promise-based messaging
const response = await promise.sendAndWait({ type: 'query' });
console.log('Response:', response);

// Check statistics
console.log(`Bytes sent: ${stats.bytesSent}`);
```

## Notes on Expo's WebSocket Limitations

- Binary message support may vary by platform
- Some WebSocket features might not be available in all Expo environments
- Connection timeouts should be handled appropriately for mobile networks

## Migration from Existing Code

When migrating from the existing WebSocket implementation:

1. Replace WebSocket instantiation with ExpoConnection
2. Update event handlers to use the new event types
3. Add desired plugins for needed functionality
4. Update message sending/receiving code to use the new API

## Best Practices

1. Always wait for connection before sending messages
2. Use appropriate timeouts for mobile networks
3. Implement reconnection logic for dropped connections
4. Monitor connection statistics for performance issues
5. Handle binary messages appropriately for your platform 