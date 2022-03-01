import tweetnacl from 'tweetnacl';

const secretBoxZeroNonce = new Uint8Array(tweetnacl.secretbox.nonceLength);
const boxZeroNonce = new Uint8Array(tweetnacl.box.nonceLength);

function createRecoveryInformation(
    recoveryServicePublicKey: Uint8Array,
    secret: Uint8Array,
    secretLengthWithPadding: number
): {
    encryptedRecoverySecret: string;
    encryptedRecoveryInfo: string;
} {
    if (secret.length > 256) {
        throw new Error('The secret ');
    }
    if (secret.length > secretLengthWithPadding) {
        throw new Error('The padding length is less than the size of the secret.');
    }

    // Create the secret with padding
    const secretPadded = new Uint8Array(secretLengthWithPadding + 2);
    secretPadded.set(new Uint8Array(), 0);
    secretPadded.set(secret, 1);
    secretPadded.set(
        tweetnacl.randomBytes(secretLengthWithPadding - secret.length),
        secret.length + 1
    );

    // Step 1: Generate the symmetric key that will be shared with the clinic (we will forget it)
    const symmetricKey = tweetnacl.randomBytes(tweetnacl.box.sharedKeyLength);

    // Setp 2: Encrypt our secret with the shared key and write this to a file.
    const encryptedRecoverySecret = tweetnacl.secretbox(secret, secretBoxZeroNonce, symmetricKey);

    // Step 3: Encrypt the encryption key for step 2 with the clinic key and write it to disk along with the email.
    const tempKeys = tweetnacl.box.keyPair();
    const payloadForClinic = {
        identity: email,
        sharedKey: uint8arrayToHexString(symmetricKey)
    };
    const payloadForClinicBinary = new TextEncoder().encode(JSON.stringify(payloadForClinic));
    const encryptedPayloadForClinic = tweetnacl.box(
        payloadForClinicBinary,
        new Uint8Array(tweetnacl.box.nonceLength),
        clinicPublicKey,
        tempKeys.secretKey
    );
    const encryptedPayloadForClinicWrapper = {
        payloadForClinic: uint8arrayToHexString(encryptedPayloadForClinic),
        pubTempKey: uint8arrayToHexString(tempKeys.publicKey)
    };

    return {
        local
    };
}
