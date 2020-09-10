import {scrypt} from 'one.core/lib/system/crypto-scrypt';
import {
    decryptWithSymmetricKey,
    encryptWithSymmetricKey,
    stringToUint8Array,
    Uint8ArrayToString
} from 'one.core/lib/instance-crypto';
import tweetnacl from 'tweetnacl';
import {fromByteArray, toByteArray} from 'base64-js';
import ConnectionsModel from './ConnectionsModel';
import CommunicationInitiationProtocol from '../misc/CommunicationInitiationProtocol';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';

export default class RecoveryModel {
    private readonly stringLength: number;
    private recoveryNonceString: string;
    private recoveryKeyString: string;
    private connectionsModel: ConnectionsModel;

    constructor(connectionsModel: ConnectionsModel) {
        this.stringLength = 19;
        this.recoveryNonceString = fromByteArray(tweetnacl.randomBytes(64));
        this.recoveryKeyString = this.generateRandomReadableString();
        this.connectionsModel = connectionsModel;
    }

    public get recoveryNonce(): string {
        return this.recoveryNonceString;
    }

    public set recoveryNonce(newNonce: string) {
        this.recoveryNonceString = newNonce;
    }

    public get recoveryKey(): string {
        return this.recoveryKeyString;
    }

    public set recoveryKey(newKey: string) {
        this.recoveryKeyString = newKey;
    }

    async extractEncryptedPersonKeys(): Promise<string> {
        const derivedKey = await scrypt(
            stringToUint8Array(this.recoveryKeyString),
            toByteArray(this.recoveryNonceString)
        );

        const privatePersonInformation = await this.connectionsModel.extractExistingPersonKeys();

        // extract person key information in order in integrate it in the url
        const personPublicKey = privatePersonInformation.personPublicKey;
        const personPublicSignKey = privatePersonInformation.personPublicSignKey;
        const personPrivateKey = privatePersonInformation.personPrivateKey;
        const personPrivateSignKey = privatePersonInformation.personPrivateSignKey;
        // extract anon person key information in order to integrate it in the url
        const anonPersonPublicKey = privatePersonInformation.anonPersonPublicKey;
        const anonPersonPublicSignKey = privatePersonInformation.anonPersonPublicSignKey;
        const anonPersonPrivateKey = privatePersonInformation.anonPersonPrivateKey;
        const anonPersonPrivateSignKey = privatePersonInformation.anonPersonPrivateSignKey;

        const objectToEncrypt = {
            personPublicKey: personPublicKey,
            personPublicSignKey: personPublicSignKey,
            personPrivateKey: personPrivateKey,
            personPrivateSignKey: personPrivateSignKey,
            anonPersonPublicKey: anonPersonPublicKey,
            anonPersonPublicSignKey: anonPersonPublicSignKey,
            anonPersonPrivateKey: anonPersonPrivateKey,
            anonPersonPrivateSignKey: anonPersonPrivateSignKey
        };

        return Uint8ArrayToString(await encryptWithSymmetricKey(derivedKey, objectToEncrypt));
    }

    async overwritePersonKeyWithReceivedEncryptedOnes(
        encryptedPersonKeys: string,
        userEmail: string,
        anonymousEmail: string
    ): Promise<void> {
        const objectToDecrypt = stringToUint8Array(encryptedPersonKeys);
        const derivedKey = await scrypt(
            stringToUint8Array(this.recoveryKeyString),
            toByteArray(this.recoveryNonceString)
        );
        const decryptedObject = JSON.parse(
            Uint8ArrayToString(await decryptWithSymmetricKey(derivedKey, objectToDecrypt))
        );
        const personId = await calculateIdHashOfObj({
            $type$: 'Person',
            email: userEmail
        });
        const anonPersonId = await calculateIdHashOfObj({
            $type$: 'Person',
            email: anonymousEmail
        });

        // overwrite person keys with the old ones
        const privatePersonInformation: CommunicationInitiationProtocol.PrivatePersonInformationMessage = {
            command: 'private_person_information',
            personId,
            personPublicKey: decryptedObject.personPublicKey,
            personPublicSignKey: decryptedObject.personPublicSignKey,
            personPrivateKey: decryptedObject.personPrivateKey,
            personPrivateSignKey: decryptedObject.personPrivateSignKey,
            anonPersonId,
            anonPersonPublicKey: decryptedObject.anonPersonPublicKey,
            anonPersonPublicSignKey: decryptedObject.anonPersonPublicSignKey,
            anonPersonPrivateKey: decryptedObject.anonPersonPrivateKey,
            anonPersonPrivateSignKey: decryptedObject.anonPersonPrivateSignKey
        };
        await this.connectionsModel.overwriteExistingPersonKeys(privatePersonInformation);
    }

    private generateRandomReadableString(): string {
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz.-_=!?';
        let randomstring = '';
        for (let i = 0; i < this.stringLength; i++) {
            const randomNumber = Math.floor(Math.random() * chars.length);
            randomstring += chars.substring(randomNumber, randomNumber + 1);
        }
        return randomstring;
    }
}
