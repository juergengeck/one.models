import {box} from 'tweetnacl';
import {fromByteArray} from 'base64-js';
import {connectToOtherClient, registerClientAndWaitConnections} from './CommunicationServerClients';
import * as Logger from 'one.core/lib/logger';
Logger.start();

const firstClientKeys = box.keyPair();

registerClientAndWaitConnections(
    fromByteArray(firstClientKeys.publicKey),
    fromByteArray(firstClientKeys.secretKey)
);

setTimeout(async () => await connectToOtherClient(fromByteArray(firstClientKeys.publicKey)), 10000);
