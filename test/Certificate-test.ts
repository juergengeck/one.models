import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import CertificateRecipes from "../lib/recipes/CertificateRecipes";
import SignatureRecipes from "../lib/recipes/SignatureRecipes";
import MetaObjectMapRecipes from "../lib/recipes/MetaObjectMapRecipes";
import {affirm, isAffirmedBy, affirmedBy} from "../lib/misc/Certificate";
import {createDummyObjectUnversioned, DummyObjectRecipes} from "./utils/createDummyObject";
import {createTestIdentity} from "./utils/createTestIdentity";
import {affirmForSomeoneElse} from "./utils/affirmForSomeoneElse";
import {sign} from '../lib/misc/Signature';

describe('Certificate test', () => {

    beforeEach(async () => {
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'testDb',
            initialRecipes: [...CertificateRecipes, ...SignatureRecipes, ...MetaObjectMapRecipes, ...DummyObjectRecipes]
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
        expect((await affirmedBy(data))).to.be.eql([other.person]);

        // Now affirm it myself to see if multiple persons are not a problem
        const me = await getInstanceOwnerIdHash();

        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        await affirm(data);
        expect(await affirmedBy(data)).to.be.eql([other.person, me]);
    });

    /*it('Relationship certificate from myself', async () => {
        const me = await getInstanceOwnerIdHash();
        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const data = (await createDummyObjectUnversioned('bla')).hash;

    });*/
});
