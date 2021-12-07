import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import CertificateRecipes from '../lib/recipes/CertificateRecipes';
import SignatureRecipes from '../lib/recipes/SignatureRecipes';
import MetaObjectMapRecipes from '../lib/recipes/MetaObjectMapRecipes';
import {
    affirm,
    isAffirmedBy,
    affirmedBy,
    certifyRelation,
    isRelationCertifiedBy
} from '../lib/misc/Certificate';
import {createDummyObjectUnversioned, DummyObjectRecipes} from './utils/createDummyObject';
import {createTestIdentity} from './utils/createTestIdentity';
import {affirmForSomeoneElse} from './utils/affirmForSomeoneElse';
import {sign} from '../lib/misc/Signature';
import {certifyRelationForSomeoneElse} from './utils/certifyRelationForSomeoneElse';

describe('Certificate test', () => {
    beforeEach(async () => {
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'test/testDb',
            initialRecipes: [
                ...CertificateRecipes,
                ...SignatureRecipes,
                ...MetaObjectMapRecipes,
                ...DummyObjectRecipes
            ]
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Affirm something myself', async () => {
        const me = await getInstanceOwnerIdHash();

        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const data = (await createDummyObjectUnversioned('bla')).hash;

        expect(await isAffirmedBy(me, data)).to.be.false;
        expect(await affirmedBy(data)).to.be.eql([]);
        await affirm(data);
        expect(await isAffirmedBy(me, data)).to.be.true;
        expect(await affirmedBy(data)).to.be.eql([me]);
    });

    it('Affirm something by someone else', async () => {
        // Create an identity with brand new keys & data
        const other = await createTestIdentity('xyz');
        const data = (await createDummyObjectUnversioned('bla')).hash;
        expect(await isAffirmedBy(other.person, data)).to.be.false;
        expect(await affirmedBy(data)).to.be.eql([]);

        // Affirm it with the untrusted key of the other person
        await affirmForSomeoneElse(data, other.person, other.signKeyPair.secretKey);
        expect(await isAffirmedBy(other.person, data)).to.be.false;
        expect(await affirmedBy(data)).to.be.eql([]);

        // Trust the key
        await sign(other.keys);
        expect(await isAffirmedBy(other.person, data)).to.be.true;
        expect(await affirmedBy(data)).to.be.eql([other.person]);

        // Now affirm it myself to see if multiple persons are not a problem
        const me = await getInstanceOwnerIdHash();

        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        await affirm(data);
        expect(await affirmedBy(data)).to.have.members([other.person, me]);
    });

    it('Relationship certificates issued by myself', async () => {
        const me = await getInstanceOwnerIdHash();
        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const praxis = await createTestIdentity('PraxisDrHasenstein');
        const hasenstein = await createTestIdentity('DrHasenstein');
        const pid = praxis.person;
        const hid = hasenstein.person;

        // First round of checks without any certificates
        const a1 = await isRelationCertifiedBy(me, hid, pid, 'doctorAt', 'seeInsideUApp');
        expect(a1).to.be.false;

        const a2 = await isRelationCertifiedBy(me, me, hid, 'patientOf', 'seeInsideUApp');
        expect(a2).to.be.false;

        // Dr. Hasenstein is doctor at the Praxis Dr.Hasenstein
        await certifyRelation(hid, pid, 'doctorAt', 'seeInsideUApp');
        // Me is patient of Dr. Hasenstein
        await certifyRelation(me, hid, 'patientOf', 'seeInsideUApp');

        // Second round of checks with certificates
        const b1 = await isRelationCertifiedBy(me, hid, pid, 'doctorAt', 'seeInsideUApp');
        expect(b1).to.be.true;

        const b2 = await isRelationCertifiedBy(me, me, hid, 'patientOf', 'seeInsideUApp');
        expect(b2).to.be.true;

        // Second round of checks with wrong certificates
        const c1 = await isRelationCertifiedBy(me, pid, hid, 'doctorAt', 'seeInsideUApp');
        expect(c1).to.be.false;

        const c2 = await isRelationCertifiedBy(pid, me, hid, 'patientOf', 'seeInsideUApp');
        expect(c2).to.be.false;

        const c3 = await isRelationCertifiedBy(me, hid, pid, 'doctorAt', 'see');
        expect(c3).to.be.false;

        const c4 = await isRelationCertifiedBy(me, hid, pid, 'patientOf', 'seeInsideUApp');
        expect(c4).to.be.false;
    });

    it('Relationship certificates issued by somebody else', async () => {
        const me = await getInstanceOwnerIdHash();
        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const praxis = await createTestIdentity('PraxisDrHasenstein');
        const hasenstein = await createTestIdentity('DrHasenstein');
        const pid = praxis.person;
        const hid = hasenstein.person;
        sign(praxis.keys);

        // First round of checks without any certificates
        const a1 = await isRelationCertifiedBy(pid, hid, pid, 'doctorAt', 'seeInsideUApp');
        expect(a1).to.be.false;

        const a2 = await isRelationCertifiedBy(pid, me, hid, 'patientOf', 'seeInsideUApp');
        expect(a2).to.be.false;

        // Dr. Hasenstein is doctor at the Praxis Dr.Hasenstein
        await certifyRelationForSomeoneElse(
            hid,
            pid,
            'doctorAt',
            'seeInsideUApp',
            pid,
            praxis.signKeyPair.secretKey
        );
        // Me is patient of Dr. Hasenstein
        await certifyRelationForSomeoneElse(
            me,
            hid,
            'patientOf',
            'seeInsideUApp',
            pid,
            praxis.signKeyPair.secretKey
        );

        // Second round of checks with certificates
        const b1 = await isRelationCertifiedBy(pid, hid, pid, 'doctorAt', 'seeInsideUApp');
        expect(b1).to.be.true;

        const b2 = await isRelationCertifiedBy(pid, me, hid, 'patientOf', 'seeInsideUApp');
        expect(b2).to.be.true;

        // Second round of checks with wrong certificates
        const c1 = await isRelationCertifiedBy(pid, pid, hid, 'doctorAt', 'seeInsideUApp');
        expect(c1).to.be.false;

        const c2 = await isRelationCertifiedBy(hid, me, hid, 'patientOf', 'seeInsideUApp');
        expect(c2).to.be.false;

        const c3 = await isRelationCertifiedBy(pid, hid, pid, 'doctorAt', 'see');
        expect(c3).to.be.false;

        const c4 = await isRelationCertifiedBy(pid, hid, pid, 'patientOf', 'seeInsideUApp');
        expect(c4).to.be.false;
    });
});
