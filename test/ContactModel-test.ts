/**
 * @author Sebastian Șandru <sebastian@refinio.net>
 */
import {expect} from 'chai';
import {closeInstance, getInstanceOwnerIdHash, registerRecipes} from 'one.core/lib/instance';
import * as StorageTestInit from 'one.core/test/_helpers';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdHash,
    getObjectByIdObj,
    getObjectWithType,
    VERSION_UPDATES
} from 'one.core/lib/storage';
import {SHA256Hash, ContactApp, Someone, Profile, SHA256IdHash} from '@OneCoreTypes';
import ContactModel from '../lib/models/ContactModel';
import Recipes from '../lib/recipies/recipies';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import {getAllValues} from 'one.core/lib/reverse-map-query';
import Model, {dbKey, importModules} from './utils/Model';

const contactModel = new Model().contactModel;
let contactAppIdHash: SHA256Hash<ContactApp>;

describe('Contact model test', () => {
    before(async () => {
        await StorageTestInit.init({dbKey: dbKey});
        await registerRecipes(Recipes);
        await importModules();
    });

    it('should test init() function on a fresh instance', async () => {
        await contactModel.init();

        const contactApp = await ContactModel.getContactAppObject();
        expect(contactApp).to.not.be.equal(undefined);

        const mySomeone = await getObject(contactApp.obj.me);
        expect(mySomeone && mySomeone.mainProfile).to.not.be.undefined;
        expect(mySomeone.profiles).to.have.length(1);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);
        expect(myProfile).to.not.be.undefined;

        const myContact = await getObject(myProfile.obj.mainContact);
        expect(myContact).to.not.be.undefined;

        const myInstanceEndpoint = await getObject(myProfile.obj.mainContact);
        expect(myInstanceEndpoint).to.not.be.undefined;

        contactAppIdHash = contactApp.hash;
    });

    it('should test init() function on an existing instance', async () => {
        await contactModel.init();

        const contactApp = await ContactModel.getContactAppObject();
        expect(contactAppIdHash).to.be.equal(contactApp.hash);
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
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Person',
                email: 'foo@refinio.net'
            }
        );
        const personIdHash = await contactModel.createProfile(false, newPerson.obj.email);
        const versionedProfileObject = await getObjectByIdObj({
            type: 'Profile',
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
            type: 'Profile',
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
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Person',
                email: 'secondaryProfile@refinio.net'
            }
        );
        const personIdHash = await contactModel.createProfile(true, newPerson.obj.email);
        const versionedProfileObject = await getObjectByIdObj({
            type: 'Profile',
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
            type: 'Profile',
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
    it('should add a new contact object as a main contact', async () => {
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
                type: 'OneInstanceEndpoint',
                personId: personIdHash,
                personKeys: personPubEncryptionKeysHash,
                instanceKeys: personPubEncryptionKeysHash
            }
        );
        const contactObject = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                type: 'Contact',
                personId: personIdHash,
                communicationEndpoints: [instanceEndpoint.hash],
                contactDescriptions: []
            }
        );

        await contactModel.addNewContactObject(contactObject, true);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone = await getObject(contactApp.obj.me);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);

        const myContact = await getObject(myProfile.obj.mainContact);
        expect(myContact).to.not.be.equal(undefined);
    });

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
                type: 'OneInstanceEndpoint',
                personId: personIdHash,
                personKeys: personPubEncryptionKeysHash,
                instanceKeys: personPubEncryptionKeysHash
            }
        );
        const contactObject = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                type: 'Contact',
                personId: personIdHash,
                communicationEndpoints: [instanceEndpoint.hash],
                contactDescriptions: []
            }
        );

        await contactModel.addNewContactObject(contactObject, false);

        const contactApp = await ContactModel.getContactAppObject();

        const mySomeone = await getObject(contactApp.obj.me);

        const myProfile = await getObjectByIdHash(mySomeone.mainProfile);
        expect(myProfile).to.not.be.equal(undefined);
        expect(myProfile.obj.contactObjects.length).to.not.be.equal(0);
    });

    it('should add new contact for a non existing profile', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Person',
                email: 'newFoo@refinio.net'
            }
        );

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
                type: 'OneInstanceEndpoint',
                personId: newPerson.idHash,
                personKeys: personPubEncryptionKeysHash,
                instanceKeys: personPubEncryptionKeysHash
            }
        );
        const contactObject = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                type: 'Contact',
                personId: newPerson.idHash,
                communicationEndpoints: [instanceEndpoint.hash],
                contactDescriptions: []
            }
        );

        await contactModel.addNewContactObject(contactObject, false);
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
    /*
    it('should create a falsy profile in contactApp and let the hook make it right', async () => {
        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Person',
                email: 'secondaryProfile11@refinio.net'
            }
        );

        const emptyContact = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Contact',
                personId: newPerson.idHash,
                communicationEndpoints: [],
                contactDescriptions: []
            }
        );

        const emptyProfile = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Profile',
                personId: newPerson.idHash,
                mainContact: emptyContact.hash,
                contactObjects: [emptyContact.hash]
            }
        );

        const contactApp = await ContactModel.getContactAppObject();
        const mySomeone = await getObject(contactApp.obj.me);
        mySomeone.profiles.push(emptyProfile.idHash);

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            mySomeone
        );

        contactApp.obj.me = await calculateHashOfObj(mySomeone);

        await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            contactApp.obj
        );

        /!** wait for the hook to do his job **!/
        await new Promise((resolve, rejected) => {
            setTimeout(() => resolve(), 500);
        });

        const instance = await getObjectByIdObj({
            type: 'Instance',
            name: newPerson.obj.email,
            owner: newPerson.idHash
        });

        expect(instance).not.to.be.equal(undefined);

        /!** checking if the keys are present in the contact object **!/

        const profile = await getObjectByIdObj({type: 'Profile', personId: newPerson.idHash});

        expect(profile).not.to.be.equal(undefined);

        const contact = await getObject(profile.obj.mainContact);

        expect(contact.communicationEndpoints.length).not.to.be.equal(0);
        expect(contact.contactDescriptions.length).to.be.equal(0);
    });*/

    it('should return contacts', async () => {
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        const mainContact = await contactModel.getContactObjects(personIdHash);
        expect(mainContact.length).to.not.be.equal(0);
    });
    it('should return a person someone object', async () => {
        /** saved previously for another person **/
        const person = await getObjectByIdObj({type: 'Person', email: 'foo@refinio.net'});
        const someoneObject = await contactModel.getSomeoneObject(person.idHash);
        expect(someoneObject).to.not.be.equal(undefined);
    });

    it('should return a person identities', async () => {
        const person = await getObjectByIdObj({type: 'Person', email: 'foo@refinio.net'});
        const identities = await contactModel.listAlternateIdentities(person.idHash);
        expect(identities.length).to.be.equal(0);
    });

    it('should add a new main contact for another person', async () => {
        const person = await getObjectByIdObj({type: 'Person', email: 'foo@refinio.net'});
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
                type: 'OneInstanceEndpoint',
                personId: personIdHash,
                personKeys: personPubEncryptionKeysHash,
                instanceKeys: personPubEncryptionKeysHash
            }
        );
        const contactObject = await createSingleObjectThroughPurePlan(
            {module: '@one/identity'},
            {
                type: 'Contact',
                personId: person.idHash,
                communicationEndpoints: [instanceEndpoint.hash],
                contactDescriptions: []
            }
        );
        await contactModel.addNewContactObject(contactObject, true);

        const someone = await contactModel.getSomeoneObject(person.idHash);

        if (!someone) {
            throw new Error('Error: someoneObject is undefined');
        }

        const profile = await getObjectByIdHash(someone.mainProfile);
        const mainContact = await getObject(profile.obj.mainContact);
        expect(mainContact).to.not.be.equal(undefined);
    });

    it('should add 3 equal contacts for another person and check if only one was added + main contact', async () => {
        const person = await getObjectByIdObj({type: 'Person', email: 'foo@refinio.net'});
        const personIdHash = getInstanceOwnerIdHash();

        if (!personIdHash) {
            throw new Error('Error: personIdHash is undefined');
        }

        const personKeyLink = await getAllValues(personIdHash, true, 'Keys');
        const personPubEncryptionKeys = await getObjectWithType(personKeyLink[0].toHash, 'Keys');

        const personPubEncryptionKeysHash = await calculateHashOfObj(personPubEncryptionKeys);

        await Promise.all(
            [1, 2, 3].map(async (ignored) => {
                const instanceEndpoint = await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {
                        type: 'OneInstanceEndpoint',
                        personId: personIdHash,
                        personKeys: personPubEncryptionKeysHash,
                        instanceKeys: personPubEncryptionKeysHash
                    }
                );
                const contactObject = await createSingleObjectThroughPurePlan(
                    {module: '@one/identity'},
                    {
                        type: 'Contact',
                        personId: person.idHash,
                        communicationEndpoints: [instanceEndpoint.hash],
                        contactDescriptions: []
                    }
                );
                await contactModel.addNewContactObject(contactObject, false);
            })
        );

        const mainContact = await contactModel.getContactObjects(person.idHash);
        expect(mainContact.length).to.be.equal(2);
    });

    it('should merge contacts', async () => {
        const person = await getObjectByIdObj({type: 'Person', email: 'foo@refinio.net'});
        const mergedContacts = await contactModel.getMergedContactObjects(person.idHash);
        expect(Object.keys(mergedContacts.endpoints).length).to.be.equal(3);
    });

    it('should declare same person between foo and bar', async () => {
        const personA = (await getObjectByIdObj({type: 'Person', email: 'foo@refinio.net'})).idHash;
        const someoneA = await contactModel.getSomeoneObject(personA);

        const newPerson = await createSingleObjectThroughPurePlan(
            {
                module: '@one/identity',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            },
            {
                type: 'Person',
                email: 'bar@refinio.net'
            }
        );
        const personB = await contactModel.createProfile(false, newPerson.obj.email);
        await contactModel.declareSamePerson(personA, personB);

        const updatedSomeone = await contactModel.getSomeoneObject(personA);
        expect(updatedSomeone.mainProfile).to.be.equal(someoneA.mainProfile);
        expect(updatedSomeone.profiles.length).to.be.equal(2);
    });

    after(async () => {
        closeInstance();
        await StorageTestInit.deleteTestDB('./test/' + dbKey);
    });
});
