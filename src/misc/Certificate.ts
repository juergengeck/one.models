import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    UnversionedObjectResult,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import type {Certificate, LicenseType} from '../recipes/CertificateRecipes';
import {createCryptoAPI, stringToUint8Array} from 'one.core/lib/instance-crypto';
import {sign, verify} from 'tweetnacl';
import {fromByteArray, toByteArray} from 'base64-js';
import {getInstanceIdHash} from 'one.core/lib/instance';
import {getLicenseHashByType} from './License';
import * as ReverseMapQuery from 'one.core/lib/reverse-map-query';

const CertificateRevocationList: SHA256Hash<Certificate>[] = [];

/**
 *
 * @param licenseType
 * @param subject
 * @param issuer
 * @param target
 */
export async function createCertificate(
    licenseType: LicenseType,
    subject: SHA256Hash<OneUnversionedObjectTypes>,
    issuer: SHA256IdHash<Person>,
    target: SHA256IdHash<Person>
): Promise<UnversionedObjectResult<Certificate>> {
    const licenseHash = getLicenseHashByType(licenseType);

    if (licenseHash === undefined) {
        throw new Error(`The License for ${licenseType} does not exist.`);
    }

    const licenseText = (await getObject(licenseHash)).text;
    const signature = await createCertificateSignature(
        createSignatureMsg(licenseText, subject, issuer, target)
    );

    return await createSingleObjectThroughPurePlan(
        {
            module: '@one/identity',
            versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
        },
        {
            $type$: 'Certificate',
            license: licenseHash,
            issuer: issuer,
            subject: subject,
            target: target,
            signature: fromByteArray(signature)
        }
    );
}

/**
 *
 * @param certificate
 * @param issuerPublicKey
 */
export async function validateCertificate(
    certificate: SHA256Hash<Certificate>,
    issuerPublicKey: string
): Promise<void> {
    if (CertificateRevocationList.includes(certificate)) {
        throw new Error('The certificate has been revoked.');
    }

    const certificateObj = await getObject(certificate);

    const {signature, license, subject, issuer, target} = certificateObj;
    const licenseText = (await getObject(license)).text;

    const expectedSignature = await createCertificateSignature(
        createSignatureMsg(licenseText, subject, issuer, target)
    );

    const result = sign.open(toByteArray(signature), toByteArray(issuerPublicKey));

    if (result === null) {
        throw new Error("The certificate's signature is not valid.");
    }

    if (
        !verify(result, stringToUint8Array(createSignatureMsg(licenseText, subject, issuer, target)))
    ) {
        throw new Error("The certificate's signature is not valid.");
    }
}

/**
 * Revokes the certificate by the given license type, subject & target
 * @param licenseType
 * @param subject
 * @param target
 */
export async function revokeCertificate(
    licenseType: LicenseType,
    subject: SHA256Hash<OneUnversionedObjectTypes>,
    target: SHA256IdHash<Person>
): Promise<void> {
    let foundCertificate = await findCertificate(licenseType, subject, target);

    if (foundCertificate === undefined) {
        throw new Error('The certificate does not exist');
    }

    CertificateRevocationList.push(foundCertificate);
}

/**
 *
 * @param certificateHash
 */
export function isCertificateValid(certificateHash: SHA256Hash<Certificate>): boolean {
    return !CertificateRevocationList.includes(certificateHash);
}

// ----------------------------------------- PRIVATE -----------------------------------------

/**
 * Searches for the certificate. Throws error if it doesn't exist.
 * @param licenseType
 * @param subject
 * @param target
 */
async function findCertificate(
    licenseType: LicenseType,
    subject: SHA256Hash<OneUnversionedObjectTypes>,
    target: SHA256IdHash<Person>
) {
    const licenseHash = getLicenseHashByType(licenseType);

    if (licenseHash === undefined) {
        throw new Error(`The License for ${licenseType} does not exist.`);
    }

    let foundCertificate;

    const personCertificateReverseMaps = (
        await ReverseMapQuery.getAllValues(target, true, 'Certificate')
    ).map(revMap => revMap.toHash);

    const licenseCertificateReverseMaps = (
        await ReverseMapQuery.getAllValues(licenseHash, false, 'Certificate')
    ).map(revMap => revMap.toHash);

    const intersectionOfCertificateReverseMaps = personCertificateReverseMaps.filter(value =>
        licenseCertificateReverseMaps.includes(value)
    );

    for (const certificateHash of intersectionOfCertificateReverseMaps) {
        const certificate = await getObject(certificateHash);
        if (certificate.subject === subject) {
            foundCertificate = certificateHash;
            break;
        }
    }
    return foundCertificate;
}

/**
 *
 * @param msg
 */
async function createCertificateSignature(msg: string) {
    const instanceId = await getInstanceIdHash();

    if (instanceId === undefined) {
        throw new Error('The instance id hash could not be found.');
    }

    const crypto = createCryptoAPI(instanceId);

    return crypto.createSignature(stringToUint8Array(msg));
}

/**
 *
 * @param licenseText
 * @param subject
 * @param issuer
 * @param target
 */
function createSignatureMsg(
    licenseText: string,
    subject: SHA256Hash<OneUnversionedObjectTypes>,
    issuer: SHA256IdHash<Person>,
    target: SHA256IdHash<Person>
) {
    return `${licenseText}${subject}${issuer}${target}`;
}
