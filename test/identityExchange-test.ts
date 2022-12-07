import chai, {expect} from 'chai';
import {closeInstance, initInstance} from '@refinio/one.core/lib/instance';
import SignatureRecipes, {SignatureReverseMaps} from '../lib/recipes/SignatureRecipes';
import {mkdir, rm, rmdir} from 'fs/promises';
import {getObjectByIdHash} from '@refinio/one.core/lib/storage';
import chaiAsPromised from 'chai-as-promised';
import LeuteRecipes from '../lib/recipes/Leute/recipes';
import {
    importIdentityFileAsOneInstanceEndpoint,
    writeNewIdentityToFile,
    readIdentityFile,
    readIdentityWithSecretsFile
} from '../lib/misc/IdentityExchange-fs';
chai.use(chaiAsPromised);

describe('identityExchange test one independent functions', () => {
    beforeEach(async () => {
        await mkdir('test/testId').catch(console.error);
    });

    afterEach(async () => {
        await rm('test/testId/tid.id.json').catch(console.error);
        await rm('test/testId/tid_secret.id.json').catch(console.error);
        await rmdir('test/testId').catch(console.error);
    });

    it('create random id', async () => {
        const idOrig = await writeNewIdentityToFile('test/testId/tid', 'ws://localhost:8000');
        const identityWithSecrets = await readIdentityWithSecretsFile(idOrig.secretFileName);
        const identity = await readIdentityFile(idOrig.publicFileName);

        expect(idOrig.secret).to.deep.equal(identityWithSecrets);
        expect(idOrig.public).to.deep.equal(identity);

        await expect(readIdentityFile(idOrig.secretFileName)).to.be.rejectedWith(Error);
        await expect(readIdentityWithSecretsFile(idOrig.publicFileName)).to.be.rejectedWith(Error);
    });
});

describe('identityExchange test one dependent functions', () => {
    beforeEach(async () => {
        await initInstance({
            name: 'testname',
            email: 'test@test.com',
            secret: 'secret',
            wipeStorage: true,
            encryptStorage: false,
            directory: 'test/testDb',
            initialRecipes: [...SignatureRecipes, ...LeuteRecipes],
            initiallyEnabledReverseMapTypes: new Map([...SignatureReverseMaps])
        });
        await mkdir('test/testId').catch(console.error);
    });

    afterEach(async () => {
        await rm('test/testId/tid.id.json').catch(console.error);
        await rm('test/testId/tid_secret.id.json').catch(console.error);
        await rmdir('test/testId').catch(console.error);
        closeInstance();
    });

    it('create random id', async () => {
        const idOrig = await writeNewIdentityToFile('test/testId/tid', 'ws://localhost:8000');
        const oneInstanceEndpoint = await importIdentityFileAsOneInstanceEndpoint(
            idOrig.publicFileName
        );
        const person = await getObjectByIdHash(oneInstanceEndpoint.obj.personId);
        const instance = await getObjectByIdHash(oneInstanceEndpoint.obj.instanceId);

        expect(idOrig.public.personEmail).to.be.equal(person.obj.email);
        expect(idOrig.public.instanceName).to.be.equal(instance.obj.name);
    });
});
