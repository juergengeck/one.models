import {getLicenseHashByType, initLicenses} from '../misc/License';
import type {Certificate} from '../recipes/CertificateRecipes';
import type {SHA256Hash, SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import {createCertificate, revokeCertificate, validateCertificate} from '../misc/Certificate';
import {LeuteModel} from './index';
import {createSingleObjectThroughPurePlan, getObject, SET_ACCESS_MODE} from 'one.core/lib/storage';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import * as ReverseMapQuery from 'one.core/lib/reverse-map-query';
import {getInstanceIdHash} from 'one.core/lib/instance';
import {getObjectByIdHash} from 'one.core/lib/storage-versioned-objects';
import type {OneObjectTypeNames} from 'one.core/lib/recipes';
import type {LicenseType} from '../recipes/CertificateRecipes';

/**
 * Manages the creation & validation of certificates
 */
export default class CertificateManager {
    private leuteModel: LeuteModel;

    constructor(leuteModel: LeuteModel) {
        this.leuteModel = leuteModel;
    }

    /**
     * This will initialise the present Licenses
     */
    public async init(): Promise<void> {
        await initLicenses();
    }

    /**
     * Creates an access certificate & gives access to it
     * @param subject - the object the certificate was created for
     * @param issuer - the person who creates the certificate
     * @param target - the person for whom the certificate is intended
     */
    public async createAccessCertificate(
        subject: SHA256Hash<OneUnversionedObjectTypes>,
        issuer: SHA256IdHash<Person>,
        target: SHA256IdHash<Person>
    ) {
        const certificate = await createCertificate('access', subject, issuer, target);
        await createSingleObjectThroughPurePlan({module: '@one/access'}, [
            {
                object: await calculateHashOfObj(certificate.obj),
                person: target,
                group: [],
                mode: SET_ACCESS_MODE.REPLACE
            }
        ]);
    }

    /**
     * Revokes a certificate.
     * @param licenseType - the type indicating which kind of certificate it was
     * @param subject - the object you want the certificate to be revoked
     * @param target - the person for whom the certificate is intended to be revoked
     */
    public async revokeCertificate(
        licenseType: LicenseType,
        subject: SHA256Hash<OneUnversionedObjectTypes>,
        target: SHA256IdHash<Person>
    ): Promise<void> {
        return await revokeCertificate(licenseType, subject, target)
    }

    /**
     * Validates the given certificate.
     * @param certificateHash - the {@link SHA256Hash} of the {@link Certificate}
     * @param issuerIdHash - needed to extract {@link Keys.publicSignKey} of the person in order to
     *                       validate the certificate's signature
     */
    public async validate(
        certificateHash: SHA256Hash<Certificate>,
        issuerIdHash: SHA256IdHash<Person>
    ): Promise<boolean> {
        const issuerPublicSignKey = await CertificateManager.retrievePersonPublicSignKey(
            issuerIdHash
        );

        return await validateCertificate(certificateHash, issuerPublicSignKey)
            .then(_ => true)
            .catch(_ => false);
    }

    /**
     * Validates the given certificate & throws an error if the certificate is not valid.
     * @param certificateHash - the {@link SHA256Hash} of the {@link Certificate}
     * @param issuerIdHash - needed to extract {@link Keys.publicSignKey} of the person in order to
     *                       validate the certificate's signature
     */
    public async assert(
        certificateHash: SHA256Hash<Certificate>,
        issuerIdHash: SHA256IdHash<Person>
    ): Promise<void> {
        const issuerPublicSignKey = await CertificateManager.retrievePersonPublicSignKey(
            issuerIdHash
        );

        await validateCertificate(certificateHash, issuerPublicSignKey);
    }

    /**
     * Finds with whom the given object was shared by the valid certificate. Only valid
     * certificates will be taken in consideration
     * @param subject - the object in cause
     */
    public async findWithWhomTheObjectWasSharedByValidCertificate(
        subject: SHA256Hash<OneUnversionedObjectTypes>
    ): Promise<SHA256IdHash<Person>[]> {
        await this.checkIfReverseMapsAreEnabledForType('License');

        const licenseHash = getLicenseHashByType('access');

        if (licenseHash === undefined) {
            throw new Error(`The License for access does not exist.`);
        }

        const foundCertificatesHashes = (
            await ReverseMapQuery.getAllValues(licenseHash, false, 'Certificate')
        ).map(revMap => revMap.toHash);

        const foundPersons = [];

        for (const certificateHash of foundCertificatesHashes) {
            const certificate = await getObject(certificateHash);
            if (
                certificate.subject === subject &&
                (await this.validate(certificateHash, certificate.issuer))
            ) {
                foundPersons.push(certificate.target);
            }
        }

        return foundPersons;
    }

    /**
     * Finds what objects the given person has through a valid certificate. Only valid
     * certificates will be taken in consideration
     * @param target - the person you want to query the objects for
     */
    public async findWhatObjectsPersonHasThoughValidCertificate(
        target: SHA256IdHash<Person>
    ): Promise<SHA256Hash<OneUnversionedObjectTypes>[]> {
        await this.checkIfReverseMapsAreEnabledForType('Person');

        const licenseHash = getLicenseHashByType('access');

        if (licenseHash === undefined) {
            throw new Error(`The License for access does not exist.`);
        }

        const foundCertificatesHashes = (
            await ReverseMapQuery.getAllValues(target, true, 'Certificate')
        ).map(revMap => revMap.toHash);

        const foundObjects = [];

        for (const certificateHash of foundCertificatesHashes) {
            const certificate = await getObject(certificateHash);
            if (
                certificate.target === target &&
                (await this.validate(certificateHash, certificate.issuer))
            ) {
                foundObjects.push(certificate.subject);
            }
        }

        return foundObjects;
    }

    /**
     * Uses {@link LeuteModel} in order to retrieve the person public sign keys by the given id
     * hash.
     */
    private static async retrievePersonPublicSignKey(issuerIdHash: SHA256IdHash<Person>) {
        const issuerPersonKeysHash = await LeuteModel.personKeysHashForPerson(issuerIdHash);

        const issuerPublicSignKey = (await getObject(issuerPersonKeysHash)).publicSignKey;

        if (issuerPublicSignKey === undefined) {
            throw new Error(`Could not find needed publicSignKey for ${issuerIdHash}`);
        }
        return issuerPublicSignKey;
    }

    /**
     * Checks if there are reverse maps created for the given type
     * @param type
     * @private
     */
    private async checkIfReverseMapsAreEnabledForType(type: OneObjectTypeNames) {
        const instanceIdHash = await getInstanceIdHash();

        if (instanceIdHash === undefined) {
            throw new Error('The instance id hash could be found. Init instance first.');
        }

        const instanceObject = await getObjectByIdHash(instanceIdHash);
        if (!instanceObject.obj.enabledReverseMapTypes.has(type)) {
            throw new Error(`The reverse maps needs to be added in order to use 
              findWithWhomTheObjectWasSharedByValidCertificate(). Add [\'${type}\', null] to
              the reverse maps`);
        }
    }
}
