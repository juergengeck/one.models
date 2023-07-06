import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import {getLicenseForCertificate} from '../../lib/misc/Certificates/LicenseRegistry';
import {signForSomeoneElse} from './signForSomeoneElse';
import {storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';

// This import is needed, otherwise the @OneCOreInterfaces does not have the AffirmationInterface!
import '../../lib/recipes/Certificates/AffirmationCertificate';

/**
 * Create an affirmation certificate for another personId.
 *
 * The current certificate module does not support this because of limitations of the key management. That's why we
 * have this helper function.
 *
 * @param data
 * @param issuer
 * @param secretKey
 */
export async function affirmForSomeoneElse(
    data: SHA256Hash,
    issuer: SHA256IdHash<Person>,
    secretKey: Uint8Array
): Promise<void> {
    const licenseResult = await storeUnversionedObject(
        getLicenseForCertificate('AffirmationCertificate')
    );

    const result = await storeUnversionedObject({
        $type$: 'AffirmationCertificate',
        data: data,
        license: licenseResult.hash
    });
    await signForSomeoneElse(result.hash, issuer, secretKey);
}
