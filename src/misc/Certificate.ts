import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {addMetaObject, getMetaObjectHashesOfType, storeMetaObject} from './MetaObjectMap';
import {isSignedBy, sign, signedBy} from './Signature';
import type {Person} from '@refinio/one.core/lib/recipes';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {calculateHashOfObj} from '@refinio/one.core/lib/util/object';
import {getObject, onUnversionedObj, UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import type {RelationCertificate} from '../recipes/CertificateRecipes';
import type {Signature} from '../recipes/SignatureRecipes';

/**
 * Certify with your own sign key, that person1 has the specified relation with person2.
 *
 * @param person1
 * @param person2
 * @param relation - Relation as defined by the application app.
 * @param app - Application in which context this relation is important.
 */
export async function certifyRelation(
    person1: SHA256IdHash<Person>,
    person2: SHA256IdHash<Person>,
    relation: string,
    app: string
): Promise<UnversionedObjectResult<Signature>> {
    const certificateHash = (
        await storeUnversionedObject({
            $type$: 'RelationCertificate',
            person1,
            person2,
            relation,
            app
        })
    ).hash;
    const sigResult = await sign(certificateHash);
    await addMetaObject(person1, certificateHash);
    await addMetaObject(person2, certificateHash);
    return sigResult;
}

/**
 * Check if somebody certified the specified relation between two persons
 *
 * @param by - issued by this person
 * @param person1 - person1 in relation
 * @param person2 - person2 in relation
 * @param relation - type of relation
 * @param app -  app string
 */
export async function isRelationCertifiedBy(
    by: SHA256IdHash<Person>,
    person1: SHA256IdHash<Person>,
    person2: SHA256IdHash<Person>,
    relation: string,
    app: string
): Promise<boolean> {
    const certificateHash = await calculateHashOfObj({
        $type$: 'RelationCertificate',
        person1,
        person2,
        relation,
        app
    });
    return isSignedBy(certificateHash, by);
}

/**
 * Get a list of relation certificates where person1 is a specific person.
 *
 * @param by - issued by this person
 * @param person1 - person1 in relation
 * @param relation - type of relation
 * @param app -  app string
 */
export async function relationsCertifiedForPerson1By(
    by: SHA256IdHash<Person>,
    person1: SHA256IdHash<Person>,
    relation: string,
    app: string
): Promise<RelationCertificate[]> {
    const certificates = await getMetaObjectHashesOfType(person1, 'RelationCertificate');
    const isSingedArr = await Promise.all(certificates.map(cert => isSignedBy(cert, by)));
    const signedCertificateHashes = certificates.filter((_value, index) => isSingedArr[index]);
    const signedCertificates = await Promise.all(signedCertificateHashes.map(getObject));
    return signedCertificates.filter(cert => {
        return cert.person1 === person1 && cert.relation === relation && cert.app === app;
    });
}

/**
 * You affirm that this data ia genuine.
 *
 * @param data
 */
export async function affirm(data: SHA256Hash): Promise<UnversionedObjectResult<Signature>> {
    const certificateHash = (
        await storeMetaObject(data, {
            $type$: 'AffirmationCertificate',
            data: data
        })
    ).hash;

    const sigResult = await sign(certificateHash);
    await addMetaObject(data, certificateHash);
    return sigResult;
}

/**
 * Check if someone declared this data as genuine.
 *
 * @param by
 * @param data
 */
export async function isAffirmedBy(by: SHA256IdHash<Person>, data: SHA256Hash): Promise<boolean> {
    const certificateHashes = await getMetaObjectHashesOfType(data, 'AffirmationCertificate');
    if (certificateHashes.length === 0) {
        return false;
    }
    if (certificateHashes.length > 1) {
        console.error(
            'Programming Error: For a specific object there should always only be one AffirmationCertificate.'
        );
    }

    const signedStates = await Promise.all(
        certificateHashes.map(certificateHash => isSignedBy(certificateHash, by))
    );
    return signedStates.includes(true);
}

/**
 * Get a list of persons that declared that this information is genuine.
 *
 * @param data
 */
export async function affirmedBy(data: SHA256Hash): Promise<SHA256IdHash<Person>[]> {
    const certificateHashes = await getMetaObjectHashesOfType(data, 'AffirmationCertificate');
    if (certificateHashes.length === 0) {
        return [];
    }
    if (certificateHashes.length > 1) {
        console.error(
            'Programming Error: For a specific object there should always only be one AffirmationCertificate.'
        );
    }

    const people2Dim = await Promise.all(certificateHashes.map(signedBy));
    return people2Dim.reduce((p, c) => p.concat(c));
}

/**
 * Register callback that is called when a new Affirmation object for the specified data is received.
 *
 * @param data
 * @param cb
 */
export function onNewAffirmation(
    data: SHA256Hash,
    cb: (issuer: SHA256IdHash<Person>) => void
): () => void {
    async function handleNewObjectAsync(result: UnversionedObjectResult): Promise<void> {
        if (result.obj.$type$ !== 'Signature') {
            return;
        }

        const cert = await getObject(result.obj.data);
        if (cert.$type$ !== 'AffirmationCertificate') {
            return;
        }

        if (cert.data === data) {
            cb(result.obj.issuer);
        }
    }

    function handleNewObject(result: UnversionedObjectResult): void {
        handleNewObjectAsync(result).catch(console.error);
    }

    onUnversionedObj.addListener(handleNewObject);
    return () => {
        onUnversionedObj.removeListener(handleNewObject);
    };
}