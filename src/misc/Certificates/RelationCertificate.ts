import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {RelationCertificate} from '../../recipes/Certificates/RelationCertificate';
import {isSignedBy, sign} from '../Signature';
import type {Person} from '@refinio/one.core/lib/recipes';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage-unversioned-objects';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {calculateHashOfObj} from '@refinio/one.core/lib/util/object';
import type {Signature} from '../../recipes/SignatureRecipes';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';

/**
 * Certify with your own sign key, that person1 has the specified relation with person2.
 *
 * @param person1
 * @param person2
 * @param relation - Relation as defined by the application app.
 * @param app - Application in which context this relation is important.
 * @param issuer
 */
export async function certifyRelation(
    person1: SHA256IdHash<Person>,
    person2: SHA256IdHash<Person>,
    relation: string,
    app: string,
    issuer?: SHA256IdHash<Person>
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
    return sign(certificateHash, issuer);
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
    const certificateHashes = await getAllEntries(person1, 'RelationCertificate');
    const isSingedArr = await Promise.all(certificateHashes.map(cert => isSignedBy(cert, by)));
    const signedCertificateHashes = certificateHashes.filter((_value, index) => isSingedArr[index]);
    const signedCertificates = await Promise.all(signedCertificateHashes.map(getObject));
    return signedCertificates.filter(cert => {
        return cert.person1 === person1 && cert.relation === relation && cert.app === app;
    });
}
