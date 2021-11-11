import {dbKey, importModules, removeDir} from './utils/TestModel';
import {closeInstance, registerRecipes} from '@refinio/one.core/lib/instance';
import RecipesStable from '../lib/recipes/recipes-stable';
import RecipesExperimental from '../lib/recipes/recipes-experimental';
import * as StorageTestInit from './_helpers';
import {InstancesModel, LeuteModel} from '../lib/models';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    VERSION_UPDATES
} from '@refinio/one.core/lib/storage';
import {createCertificate} from '../lib/misc/Certificate';
import {validateCertificate} from '../lib/misc/Certificate';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Keys, OneUnversionedObjectTypes, Person} from '@refinio/one.core/lib/recipes';
import {expect} from 'chai';
import {initLicenses} from '../lib/misc/License';
import {revokeCertificate} from '../lib/misc/Certificate';
import {CertificateManager} from '../lib/models';

describe('Certificate test', () => {
    const instancesModel = new InstancesModel();
    const leuteModel = new LeuteModel(instancesModel, 'localhost');

    let issuer: SHA256IdHash<Person>;
    let issuerPublicSingKey: string;
    let subject: SHA256Hash<OneUnversionedObjectTypes>;
    let target: SHA256IdHash<Person>;

    afterEach(async () => {
        await leuteModel.shutdown();
        instancesModel.shutdown();
        await new Promise(resolve => setTimeout(resolve, 1000));
        closeInstance();
        await removeDir(`./test/${dbKey}`);
    });

    beforeEach(async () => {
        // Initialise Test Storage
        await StorageTestInit.init({
            dbKey: dbKey,
            deleteDb: false,
            initiallyEnabledReverseMapTypes: [
                ['License', null],
                ['Person', null],
                ['Certificate', null]
            ]
        });
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();

        // Initialise needed models
        await instancesModel.init('abc');
        await leuteModel.init();
        await initLicenses();
        // Extract personID and profile
        const personId = await (await leuteModel.me()).mainIdentity();
        const {communicationEndpoints} = await leuteModel.getMainProfile(personId);

        if (communicationEndpoints[0] === undefined) {
            throw new Error('Person profile is undefined.');
        }
        if (!('personKeys' in communicationEndpoints[0])) {
            throw new Error('Person profile does not contain personKeys.');
        }

        const {publicSignKey} = await getObject(
            communicationEndpoints[0].personKeys as SHA256Hash<Keys>
        );

        if (publicSignKey === undefined) {
            throw new Error('Personkeys.publicSignKey got undefined.');
        }

        const savedSubject = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Person',
                email: 'subjectPerson$Test'
            }
        );

        const savedTarget = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.ALWAYS}
            },
            {
                $type$: 'Person',
                email: 'targetPerson$Test'
            }
        );

        target = savedTarget.idHash;
        subject = savedSubject.hash;
        issuer = personId;
        issuerPublicSingKey = publicSignKey;
    });

    it('Should create a certificate and validate it successfully', async () => {
        const cert = await createCertificate('access', subject, issuer, target);
        await validateCertificate(cert.hash, issuerPublicSingKey);
    });
    it('Should revoke a certificate successfully', async () => {
        const cert = await createCertificate('access', subject, issuer, target);
        let error = false;
        await revokeCertificate('access', subject, issuer);

        try {
            await validateCertificate(cert.hash, issuerPublicSingKey);
        } catch (e) {
            error = true;
            expect(e.message).to.be.equal('The certificate has been revoked.');
        }

        expect(error).to.be.equal(true);
    });
    it(
        'Should throw error if the license for the subject does not exist when creating a' +
            ' certificate',
        done => {
            // @ts-ignore
            createCertificate('wrong', subject, issuer, target)
                .then(_ => done(new Error('Should have' + ' thrown' + ' error')))
                .catch(err => {
                    if (err.message === 'The License for wrong does not exist.') {
                        done();
                    } else {
                        done(new Error('Expected a different kind of error message: ' + err));
                    }
                });
        }
    );
    it('Should find certificates for a specific object', async () => {
        const certificateManager = new CertificateManager(leuteModel);
        await certificateManager.init();

        const cert = await createCertificate('access', subject, issuer, target);
        const targets = await certificateManager.findPersonsWhoSignedThisObject(subject);
        expect(targets).to.deep.equal([issuer]);
    });
    it('Should find shared objects with a person', async () => {
        const certificateManager = new CertificateManager(leuteModel);
        await certificateManager.init();

        const cert = await createCertificate('access', subject, issuer, target);
        const subjects = await certificateManager.findWhatObjectsPersonHasThoughValidCertificate(
            target
        );
        expect(subjects).to.deep.equal([subject]);
    });
});
