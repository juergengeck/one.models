/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {
    closeInstance,
    getInstanceIdHash,
    getInstanceOwnerIdHash,
    registerRecipes
} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdHash,
    getObjectByIdObj,
    getObjectWithType,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {SHA256Hash, Someone, Profile, SHA256IdHash, Person} from '@OneCoreTypes';
import ContactModel from '../lib/models/ContactModel';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import TestModel, {dbKey, importModules, TestAccessGroups} from './utils/TestModel';
import InstancesModel from '../lib/models/InstancesModel';
import Recipes from '../lib/recipes/recipes';
import {AccessModel, ChannelManager} from '../lib/models';
let contactModel: ContactModel;
let testModel;

describe('Contact model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey, secret: '1234'});
        await registerRecipes(Recipes);
        await importModules();

        const model = new TestModel('ws://localhost:8000', dbKey);
        await model.init(undefined);
        testModel = model;
        contactModel = model.contactModel;
    });

    it('should test init() function on a fresh instance', async () => {
        const contactApp = await ContactModel.getContactAppObject();
        expect(contactApp).to.not.be.equal(undefined);

        const mySomeone = await getObject(contactApp.obj.me);
        expect(mySomeone && mySomeone.mainProfile).to.not.be.undefined;
        expect(mySomeone.profiles).to.have.length(2);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);
        expect(myProfile).to.not.be.undefined;

        const myContact = await getObject(myProfile.obj.mainContact);
        expect(myContact).to.not.be.undefined;

        const myInstanceEndpoint = await getObject(myProfile.obj.mainContact);
        expect(myInstanceEndpoint).to.not.be.undefined;
    });

    it('should return my identities', async () => {
        const identities = await contactModel.myIdentities();
        expect(identities.length).to.not.be.equal(0);
    });

    it('should return main contact object', async () => {
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        const mainContact = await contactModel.getMainContactObject(personIdHash);
        expect(mainContact).to.not.be.equal(undefined);
    });

    it('should create another profile for another person', async () => {
        const personIdHash = await contactModel.createProfile(false, 'foo@refinio.net');
        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'Profile',
            personId: personIdHash
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
        const personIdHash = await contactModel.createProfile(false);
        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'Profile',
            personId: personIdHash
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

    it('should create profile for my person', async () => {
        const personIdHash = await contactModel.createProfile(true, 'thirdProfile@refinio.net');
        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'Profile',
            personId: personIdHash
        });

        expect(versionedProfileObject).to.not.be.equal(undefined);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone = await getObject(contactApp.obj.me);

        const foundSomeone = mySomeone.profiles.find(
            (profileIdHash: SHA256IdHash<Profile>) =>
                profileIdHash === versionedProfileObject.idHash
        );
        expect(foundSomeone).to.not.be.equal(undefined);
    });

    it('should create anon profile for my person', async () => {
        const personIdHash = await contactModel.createProfile(true);
        const versionedProfileObject = await getObjectByIdObj({
            $type$: 'Profile',
            personId: personIdHash
        });
        expect(versionedProfileObject).to.not.be.equal(undefined);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone = await getObject(contactApp.obj.me);

        const foundSomeone = mySomeone.profiles.find(
            (profileIdHash: SHA256IdHash<Profile>) =>
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
    it('should add a new contact object not as a main contact', async () => {
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

        // @ts-ignore
        await contactModel.addNewContactObjectAsMain(contactObject, false);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone = await getObject(contactApp.obj.me);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);
        expect(myProfile).to.not.be.equal(undefined);
        expect(myProfile.obj.contactObjects.length).to.be.equal(2);
    });

    it('should add new contact for a non existing profile', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                $type$: 'Person',
                email: 'newFoo@refinio.net'
            }
        );

        await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                $type$: 'Contact',
                personId: newPerson.idHash,
                communicationEndpoints: [],
                contactDescriptions: []
            }
        );
        await new Promise((resolve, rejects) => {
            setTimeout(() => resolve(), 500);
        });
        const someoneObject = await contactModel.getSomeoneObject(newPerson.idHash);
        expect(someoneObject).to.not.be.equal(undefined);

        if (!someoneObject) {
            throw new Error('Error: someoneObject is undefined');
        }
        const profile = await getObjectByIdHash(someoneObject.mainProfile);
        expect(profile).to.not.be.equal(undefined);

        const contact = await getObject(profile.obj.contactObjects[0]);
        expect(contact).to.not.be.equal(undefined);
    });

    it('should return contacts', async () => {
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        const mainContact = await contactModel.getContactObjects(personIdHash);
        expect(mainContact.length).to.not.be.equal(0);
    });
    it('should return a person someone object', async () => {
        const person = await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'});
        const someoneObject = await contactModel.getSomeoneObject(person.idHash);
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

    it('should add a new main contact for another person', async () => {
        const person = await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'});
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        const contactObject = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                $type$: 'Contact',
                personId: person.idHash,
                communicationEndpoints: [],
                contactDescriptions: []
            }
        );
        // @ts-ignore
        await contactModel.addNewContactObjectAsMain(contactObject, true);

        const someone = await contactModel.getSomeoneObject(person.idHash);

        if (!someone) {
            throw new Error('Error: someoneObject is undefined');
        }

        const profile = await getObjectByIdHash(someone.mainProfile);
        const mainContact = await getObject(profile.obj.mainContact);
        expect(mainContact).to.not.be.equal(undefined);
    });

    it('should add 3 equal contacts for another person and check if only one was added', async () => {
        const person = await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'});
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        await Promise.all(
            await [1, 2, 3].map(async ignored => {
                await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {
                        $type$: 'Contact',
                        personId: person.idHash,
                        communicationEndpoints: [],
                        contactDescriptions: []
                    }
                );
            })
        );

        const mainContact = await contactModel.listAlternateIdentities(person.idHash);
        expect(mainContact.length).to.be.equal(1);
    });

    it('should merge contacts', async () => {
        const mergedContacts = await contactModel.getMergedContactObjects(
            getInstanceOwnerIdHash() as SHA256IdHash<Person>
        );
        expect(Object.keys(mergedContacts.endpoints).length).to.be.equal(6);
    });

    it('should declare same person between foo and bar', async () => {
        const personA = (await getObjectByIdObj({$type$: 'Person', email: 'foo@refinio.net'}))
            .idHash;
        const someoneA = await contactModel.getSomeoneObject(personA);

        const personB = await contactModel.createProfile(false, 'bar@refinio.net');
        await contactModel.declareSamePerson(personA, personB);

        const updatedSomeone = await contactModel.getSomeoneObject(personA);

        if (updatedSomeone === undefined || someoneA === undefined) {
            throw new Error('Error in "should declare same person between foo and bar"');
        }

        expect(updatedSomeone.mainProfile).to.be.equal(someoneA.mainProfile);
        expect(updatedSomeone.profiles.length).to.be.equal(2);

        await new Promise((resolve, rejects) => {
            setTimeout(() => resolve(), 500);
        });
    });

    after(async () => {
        await testModel.shutdown();
        closeInstance();
        await StorageTestInit.deleteTestDB();
    });
});
