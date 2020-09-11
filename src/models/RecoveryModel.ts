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
import {getObjectByIdHash} from 'one.core/lib/storage';

interface PersonInformation {
    personEmail: string;
    personPublicKey: string;
    personPublicSignKey: string;
    personPrivateKey: string;
    personPrivateSignKey: string;
    anonPersonPublicKey: string;
    anonPersonPublicSignKey: string;
    anonPersonPrivateKey: string;
    anonPersonPrivateSignKey: string;
    anonPersonEmail: string;
}

export default class RecoveryModel {
    private readonly stringLength: number;
    private recoveryNonceString: string;
    private recoveryKeyString: string;
    private connectionsModel: ConnectionsModel;
    private decryptedObject: PersonInformation | undefined;

    constructor(connectionsModel: ConnectionsModel) {
        this.stringLength = 19;
        this.recoveryNonceString = fromByteArray(tweetnacl.randomBytes(64));
        this.recoveryKeyString = this.generateRandomReadableString();
        this.connectionsModel = connectionsModel;
    }

    public get recoveryNonce(): string {
        return this.recoveryNonceString;
    }

    public get recoveryKey(): string {
        return this.recoveryKeyString;
    }

    async extractEncryptedPersonInformation(): Promise<string> {
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
        const person = await getObjectByIdHash(privatePersonInformation.personId);
        const personEmail = person.obj.email;
        // extract anon person key information in order to integrate it in the url
        const anonPersonPublicKey = privatePersonInformation.anonPersonPublicKey;
        const anonPersonPublicSignKey = privatePersonInformation.anonPersonPublicSignKey;
        const anonPersonPrivateKey = privatePersonInformation.anonPersonPrivateKey;
        const anonPersonPrivateSignKey = privatePersonInformation.anonPersonPrivateSignKey;
        const anonPerson = await getObjectByIdHash(privatePersonInformation.anonPersonId);
        const anonPersonEmail = anonPerson.obj.email;

        const objectToEncrypt: PersonInformation = {
            personEmail: personEmail,
            personPublicKey: personPublicKey,
            personPublicSignKey: personPublicSignKey,
            personPrivateKey: personPrivateKey,
            personPrivateSignKey: personPrivateSignKey,
            anonPersonPublicKey: anonPersonPublicKey,
            anonPersonPublicSignKey: anonPersonPublicSignKey,
            anonPersonPrivateKey: anonPersonPrivateKey,
            anonPersonPrivateSignKey: anonPersonPrivateSignKey,
            anonPersonEmail: anonPersonEmail
        };

        return fromByteArray(await encryptWithSymmetricKey(derivedKey, objectToEncrypt));
    }

    async decryptReceivedRecoveryInformation(
        recoveryKey: string,
        recoveryNonce: string,
        encryptedPersonInformation: string
    ): Promise<{personEmail: string; anonPersonEmail: string}> {
        this.recoveryKeyString = recoveryKey;
        this.recoveryNonceString = recoveryNonce;
        const objectToDecrypt = toByteArray(encryptedPersonInformation);
        const derivedKey = await scrypt(
            stringToUint8Array(this.recoveryKeyString),
            toByteArray(this.recoveryNonceString)
        );
        this.decryptedObject = JSON.parse(
            Uint8ArrayToString(await decryptWithSymmetricKey(derivedKey, objectToDecrypt))
        );

        if (!this.decryptedObject) {
            throw new Error('Received recovery information could not be decrypted.');
        }

        return {
            personEmail: this.decryptedObject.personEmail,
            anonPersonEmail: this.decryptedObject.anonPersonEmail
        };
    }

    async overwritePersonKeyWithReceivedEncryptedOnes(): Promise<void> {
        if (!this.decryptedObject) {
            throw new Error('Received recovery information not found.');
        }

        const personId = await calculateIdHashOfObj({
            $type$: 'Person',
            email: this.decryptedObject.personEmail
        });
        const anonPersonId = await calculateIdHashOfObj({
            $type$: 'Person',
            email: this.decryptedObject.anonPersonEmail
        });

        // overwrite person keys with the old ones
        const privatePersonInformation: CommunicationInitiationProtocol.PrivatePersonInformationMessage = {
            command: 'private_person_information',
            personId,
            personPublicKey: this.decryptedObject.personPublicKey,
            personPublicSignKey: this.decryptedObject.personPublicSignKey,
            personPrivateKey: this.decryptedObject.personPrivateKey,
            personPrivateSignKey: this.decryptedObject.personPrivateSignKey,
            anonPersonId,
            anonPersonPublicKey: this.decryptedObject.anonPersonPublicKey,
            anonPersonPublicSignKey: this.decryptedObject.anonPersonPublicSignKey,
            anonPersonPrivateKey: this.decryptedObject.anonPersonPrivateKey,
            anonPersonPrivateSignKey: this.decryptedObject.anonPersonPrivateSignKey
        };
        await this.connectionsModel.overwriteExistingPersonKeys(privatePersonInformation);
    }

    private generateRandomReadableString(): string {
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz.-_=!';
        let randomstring = '';
        for (let i = 0; i < this.stringLength; i++) {
            const randomNumber = Math.floor(Math.random() * chars.length);
            randomstring += chars.substring(randomNumber, randomNumber + 1);
        }
        return randomstring;
    }
}
