import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import {getLicenseForCertificate} from '../../lib/misc/Certificates/LicenseRegistry';
import {signForSomeoneElse} from './signForSomeoneElse';
import '../../lib/recipes/Certificates/RelationCertificate';

/**
 * Create an relation certificate for another personId.
 *
 * The current certificate module does not support this because of limitations of the key management. That's why we
 * have this helper function.
 *
 * @param person1
 * @param person2
 * @param relation
 * @param app
 * @param issuer
 * @param secretKey
 */
export async function certifyRelationForSomeoneElse(
    person1: SHA256IdHash<Person>,
    person2: SHA256IdHash<Person>,
    relation: string,
    app: string,
    issuer: SHA256IdHash<Person>,
    secretKey: Uint8Array
): Promise<void> {
    const licenseResult = await storeUnversionedObject(
        getLicenseForCertificate('RelationCertificate')
    );

    const result = await storeUnversionedObject({
        $type$: 'RelationCertificate',
        person1,
        person2,
        relation,
        app,
        license: licenseResult.hash
    });
    await signForSomeoneElse(result.hash, issuer, secretKey);
}
