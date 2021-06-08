/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import {getObject, getObjectByIdHash, getObjectByIdObj} from 'one.core/lib/storage';
import {ProfileCRDT, SHA256Hash, SHA256IdHash, Someone} from '@OneCoreTypes';
import ContactModel from './../lib/models/ContactModel';
import TestModel, {dbKey, importModules, removeDir} from './utils/TestModel';
import RecipesStable from './../lib/recipes/recipes-stable';
import RecipesExperimental from './../lib/recipes/recipes-experimental';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {ProfileInfo, ProfileData} from '../lib/src/models/ContactModel';

let contactModel: typeof ContactModel;
let testModel: TestModel;

describe('Contact model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey, deleteDb: false, secret: '1234'});
        await registerRecipes([...RecipesStable, ...RecipesExperimental]);
        await importModules();

        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
        contactModel = model.contactModel;
    });

    it('should test init() function on a fresh instance', async () => {
        const contactApp = await ContactModel.getContactAppObject();
        expect(contactApp).to.not.be.equal(undefined);

        const mySomeone: Someone = await getObject(contactApp.obj.me);
        expect(mySomeone && mySomeone.mainProfile).to.not.be.undefined;
        expect(mySomeone.profiles).to.have.length(2);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);
        expect(myProfile).to.not.be.undefined;

        const communicationEndpoints = myProfile.obj.communicationEndpoints;
        expect(communicationEndpoints).to.not.be.undefined;
    });

    it('should return my identities', async () => {
        const identities = await contactModel.myIdentities();
        expect(identities.length).to.not.be.equal(0);
    });

    it('should create another profile for another person', async () => {
        const personIdHash = await contactModel.createNewIdentity(false, 'foo@refinio.net');

        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'ProfileCRDT',
            personId: personIdHash,
            profileName: 'default'
        });
        expect(versionedProfileObject).to.not.be.equal(undefined);

        const someoneObject = await contactModel.getSomeoneObject(personIdHash);
        expect(someoneObject).to.not.be.equal(undefined);

        if (!someoneObject) {
            throw new Error('Error: someoneObject is undefined');
        }

        const someoneObjectHash = await calculateHashOfObj(someoneObject);
        const contactApp = await ContactModel.getContactAppObject();
        const foundSomeone = contactApp.obj.contacts.find(
            (someoneHash: SHA256Hash<Someone>) => someoneHash === someoneObjectHash
        );
        expect(foundSomeone).to.not.be.equal(undefined);
    });

    it('should create another profile for an anonymous person', async () => {
        const personIdHash = await contactModel.createNewIdentity(false);
        const crdtProfileObject = await getObjectByIdObj({
            $type$: 'ProfileCRDT',
            personId: personIdHash,
            profileName: 'default'
        });

        expect(crdtProfileObject).to.not.be.equal(undefined);
        const someoneObject: Someone | undefined = await contactModel.getSomeoneObject(
            personIdHash
        );
        expect(someoneObject).to.not.be.equal(undefined);

        if (!someoneObject) {
            throw new Error('Error: someoneObject is undefined');
        }
        const someoneObjectHash = await calculateHashOfObj(someoneObject);

        const contactApp = await ContactModel.getContactAppObject();
        const foundSomeone = contactApp.obj.contacts.find(
            (someoneHash: SHA256Hash<Someone>) => someoneHash === someoneObjectHash
        );

        expect(foundSomeone).to.not.be.equal(undefined);
    });

    it('should create profile for my person', async () => {
        const personIdHash = await contactModel.createNewIdentity(true, 'thirdProfile@refinio.net');

        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'ProfileCRDT',
            personId: personIdHash,
            profileName: 'default'
        });

        expect(versionedProfileObject).to.not.be.equal(undefined);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone: Someone = await getObject(contactApp.obj.me);

        const foundSomeone = mySomeone.profiles.find(
            (profileIdHash: SHA256IdHash<ProfileCRDT>) =>
                profileIdHash === versionedProfileObject.idHash
        );
        expect(foundSomeone).to.not.be.equal(undefined);
    });

    it('should update multiple profile properties with single calls', async () => {
        const personIdHash = await contactModel.createNewIdentity(false, 'johnDoe@refinio.net');

        const profileInfos = await contactModel.getProfileInfos(personIdHash);

        const personNameFound = profileInfos.some((pi: ProfileInfo) => pi.type === 'PersonName');
        const emailFound = profileInfos.some(
            (pi: ProfileInfo) => pi.type === 'Email' && pi.value === 'johnDoe@refinio.net'
        );
        const statusFound = profileInfos.some((pi: ProfileInfo) => pi.type === 'PersonStatus');

        expect(personNameFound).to.be.equal(false);
        expect(emailFound).to.be.equal(true);
        expect(statusFound).to.be.equal(false);

        const updateProfileData: ProfileData = {
            communicationEndpoint: {},
            description: {personStatus: 'such a cool day', personName: 'Bob Marley'}
        };

        // remove email, add person status and name
        await contactModel.updateProfile(updateProfileData, personIdHash);
        const profileInfos2 = await contactModel.getProfileInfos(personIdHash);

        const personNameFound2 = profileInfos2.some(
            (pi: ProfileInfo) => pi.type === 'PersonName' && pi.value === 'Bob Marley'
        );
        const emailFound2 = profileInfos2.some(
            (pi: ProfileInfo) => pi.type === 'Email' && pi.value === 'johnDoe@refinio.net'
        );
        const statusFound2 = profileInfos2.some(
            (pi: ProfileInfo) => pi.type === 'PersonStatus' && pi.value === 'such a cool day'
        );

        expect(personNameFound2).to.be.equal(true);
        expect(emailFound2).to.be.equal(false);
        expect(statusFound2).to.be.equal(true);

        // add email address, update name and status
        updateProfileData.communicationEndpoint.email = 'newMail@mail.com';
        updateProfileData.description.personName = 'New Name';
        updateProfileData.description.personStatus = 'raining';
        await contactModel.updateProfile(updateProfileData, personIdHash);
        const profileInfos3 = await contactModel.getProfileInfos(personIdHash);
        const personNameFound3 = profileInfos3.some(
            (pi: ProfileInfo) => pi.type === 'PersonName' && pi.value === 'New Name'
        );
        const emailFound3 = profileInfos3.some(
            (pi: ProfileInfo) => pi.type === 'Email' && pi.value === 'newMail@mail.com'
        );
        const statusFound3 = profileInfos3.some(
            (pi: ProfileInfo) => pi.type === 'PersonStatus' && pi.value === 'raining'
        );

        expect(personNameFound3).to.be.equal(true);
        expect(emailFound3).to.be.equal(true);
        expect(statusFound3).to.be.equal(true);
    });

    it('should create another profile for myself', async () => {
        let contactApp = await ContactModel.getContactAppObject();
        let mySomeone: Someone = await getObject(contactApp.obj.me);

        const noOfProfiles = mySomeone.profiles.length;

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);
        const myPersonIdHash = myProfile.obj.personId;
        await contactModel.createNewProfileForSomeone(true, myPersonIdHash);

        contactApp = await ContactModel.getContactAppObject();
        mySomeone = await getObject(contactApp.obj.me);
        const noOfProfilesAfterNewProfileCreation = mySomeone.profiles.length;

        expect(noOfProfilesAfterNewProfileCreation).to.be.equal(noOfProfiles + 1);
    });

    it('should create 2 anon profiles for a someone', async () => {
        const personIdHash1 = await contactModel.createNewIdentity(false, 'flaps@refinio.net');

        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'ProfileCRDT',
            personId: personIdHash1,
            profileName: 'default'
        });
        expect(versionedProfileObject).to.not.be.equal(undefined);

        const someoneObject = await contactModel.getSomeoneObject(personIdHash1);
        expect(someoneObject).to.not.be.equal(undefined);

        if (!someoneObject) {
            throw new Error('Error: someoneObject is undefined');
        }

        const someoneObjectHash = await calculateHashOfObj(someoneObject);
        const contactApp = await ContactModel.getContactAppObject();
        const foundSomeone = contactApp.obj.contacts.find(
            (someoneHash: SHA256Hash<Someone>) => someoneHash === someoneObjectHash
        );
        expect(foundSomeone).to.not.be.equal(undefined);
        await contactModel.updateDescription(personIdHash1, 'default', {personName: 'Jonathan'});
        const profileInfos = await contactModel.getProfileInfos(personIdHash1);
        const personNameFound = profileInfos.some(
            (pi: ProfileInfo) => pi.type === 'PersonName' && pi.value === 'Jonathan'
        );
        const emailFound = profileInfos.some(
            (pi: ProfileInfo) => pi.type === 'Email' && pi.value === 'flaps@refinio.net'
        );

        expect(personNameFound).to.be.equal(true);
        expect(emailFound).to.be.equal(true);

        // now create a second profile for the same someone object
        const personIdHash2 = await contactModel.createNewProfileForSomeone(false, personIdHash1);

        await contactModel.updateDescription(personIdHash2, 'default', {
            personName: 'SecondProfileName'
        });
        await contactModel.updateCommunicationEndpoint(personIdHash2, 'default', {
            email: 'secondProfile@test.one'
        });
        const profileInfos3 = await contactModel.getProfileInfos(personIdHash2);

        const personNameFound2 = profileInfos3.some(
            (pi: ProfileInfo) => pi.type === 'PersonName' && pi.value === 'SecondProfileName'
        );
        const emailFound2 = profileInfos3.some(
            (pi: ProfileInfo) => pi.type === 'Email' && pi.value === 'secondProfile@test.one'
        );

        expect(personNameFound2).to.be.equal(true);
        expect(emailFound2).to.be.equal(true);
    });

    it('should create second anon profile with data', async () => {
        // create initial profile
        const personIdHash1 = await contactModel.createNewIdentity(false, 'user@refinio.net');

        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'ProfileCRDT',
            personId: personIdHash1,
            profileName: 'default'
        });
        expect(versionedProfileObject).to.not.be.equal(undefined);

        const someoneObject = await contactModel.getSomeoneObject(personIdHash1);
        expect(someoneObject).to.not.be.equal(undefined);

        if (!someoneObject) {
            throw new Error('Error: someoneObject is undefined');
        }

        const someoneObjectHash = await calculateHashOfObj(someoneObject);
        const contactApp = await ContactModel.getContactAppObject();
        const foundSomeone = contactApp.obj.contacts.find(
            (someoneHash: SHA256Hash<Someone>) => someoneHash === someoneObjectHash
        );
        expect(foundSomeone).to.not.be.equal(undefined);

        // update initial profile
        await contactModel.updateDescription(personIdHash1, 'default', {personName: 'Jonathan'});
        const profileInfos = await contactModel.getProfileInfos(personIdHash1);
        const personNameFound = profileInfos.some(
            (pi: ProfileInfo) => pi.type === 'PersonName' && pi.value === 'Jonathan'
        );
        const emailFound = profileInfos.some(
            (pi: ProfileInfo) => pi.type === 'Email' && pi.value === 'user@refinio.net'
        );
        expect(personNameFound).to.be.equal(true);
        expect(emailFound).to.be.equal(true);

        // create profileData object for second anon profile
        const newProfileData: ProfileData = {
            communicationEndpoint: {email: 'veryAnon@mail.com'},
            description: {personStatus: 'such a cool day', personName: 'John Snow'}
        };

        // now create a second profile for the same someone object with profile data
        const personIdHash2 = await contactModel.createNewProfileForSomeone(
            false,
            personIdHash1,
            newProfileData
        );

        // check the created profile has the correct profile info
        const profileInfos2 = await contactModel.getProfileInfos(personIdHash2);
        const personNameFound2 = profileInfos2.some(
            (pi: ProfileInfo) => pi.type === 'PersonName' && pi.value === 'John Snow'
        );
        const emailFound2 = profileInfos2.some(
            (pi: ProfileInfo) => pi.type === 'Email' && pi.value === 'veryAnon@mail.com'
        );
        const statusFound = profileInfos2.some(
            (pi: ProfileInfo) => pi.type === 'PersonStatus' && pi.value === 'such a cool day'
        );

        expect(personNameFound2).to.be.equal(true);
        expect(emailFound2).to.be.equal(true);
        expect(statusFound).to.be.equal(true);
    });

    it('should create anon profile for my person', async () => {
        const personIdHash = await contactModel.createNewIdentity(true);
        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'ProfileCRDT',
            personId: personIdHash,
            profileName: 'default'
        });
        expect(versionedProfileObject).to.not.be.equal(undefined);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone: Someone = await getObject(contactApp.obj.me);

        const foundSomeone = mySomeone.profiles.find(
            (profileIdHash: SHA256IdHash<ProfileCRDT>) =>
                profileIdHash === versionedProfileObject.idHash
        );
        expect(foundSomeone).to.not.be.equal(undefined);
    });
    /*   it('should add a new contact object as a main contact', async () => {
        /!**
         * @TODO PROBLEM -> add a new function that will mutate your current main contact, otherwise it will go first in the hook and
         * add the contact as secondy contact resulting in existing flag on true
         * @type {SHA256IdHash<Person> | undefined}
         *!/

        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        const personKeyLink = await getAllValues(personIdHash, true, 'Keys');
        const personPubEncryptionKeys = await getObjectWithType(personKeyLink[0].toHash, 'Keys');

        const personPubEncryptionKeysHash = await calculateHashOfObj(personPubEncryptionKeys);

        const instanceEndpoint = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                $type$: 'OneInstanceEndpoint',
                personId: personIdHash,
                url: 'localhost:8000',
                instanceId: getInstanceIdHash(),
                personKeys: personPubEncryptionKeysHash,
                instanceKeys: personPubEncryptionKeysHash
            }
        );
        const contactObject = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                $type$: 'Contact',
                personId: personIdHash,
                communicationEndpoints: [instanceEndpoint.hash],
                contactDescriptions: []
            }
        );
        console.log('new contact:', contactObject.hash);

        await contactModel.addNewContactObject(contactObject, true);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone = await getObject(contactApp.obj.me);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);

        console.log('found in profile t:',myProfile.obj.mainContact);

        expect(myProfile.obj.mainContact).to.be.equal(contactObject.hash);
    });*/
    it('should update description and communication endpoints', async () => {
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        await contactModel.updateDescription(personIdHash, 'default', {personName: 'Test'});
        await contactModel.updateCommunicationEndpoint(personIdHash, 'default', {
            email: 'foo@test.one'
        });
        await contactModel.updateCommunicationEndpoint(personIdHash, 'default', {
            email: 'test@test.one'
        });

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone: Someone = await getObject(contactApp.obj.me);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);

        expect(myProfile).to.not.be.equal(undefined);
        expect(myProfile.obj.communicationEndpoints.length).to.be.equal(2);
        expect(myProfile.obj.contactDescriptions.length).to.be.equal(1);
    });

    it('should return a profile', async () => {
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        const profile = await contactModel.getProfile(personIdHash);
        expect(profile).to.not.be.equal(undefined);
    });

    it('should return a someone object', async () => {
        const personIdHash = await contactModel.createNewIdentity(false, 'foo@refinio.net');

        const someoneObject = await contactModel.getSomeoneObject(personIdHash);

        expect(someoneObject).to.not.be.equal(undefined);
    });

    it('should return a person identities', async () => {
        const person = await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'});
        const identities = await contactModel.listAlternateIdentities(person.idHash);
        if (identities === undefined) {
            throw new Error('Error in "should return a person identities"');
        }
        expect(identities.length).to.be.equal(1);
    });

    it('should update profile description for another person', async () => {
        const person = await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'});
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        await contactModel.updateDescription(person.idHash, 'default', {personName: 'test'});
        const someone: Someone = await contactModel.getSomeoneObject(person.idHash);
        if (!someone) {
            throw new Error('Error: someoneObject is undefined');
        }

        const profile = await getObjectByIdHash(someone.mainProfile);
        const mainContact = profile.obj.contactDescriptions[0];
        expect(mainContact).to.not.be.equal(undefined);
    });

    // TODO not in V0.0.1
    // xit('should declare same person between foo and bar', async () => {
    //     const personA = (await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'}))
    //         .idHash;
    //     const someoneA = await contactModel.getSomeoneObject(personA);
    //
    //     const personB = await contactModel.createNewIdentity(false, 'bar@refinio.net');
    //     await contactModel.declareSamePerson(personA, personB);
    //
    //     const updatedSomeone = await contactModel.getSomeoneObject(personA);
    //
    //     if (updatedSomeone === undefined || someoneA === undefined) {
    //         throw new Error('Error in "should declare same person between foo and bar"');
    //     }
    //
    //     expect(updatedSomeone.mainProfile).to.be.equal(someoneA.mainProfile);
    //     expect(updatedSomeone.profiles.length).to.be.equal(2);
    //
    //     await new Promise((resolve, rejects) => {
    //         setTimeout(() => resolve(), 500);
    //     });
    // });

    after(async () => {
        await testModel.shutdown();
        closeInstance();
        await removeDir(`./test/${dbKey}`);
        // await StorageTestInit.deleteTestDB();
    });
});
