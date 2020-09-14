import {deriveBinaryKey, scrypt} from 'one.core/lib/system/crypto-scrypt';
import {
    decryptSecretKey,
    decryptWithSymmetricKey,
    encryptWithSymmetricKey,
    overwritePersonKeys,
    stringToUint8Array,
    Uint8ArrayToString
} from 'one.core/lib/instance-crypto';
import tweetnacl from 'tweetnacl';
import {fromByteArray, toByteArray} from 'base64-js';
import ConnectionsModel from './ConnectionsModel';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import {
    createSingleObjectThroughImpurePlan,
    getObjectByIdHash,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {Person, SHA256IdHash} from '@OneCoreTypes';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import {randomBytes} from 'crypto';
import {writeUTF8TextFile} from 'one.core/lib/system/storage-base';
import InstancesModel, {LocalInstanceInfo} from './InstancesModel';

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

    // Internal maps and lists (precomputed on init)
    private mainInstanceInfo: LocalInstanceInfo | null; // My person info
    private anonInstanceInfo: LocalInstanceInfo | null; // My person info - anonymous id -> TODO: should be removed in the future

    private readonly instancesModel: InstancesModel;

    constructor(connectionsModel: ConnectionsModel, instancesModel: InstancesModel) {
        // default length for the recovery key
        this.stringLength = 19;
        this.connectionsModel = connectionsModel;
        this.instancesModel = instancesModel;
        this.password = '';
        this.mainInstanceInfo = null;
        this.anonInstanceInfo = null;
    }

    /**
     * Initialize this module.
     *
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        await this.updateInstanceInfos();

        if (!this.mainInstanceInfo) {
            throw new Error('Programming error: mainInstanceInfo is not initialized');
        }
        if (!this.anonInstanceInfo) {
            throw new Error('Programming error: anonInstanceInfo is not initialized');
        }
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
        const personPrivateKeys = await RecoveryModel.extractDecryptedPrivateKeysForPerson(
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
        const anonPersonPrivateKeys = await RecoveryModel.extractDecryptedPrivateKeysForPerson(
            privatePersonInformation.personId
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

        // overwrite person keys with the old ones
        await this.overwritePersonKeys();

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

    private static async extractDecryptedPrivateKeysForPerson(
        personId: SHA256IdHash<Person>
    ): Promise<{
        privateKey: string;
        privateSignKey: string;
    }> {
        // Obtain the person keys
        const personKeyLink = await getAllValues(personId, true, 'Keys');
        const personPrivateEncryptionKey = await decryptSecretKey(
            '',
            `${personKeyLink[personKeyLink.length - 1].toHash}.owner.encrypt`
        );
        const personPrivateSignKey = await decryptSecretKey(
            '',
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

    private async writePrivateKey(
        secret: string,
        key: Uint8Array,
        filename: string
    ): Promise<void> {
        const nonce = randomBytes(tweetnacl.secretbox.nonceLength);
        const derivedKey = await deriveBinaryKey(secret, nonce, tweetnacl.secretbox.keyLength);
        const encrypted = tweetnacl.secretbox(key, nonce, derivedKey);
        const encryptedKey = new Uint8Array(tweetnacl.secretbox.nonceLength + encrypted.byteLength);
        encryptedKey.set(nonce, 0);
        encryptedKey.set(encrypted, nonce.byteLength);
        await writeUTF8TextFile(fromByteArray(encryptedKey), filename, 'private');
    }

    private async overwritePersonKeys(): Promise<void> {
        if (!this.decryptedObject) {
            throw new Error('Received recovery information not found.');
        }
        if (!this.mainInstanceInfo) {
            throw new Error('mainInstanceInfo not initialized.');
        }
        if (!this.anonInstanceInfo) {
            throw new Error('anonInstanceInfo not initialized.');
        }

        const personId = await calculateIdHashOfObj({
            $type$: 'Person',
            email: this.decryptedObject.personEmail
        });

        try {
            await getObjectByIdHash(personId);
        } catch (_) {
            throw new Error('Unknown person.');
        }
        // Save the public keys of main id
        const savedOwnerKeys = await createSingleObjectThroughImpurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Keys',
                owner: personId,
                publicKey: this.decryptedObject.personPublicKey,
                publicSignKey: this.decryptedObject.personPublicSignKey
            }
        );
        await this.writePrivateKey(
            this.password,
            toByteArray(this.decryptedObject.personPrivateKey),
            `${savedOwnerKeys.hash}.owner.encrypt`
        );
        await this.writePrivateKey(
            this.password,
            toByteArray(this.decryptedObject.personPrivateSignKey),
            `${savedOwnerKeys.hash}.owner.sign`
        );

        // Save the keys of the anonymous id
        const anonPersonId = await calculateIdHashOfObj({
            $type$: 'Person',
            email: this.decryptedObject.anonPersonEmail
        });

        try {
            await getObjectByIdHash(anonPersonId);
        } catch (_) {
            throw new Error('Unknown anonymous person.');
        }
        const savedAnonOwnerKeys = await createSingleObjectThroughImpurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Keys',
                owner: anonPersonId,
                publicKey: this.decryptedObject.anonPersonPublicKey,
                publicSignKey: this.decryptedObject.anonPersonPublicSignKey
            }
        );
        await this.writePrivateKey(
            this.password,
            toByteArray(this.decryptedObject.anonPersonPrivateKey),
            `${savedAnonOwnerKeys.hash}.owner.encrypt`
        );
        await this.writePrivateKey(
            this.password,
            toByteArray(this.decryptedObject.anonPersonPrivateSignKey),
            `${savedAnonOwnerKeys.hash}.owner.sign`
        );

        await overwritePersonKeys(this.password, personId, this.mainInstanceInfo.instanceId);
        await overwritePersonKeys(this.password, anonPersonId, this.anonInstanceInfo.instanceId);
    }

    /**
     * Updates all the instance info related members in the class.
     *
     * @returns {Promise<void>}
     */
    private async updateInstanceInfos(): Promise<void> {
        // Extract my local instance infos to build the map
        const infos = await this.instancesModel.localInstancesInfo();
        if (infos.length !== 2) {
            throw new Error('This applications needs exactly one alternate identity!');
        }

        // Setup the public key to instanceInfo map
        await Promise.all(
            infos.map(async instanceInfo => {
                if (instanceInfo.isMain) {
                    this.mainInstanceInfo = instanceInfo;
                } else {
                    this.anonInstanceInfo = instanceInfo;
                }
            })
        );
    }
}
