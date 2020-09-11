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

/**
 * For the recovery process the person email with the corresponding
 * person keys and the anonymous person email with the corresponding
 * person keys have to be encrypted and added to the recovery url in
 * order to have the same persons also after recovering the instance.
 */
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

/**
 * This model is responsible for generating the information which will
 * be added in the recovery url and for extracting the data from the
 * recovery url.
 */
export default class RecoveryModel {
    private readonly stringLength: number;
    private connectionsModel: ConnectionsModel;
    private decryptedObject: PersonInformation | undefined;

    constructor(connectionsModel: ConnectionsModel) {
        // default length for the recovery key
        this.stringLength = 19;
        this.connectionsModel = connectionsModel;
    }

    /**
     * Extract all person information and encrypt them using the recovery nonce
     * and recovery key.
     *
     * @returns {Promise<string>}
     */
    async extractEncryptedPersonInformation(): Promise<{
        recoveryKey: string;
        recoveryNonce: string;
        encryptedPersonInformation: string;
    }> {
        // generate a new nonce which will be used in encrypting the person information
        const recoveryNonce = fromByteArray(tweetnacl.randomBytes(64));
        // generate a new key which will be used together with
        // the nonce for encrypting the person information
        const recoveryKey = this.generateRandomReadableString();
        const derivedKey = await scrypt(
            stringToUint8Array(recoveryKey),
            toByteArray(recoveryNonce)
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

        // encrypt the person information with the recovery nonce and recovery key
        const encryptedPersonInformation = fromByteArray(
            await encryptWithSymmetricKey(derivedKey, objectToEncrypt)
        );

        return {
            recoveryKey: recoveryKey,
            recoveryNonce: recoveryNonce,
            encryptedPersonInformation: encryptedPersonInformation
        };
    }

    /**
     * When the recovery process is started the first values that are required
     * are the person email and the anonymous person email.
     *
     * Using the encrypted recovery information and the recovery nonce from the
     * url and the recovery key which was entered by the user this function
     * decrypts the person information and returns the user email and the
     * anonymous person email.
     *
     * @param {string} recoveryKey
     * @param {string} recoveryNonce
     * @param {string} encryptedPersonInformation
     * @returns {Promise<{personEmail: string, anonPersonEmail: string}>}
     */
    async decryptReceivedRecoveryInformation(
        recoveryKey: string,
        recoveryNonce: string,
        encryptedPersonInformation: string
    ): Promise<{personEmail: string; anonPersonEmail: string}> {
        const objectToDecrypt = toByteArray(encryptedPersonInformation);
        const derivedKey = await scrypt(
            stringToUint8Array(recoveryKey),
            toByteArray(recoveryNonce)
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

    /**
     * In recovery process a new person is created with the received email, but
     * since the keys are different every time they are created, we need to overwrite
     * the new created person keys with the old ones because the person is the same
     * so the keys have to be the same also.
     *
     * @returns {Promise<void>}
     */
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
        // remove from memory the decrypted person information because it's not important anymore
        this.decryptedObject = undefined;
    }

    /**
     * For the recovery key we need a simple string random generator which will return
     * a user friendly string, which will be easy to read for the user.
     *
     * A user friendly string or a readable string can not contain o, O and 0, I and l.
     *
     * @returns {string}
     * @private
     */
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
