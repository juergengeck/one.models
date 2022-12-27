import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {isSignedBy, sign, signedBy} from '../Signature';
import type {Person} from '@refinio/one.core/lib/recipes';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {UnversionedObjectResult} from '@refinio/one.core/lib/storage';
import {getObject, onUnversionedObj} from '@refinio/one.core/lib/storage';
import type {Signature} from '../../recipes/SignatureRecipes';
import {getAllEntries} from '@refinio/one.core/lib/reverse-map-query';

/**
 * You affirm that this data ia genuine.
 *
 * @param data
 * @param issuer
 */
export async function affirm(
    data: SHA256Hash,
    issuer?: SHA256IdHash<Person>
): Promise<UnversionedObjectResult<Signature>> {
    const result = await storeUnversionedObject({
        $type$: 'AffirmationCertificate',
        data: data
    });

    return sign(result.hash, issuer);
}

/**
 * Check if someone declared this data as genuine.
 *
 * @param by
 * @param data
 */
export async function isAffirmedBy(by: SHA256IdHash<Person>, data: SHA256Hash): Promise<boolean> {
    const certificateHashes = await getAllEntries(data, 'AffirmationCertificate');
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
    const certificateHashes = await getAllEntries(data, 'AffirmationCertificate');
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

    return onUnversionedObj.addListener(function (result) {
        handleNewObjectAsync(result).catch(console.error);
    });
}
