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
import type ConnectionsModel from './ConnectionsModel';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {getObjectByIdHash} from 'one.core/lib/storage';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {randomBytes} from 'crypto';
import type CommunicationInitiationProtocol from '../misc/CommunicationInitiationProtocol';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {Person} from 'one.core/lib/recipes';
import {Model} from './Model';

type PPersonInformationMessage = CommunicationInitiationProtocol.PrivatePersonInformationMessage;

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
}

/**
 * This model is responsible for generating the information which will
 * be added in the recovery url and for extracting the data from the
 * recovery url.
 */
export default class RecoveryModel extends Model {
    private readonly recoveryKeyLength: number;
    private connectionsModel: ConnectionsModel;
    private decryptedObject: PersonInformation | undefined;
    private password: string;

    constructor(connectionsModel: ConnectionsModel) {
        super();
        // default length for the recovery key
        this.recoveryKeyLength = 19;
        this.connectionsModel = connectionsModel;
        this.password = '';

        this.state.triggerEvent('init');
    }

    /**
     * The password needs to be memorised for encrypting and decrypting private person keys.
     *
     * This will be deleted after the recovery file is created or if the model was
     * initialised for the recovery process.
     *
     * TODO: remove me and ask the user instead. Long term storage is a bad idea!
     *
     * @param password
     */
    public setPassword(password: string) {
        this.state.assertCurrentState('Initialised');

        this.password = password;
    }

    async shutdown(): Promise<void> {
        this.state.triggerEvent('shutdown');
    }

    /**
     * Extract all person information and encrypt them using the
     * recovery nonce and recovery key.
     *
     * The person private keys are decrypted before creating the
     * person information object.
     *
     * @returns
     */
    async extractEncryptedPersonInformation(): Promise<{
        recoveryKey: string;
        recoveryNonce: string;
        encryptedPersonInformation: string;
    }> {
        this.state.assertCurrentState('Initialised');

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

        // extract all information for main person and anonymous
        // person that will be encrypted and added in the url
        const objectToEncrypt = await this.extractPersonInformation();

        // encrypt the persons information with the recovery nonce and recovery key
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
     * This is the first step in the recovery process.
     *
     * When the recovery process is started the first values that are required
     * are the person email and the anonymous person email.
     *
     * Using the encrypted recovery information and the recovery nonce from the
     * url and the recovery key which was entered by the user this function
     * decrypts the person information and returns the user email and the
     * anonymous person email.
     *
     * The decrypted data will be saved in memory until the next step in the
     * recovery process (overwritePersonKeyWithReceivedEncryptedOnes function).
     *
     * @param recoveryKey
     * @param recoveryNonce
     * @param encryptedPersonInformation
     * @returns
     */
    async decryptReceivedRecoveryInformation(
        recoveryKey: string,
        recoveryNonce: string,
        encryptedPersonInformation: string
    ): Promise<string> {
        this.state.assertCurrentState('Initialised');

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

        return this.decryptedObject.personEmail;
    }

    /**
     * This is the second and last step in the recovery process.
     * Before calling this function the decryptReceivedRecoveryInformation
     * function should be called in order to decrypt the received data and
     * to memorise it for this step.
     *
     * In recovery process a new person is created with the received email, but
     * since the keys are different every time they are created, we need to overwrite
     * the new created person keys with the old ones because the person is the same
     * so the keys have to be the same also.
     *
     * The received person private keys are decrypted, so before memorising them
     * we first need to encrypt the received private keys with the new password.
     *
     * The password must be set before this function is called.
     */
    async overwritePersonKeyWithReceivedEncryptedOnes(): Promise<void> {
        this.state.assertCurrentState('Initialised');

        if (!this.decryptedObject) {
            throw new Error('Received recovery information not found.');
        }

        const personId = await calculateIdHashOfObj({
            $type$: 'Person',
            email: this.decryptedObject.personEmail
        });

        // overwrite person keys with the old ones
        // for private keys we first need to encrypt them with the new password
        const privatePersonInformation: PPersonInformationMessage = {
            command: 'private_person_information',
            personId,
            personPublicKey: this.decryptedObject.personPublicKey,
            personPublicSignKey: this.decryptedObject.personPublicSignKey,
            personPrivateKey: await this.encryptPersonPrivateKey(
                this.decryptedObject.personPrivateKey
            ),
            personPrivateSignKey: await this.encryptPersonPrivateKey(
                this.decryptedObject.personPrivateSignKey
            )
        };
        await this.connectionsModel.overwriteExistingPersonKeys(privatePersonInformation);

        // remove from memory the decrypted person information because it's not important anymore
        this.decryptedObject = undefined;
    }

    // ######## Private API ########

    /**
     * For the recovery key we need a simple string random generator which will return
     * a user friendly string, which will be easy to read for the user.
     *
     * A user friendly string or a readable string can not contain o, O and 0, I and l.
     *
     * @returns
     * @private
     */
    private generateRandomReadableString(): string {
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz.-_=!';
        let randomstring = '';
        for (let i = 0; i < this.recoveryKeyLength; i++) {
            const randomNumber = Math.floor(Math.random() * chars.length);
            randomstring += chars.substring(randomNumber, randomNumber + 1);
        }
        return randomstring;
    }

    /**
     * For extracting the persons information the extractExistingPersonKeys function
     * from ConnectionsModel is used.
     *
     * The private keys are decrypted before being added to the person information
     * object.
     *
     * @returns
     * @private
     */
    private async extractPersonInformation(): Promise<PersonInformation> {
        // extract main person and anonymous person public and encrypted private keys
        const privatePersonInformation = await this.connectionsModel.extractExistingPersonKeys();
        // extract main person public keys
        const personPublicKey = privatePersonInformation.personPublicKey;
        const personPublicSignKey = privatePersonInformation.personPublicSignKey;
        // decrypt main person private keys
        const personPrivateKeys = await this.extractDecryptedPrivateKeysForPerson(
            privatePersonInformation.personId
        );
        const personPrivateKey = personPrivateKeys.privateKey;
        const personPrivateSignKey = personPrivateKeys.privateSignKey;
        // extract the main person email
        const person = await getObjectByIdHash(privatePersonInformation.personId);
        const personEmail = person.obj.email;

        // create the person information object which will be encrypted and added in the url
        return {
            personEmail: personEmail,
            personPublicKey: personPublicKey,
            personPublicSignKey: personPublicSignKey,
            personPrivateKey: personPrivateKey,
            personPrivateSignKey: personPrivateSignKey
        };
    }

    /**
     * Decrypt the private keys for the person received as parameter.
     *
     * The password must be set before this function is called.
     *
     * @param personId
     * @returns
     * @private
     */
    private async extractDecryptedPrivateKeysForPerson(personId: SHA256IdHash<Person>): Promise<{
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

    /**
     * Encrypt the private key received as parameter using the
     * password from memory.
     *
     * The private keys will be memorised in the ConnectionsModel
     * overwriteExistingPersonKeys function.
     *
     * The password must be set before this function is called.
     *
     * @param keyAsString
     * @returns
     * @private
     */
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
