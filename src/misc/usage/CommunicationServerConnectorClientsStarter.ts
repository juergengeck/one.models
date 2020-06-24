import {box} from 'tweetnacl';
import {fromByteArray} from 'base64-js';
import {
    connectToOtherClient,
    registerClientAndWaitConnectionsWithConnector
} from './CommunicationServerClients';
import * as Logger from 'one.core/lib/logger';
Logger.start();

const firstClientKeys = box.keyPair();

registerClientAndWaitConnectionsWithConnector(
    fromByteArray(firstClientKeys.publicKey),
    fromByteArray(firstClientKeys.secretKey)
);

setTimeout(async () => await connectToOtherClient(fromByteArray(firstClientKeys.publicKey)), 10000);
