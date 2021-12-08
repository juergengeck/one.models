import type {SHA256Hash, SHA256IdHash} from "@refinio/one.core/lib/util/type-checks";
import {addMetaObject, getMetaObjectHashesOfType, storeMetaObject} from "./MetaObjectMap";
import {isSignedBy, sign, signedBy} from "./Signature";
import type {Person} from "@refinio/one.core/lib/recipes";
import {storeUnversionedObject} from "@refinio/one.core/lib/storage-unversioned-objects";
import {calculateHashOfObj} from "@refinio/one.core/lib/util/object";

/**
 * Certify with your own sign key, that person1 has the specified relation with person2.
 *
 * @param person1
 * @param person2
 * @param relation - Relation as defined by the application app.
 * @param app - Application in which context this relation is important.
 */
export async function certifyRelation(person1: SHA256IdHash<Person>, person2: SHA256IdHash<Person>, relation: string, app: string): Promise<void> {
    const certificateHash = (await storeUnversionedObject({
        $type$: 'RelationCertificate',
        person1,
        person2,
        relation,
        app
    })).hash;
    await sign(certificateHash);
    await addMetaObject(person1, certificateHash);
    await addMetaObject(person2, certificateHash);
}

/**
 * Check if somebody certified the specified relation between two persons
 *
 * @param by
 * @param person1
 * @param person2
 * @param relation
 * @param app
 */
export async function isRelationCertifiedBy(by: SHA256IdHash<Person>, person1: SHA256IdHash<Person>, person2: SHA256IdHash<Person>, relation: string, app: string): Promise<boolean> {
    const certificateHash = await calculateHashOfObj({
        $type$: 'RelationCertificate',
        person1,
        person2,
        relation,
        app
    })
    return isSignedBy(certificateHash, by);
}

/**
 * You affirm that this data ia genuine.
 *
 * @param data
 */
export async function affirm(data: SHA256Hash): Promise<void> {
    const certificateHash = (await storeMetaObject(data, {
        $type$: 'AffirmationCertificate',
        data: data
    })).hash;

    await sign(certificateHash);
    await addMetaObject(data, certificateHash);
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
        console.error('Programming Error: For a specific object there should always only be one AffirmationCertificate.');
    }

    const signedStates = await Promise.all(certificateHashes.map(certificateHash => isSignedBy(certificateHash, by)));
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
        console.error('Programming Error: For a specific object there should always only be one AffirmationCertificate.');
    }

    const people2Dim = await Promise.all(certificateHashes.map(signedBy));
    return people2Dim.reduce((p, c) => p.concat(c));
}
