import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from '@refinio/one.core/lib/storage';
import type {License, LicenseType} from '../recipes/CertificateRecipes';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';

const LICENSES: Map<LicenseType, SHA256Hash<License>> = new Map();

export async function initLicenses() {
    const accessLicense = await createSingleObjectThroughPurePlan(
        {
            module: '@one/identity',
            versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
        },
        {
            $type$: 'License',
            text: 'With this license a user gives another user access to an object'
        }
    );
    const truthLicense = await createSingleObjectThroughPurePlan(
        {
            module: '@one/identity',
            versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
        },
        {
            $type$: 'License',
            text: 'The user certifies that this information is correct'
        }
    );
    LICENSES.set('access', accessLicense.hash);
    LICENSES.set('truth', truthLicense.hash);
}

export function getLicenseHashByType(type: LicenseType): SHA256Hash<License> | undefined {
    return LICENSES.get(type);
}
