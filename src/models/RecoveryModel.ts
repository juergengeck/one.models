import {deriveBinaryKey, scrypt} from 'one.core/lib/system/crypto-scrypt';
import {
    decryptSecretKey,
    decryptWithSymmetricKey,
    encryptWithSymmetricKey,
    stringToUint8Array,
    Uint8ArrayToString
} from 'one.core/lib/instance-crypto';
import tweetnacl from 'tweetnacl';
import {fromByteArray, toByteArray} from 'base64-js';
import ConnectionsModel from './ConnectionsModel';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {getObjectByIdHash} from 'one.core/lib/storage';
import {Person, SHA256IdHash} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {randomBytes} from 'crypto';
import CommunicationInitiationProtocol from '../misc/CommunicationInitiationProtocol';

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
    private password: string;

    constructor(connectionsModel: ConnectionsModel) {
        // default length for the recovery key
        this.stringLength = 19;
        this.connectionsModel = connectionsModel;
        this.password = '';
    }

    /**
     * The password needs to be memorised for personal cloud connections authentication.
     *
     * TODO: remove me and ask the user instead. Long term storage is a bad idea!
     *
     * @param {string} password
     */
    public setPassword(password: string) {
        this.password = password;
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
        if (this.password === '') {
            throw new Error(
                'Can not generate recovery file without knowing the instance password!'
            );
        }

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
        // extract the decrypted private person keys
        const personPrivateKeys = await this.extractDecryptedPrivateKeysForPerson(
            privatePersonInformation.personId
        );
        const personPrivateKey = personPrivateKeys.privateKey;
        const personPrivateSignKey = personPrivateKeys.privateSignKey;
        // extract the person email
        const person = await getObjectByIdHash(privatePersonInformation.personId);
        const personEmail = person.obj.email;
        // extract anon person key information in order to integrate it in the url
        const anonPersonPublicKey = privatePersonInformation.anonPersonPublicKey;
        const anonPersonPublicSignKey = privatePersonInformation.anonPersonPublicSignKey;
        // extract the decrypted private anonymous person keys
        const anonPersonPrivateKeys = await this.extractDecryptedPrivateKeysForPerson(
            privatePersonInformation.anonPersonId
        );
        const anonPersonPrivateKey = anonPersonPrivateKeys.privateKey;
        const anonPersonPrivateSignKey = anonPersonPrivateKeys.privateSignKey;
        // extract the anonymous person email
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

        this.password = '';

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
            personPrivateKey: await this.encryptPersonPrivateKey(
                this.decryptedObject.personPrivateKey
            ),
            personPrivateSignKey: await this.encryptPersonPrivateKey(
                this.decryptedObject.personPrivateSignKey
            ),
            anonPersonId,
            anonPersonPublicKey: this.decryptedObject.anonPersonPublicKey,
            anonPersonPublicSignKey: this.decryptedObject.anonPersonPublicSignKey,
            anonPersonPrivateKey: await this.encryptPersonPrivateKey(
                this.decryptedObject.anonPersonPrivateKey
            ),
            anonPersonPrivateSignKey: await this.encryptPersonPrivateKey(
                this.decryptedObject.anonPersonPrivateSignKey
            )
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

    private async extractDecryptedPrivateKeysForPerson(
        personId: SHA256IdHash<Person>
    ): Promise<{
        privateKey: string;
        privateSignKey: string;
    }> {
        if (this.password === '') {
            throw new Error('Can not decrypt person keys without knowing the instance password!');
        }

        // obtain the person keys
        const personKeyLink = await getAllValues(personId, true, 'Keys');
        // obtain the decrypted person key
        const personPrivateEncryptionKey = await decryptSecretKey(
            this.password,
            `${personKeyLink[personKeyLink.length - 1].toHash}.owner.encrypt`
        );
        // obtain the decrypted person sign key
        const personPrivateSignKey = await decryptSecretKey(
            this.password,
            `${personKeyLink[personKeyLink.length - 1].toHash}.owner.sign`
        );

        if (personPrivateEncryptionKey === null || personPrivateSignKey === null) {
            throw new Error('Person keys could not be decrypted for the recovery information.');
        }

        return {
            privateKey: fromByteArray(personPrivateEncryptionKey),
            privateSignKey: fromByteArray(personPrivateSignKey)
        };
    }

    private async encryptPersonPrivateKey(keyAsString: string): Promise<string> {
        const key = toByteArray(keyAsString);
        const nonce = randomBytes(tweetnacl.secretbox.nonceLength);
        const derivedKey = await deriveBinaryKey(
            this.password,
            nonce,
            tweetnacl.secretbox.keyLength
        );
        const encrypted = tweetnacl.secretbox(key, nonce, derivedKey);
        const encryptedKey = new Uint8Array(tweetnacl.secretbox.nonceLength + encrypted.byteLength);
        encryptedKey.set(nonce, 0);
        encryptedKey.set(encrypted, nonce.byteLength);
        return fromByteArray(encryptedKey);
    }
}
