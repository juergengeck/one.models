import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import MetaObjectMapRecipes from '../lib/recipes/MetaObjectMapRecipes';
import SignatureRecipes, {SignatureReverseMaps} from '../lib/recipes/SignatureRecipes';
import {useExperimentalReverseMaps} from '../lib/misc/MetaObjectMap';
import {sign, signedBy, isSignedBy} from '../lib/misc/Signature';
import {createTestIdentity} from './utils/createTestIdentity';
import {createDummyObjectUnversioned, DummyObjectRecipes} from './utils/createDummyObject';
import {signForSomeoneElse} from './utils/signForSomeoneElse';

// If you set this to true, then use the experimental reverseMap Replacement 'MetaObjectMap'
const experimentalReverseMaps = false;

describe('Signature test', () => {
    beforeEach(async () => {
        useExperimentalReverseMaps(experimentalReverseMaps);
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'test/testDb',
            initialRecipes: [...SignatureRecipes, ...MetaObjectMapRecipes, ...DummyObjectRecipes],
            initiallyEnabledReverseMapTypes: experimentalReverseMaps
                ? undefined
                : new Map([...SignatureReverseMaps])
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Sign object by me', async () => {
        const me = getInstanceOwnerIdHash();

        if (me === undefined) {
            throw new Error('Instance not initialized');
        }

        const data = (await createDummyObjectUnversioned('bla')).hash;

        const signPersons1 = await signedBy(data);
        expect(signPersons1.length).to.be.equal(0);
        expect(await isSignedBy(data, me)).to.be.false;

        await sign(data);

        const signPersons2 = await signedBy(data);
        expect(signPersons2.length).to.be.equal(1);
        expect(signPersons2[0]).to.be.equal(me);
        expect(await isSignedBy(data, me)).to.be.true;
    });

    it('Sign object by someone else (trusted keys test)', async () => {
        // Create an identity with brand new keys & data & sign the data with this new identity.
        const other = await createTestIdentity('xyz');
        const data = (await createDummyObjectUnversioned('bla')).hash;
        await signForSomeoneElse(data, other.person, other.signKeyPair.secretKey);

        // Check the signature (I did not approve the key)
        const signPersons1 = await signedBy(data);
        expect(signPersons1.length).to.be.equal(0);
        expect(await isSignedBy(data, other.person)).to.be.false;

        await sign(other.keys);

        // Check the signature (I did approve the key)
        const signPersons2 = await signedBy(data);
        expect(signPersons2.length).to.be.equal(1);
        expect(signPersons2[0]).to.be.equal(other.person);
        expect(await isSignedBy(data, other.person)).to.be.true;
    });
});