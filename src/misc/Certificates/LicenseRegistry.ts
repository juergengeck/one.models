import type {Recipe, OneObjectTypeNames} from '@refinio/one.core/lib/recipes';
import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';
import type {
    OneCertificateTypeNames,
    OneCertificateTypes
} from '../../recipes/Certificates/CertificateRecipes';
import type {License} from '../../recipes/Certificates/License';

const licenseRegistry = new Map<OneCertificateTypeNames, License>();

export function getLicenseForCertificate(certificateType: OneCertificateTypeNames): License {
    const license = licenseRegistry.get(certificateType);
    if (license === undefined) {
        throw new Error('No license found with requested type');
    }
    return license;
}

export function registerLicense(license: License, certificateType: OneCertificateTypeNames) {
    Object.freeze(license);
    licenseRegistry.set(certificateType, license);
}
