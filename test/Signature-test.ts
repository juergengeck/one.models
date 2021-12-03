import {expect} from 'chai';
import tweetnacl from 'tweetnacl';
import {closeInstance, getInstanceOwnerIdHash, initInstance} from '@refinio/one.core/lib/instance';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {Person} from '@refinio/one.core/lib/recipes';
import {storeMetaObject} from '../lib/misc/MetaObjectMap';
import {sign, signedBy, isSignedBy} from '../lib/misc/Signature';
import {arrayBufferToHex} from '../lib/misc/ArrayBufferHexConvertor';
import SignatureRecipes from '../lib/recipes/SignatureRecipes';
import MetaObjectMapRecipes from '../lib/recipes/MetaObjectMapRecipes';
import {createTestIdentity} from "./utils/createTestIdentity";
import {createDummyObjectUnversioned, DummyObjectRecipes} from "./utils/createDummyObject";

/**
 * Create a signature object with someone else as issuer and a provate key.
 *
 * The current signature module does not support this because of limitations of the key management. That's why we
 * have this helper function.
 *
 * @param data
 * @param issuer
 * @param secretKey
 */
async function createSignatureObject(data: SHA256Hash, issuer: SHA256IdHash<Person>, secretKey: Uint8Array) {
    const signatureBinary = tweetnacl.sign.detached(
        new TextEncoder().encode(data),
        secretKey
    );
    const signatureString = arrayBufferToHex(signatureBinary.buffer);
    await storeMetaObject(data, {
        $type$: 'Signature',
        issuer,
        data,
        signature: signatureString
    });
}


describe('Signature test', () => {
    beforeEach(async () => {
        return await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'testDb',
            initialRecipes: [...SignatureRecipes, ...MetaObjectMapRecipes, ...DummyObjectRecipes]
        });
    });

    afterEach(async () => {
        closeInstance();
    });

    it('Sign object by me', async () => {
        const me = await getInstanceOwnerIdHash();
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

    it('Sign object by someone else', async () => {
        // Create an identity with brand new keys
        const other = await createTestIdentity('xyz');

        // Create the data to sign
        const data = (await createDummyObjectUnversioned('bla')).hash;

        // Create the signature with the key of another person
        await createSignatureObject(data, other.person, other.signKeyPair.secretKey);

        // Check the signature (I did not approve the key)
        const signPersons1 = await signedBy(data);
        expect(signPersons1.length).to.be.equal(0);
        expect(await isSignedBy(data, other.person)).to.be.false;

        await sign(other.keys);

        const signPersons2 = await signedBy(data);
        expect(signPersons2.length).to.be.equal(1);
        expect(signPersons2[0]).to.be.equal(other.person);
        expect(await isSignedBy(data, other.person)).to.be.true;
    });
});
