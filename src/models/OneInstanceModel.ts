import EventEmitter from 'events';
import {closeInstance, initInstance} from 'one.core/lib/instance';
import Recipes from '../recipes/recipes';
import oneModules from '../generated/oneModules';
import {Module, SHA256Hash, VersionedObjectResult, Instance, Person} from '@OneCoreTypes';
import {
    createSingleObjectThroughPurePlan,
    VERSION_UPDATES,
    createManyObjectsThroughPurePlan
} from 'one.core/lib/storage';
import ConnectionsModel from './ConnectionsModel';
//@ts-ignore
import {getDbInstance} from 'one.core/lib/system/storage-base';
import {implode} from 'one.core/lib/microdata-imploder';
import ChannelManager, {ChannelInformation} from './ChannelManager';
import i18nModelsInstance from '../i18n';
import ConsentFileModel from './ConsentFileModel';
import {createRandomString} from 'one.core/lib/system/crypto-helpers';
import {calculateIdHashOfObj} from 'one.core/lib/util/object';
import AccessModel, {FreedaAccessGroups} from './AccessModel';

/**
 * Represents the state of authentication.
 */
export enum AuthenticationState {
    NotAuthenticated,
    Authenticating,
    Authenticated
}

/**
 * Represent the mode the user will choose to logout
 *       ->purge Data: logout and delete the current indexedDB instance
 *       ->logout: simply close instance
 */
export enum LogoutMode {
    PurgeData,
    KeepData
}

/**
 * Import all plan modules
 */
async function importModules(): Promise<VersionedObjectResult<Module>[]> {
    const modules = Object.keys(oneModules).map(key => ({
        moduleName: key,
        code: oneModules[key]
    }));

    return Promise.all(
        modules.map(module =>
            createSingleObjectThroughPurePlan(
                {
                    module: '@one/module-importer',
                    versionMapPolicy: {
                        '*': VERSION_UPDATES.NONE_IF_LATEST
                    }
                },
                module
            )
        )
    );
}

/**
 * Model that exposes functionality closely related to one.core
 */
export default class OneInstanceModel extends EventEmitter {
    /** Keeps track of the current user state. */
    private currentAuthenticationState: AuthenticationState;
    /**
     * Keeps track of user registration state:
     * true -> user is register and need to agree privacy policy
     * false -> user has finished the registration process
     */
    private currentRegistrationState: boolean;
    /**
     * is set in the registration process
     */
    private currentPatientTypeState: string;
    /**
     * if the partner has no patient, the state is true,
     * after the patient - partner connection is established,
     * the partner state becomes false
     */
    private currentPartnerState: boolean;

    private password: string;
    private randomEmail: string | null;
    private randomInstanceName: string | null;

    private connectionsModel: ConnectionsModel;
    private channelManager: ChannelManager;
    private consentFileModel: ConsentFileModel;
    private accessModel: AccessModel;

    // encrypt everything by default
    private encryptStorage: boolean = true;

    /**
     * Construct a new model instance
     *
     * @param {ConnectionsModel} connectionsModel
     * @param {ChannelManager} channelManager
     * @param {ConsentFileModel} consentFileModel
     * @param {AccessModel} accessModel
     */
    constructor(
        connectionsModel: ConnectionsModel,
        channelManager: ChannelManager,
        consentFileModel: ConsentFileModel,
        accessModel: AccessModel
    ) {
        super();
        this.password = '';
        this.randomEmail = '';
        this.randomInstanceName = '';
        this.currentAuthenticationState = AuthenticationState.NotAuthenticated;
        this.connectionsModel = connectionsModel;
        this.currentRegistrationState = false;
        this.currentPartnerState = false;
        this.currentPatientTypeState = '';
        this.channelManager = channelManager;
        this.consentFileModel = consentFileModel;
        this.accessModel = accessModel;
    }

    authenticationState(): AuthenticationState {
        return this.currentAuthenticationState;
    }

    registrationState(): boolean {
        return this.currentRegistrationState;
    }

    patientTypeState(): string {
        return this.currentPatientTypeState;
    }

    partnerState(): boolean {
        return this.currentPartnerState;
    }

    partnerConnectedWithPatient(): void {
        this.currentPartnerState = false;
        this.emit('partner_state_changed');
    }

    /**
     * Both in register and login cases we need to know if the instance already exists:
     * if the user has login before on this device, the instance name will be available
     * in local storage.
     *
     * @returns {boolean}
     */
    private static checkIfInstanceExists(): boolean {
        return !!localStorage.getItem('instance');
    }

    /**
     * When the recovery process is started, the previously generated email is read from the qr code.
     * The previously created instance with that email as owner is deleted and a new one is created.
     * The user has to re-enter a password, which will be used for the new instance.
     *
     * @param {string} email
     * @param {string} secret
     * @param {string} patientType
     * @param {string} anonymousEmail
     * @returns {Promise<void>}
     */
    async recoverInstance(
        email: string,
        secret: string,
        patientType: string,
        anonymousEmail: string
    ): Promise<void> {
        this.currentPatientTypeState = patientType;

        try {
            const ownerIdHash = await calculateIdHashOfObj({
                $type$: 'Person',
                email: localStorage.getItem('email')
            } as Person);
            const instanceIdHash = await calculateIdHashOfObj({
                $type$: 'Instance',
                name: localStorage.getItem('instance'),
                owner: ownerIdHash
            } as Instance);
            await this.deleteInstance('data#' + instanceIdHash);
        } catch (_) {
            throw Error(i18nModelsInstance.t('errors:login.userNotFound'));
        }
        this.password = secret;
        await this.createNewInstanceWithReceivedEmail(email, false, anonymousEmail);
    }

    /**
     * In instance take over case, the new instance will receive the user email
     * via qr code and the new instance will be created using that email.
     *
     * @param {string} email
     * @param {boolean} takeOver
     * @param {string} anonymousEmail
     */
    async createNewInstanceWithReceivedEmail(
        email: string,
        takeOver = false,
        anonymousEmail?: string
    ): Promise<void> {
        this.randomEmail = email;
        this.randomInstanceName = await createRandomString(64);
        localStorage.setItem('device_id', await createRandomString(64));
        localStorage.setItem('email', this.randomEmail);
        localStorage.setItem('instance', this.randomInstanceName);

        const {encryptStorage} = this;

        await initInstance({
            name: this.randomInstanceName,
            email: this.randomEmail,
            secret: this.password,
            encryptStorage,
            ownerName: 'name' + this.randomEmail,
            initialRecipes: Recipes
        });

        await importModules();
        this.unregister();
        this.initialisingApplication(anonymousEmail, takeOver);
    }

    /**
     * Open an existing instance or create a new one if the instance does not exist.
     *
     * @param {string} secret - Secret for decryption
     */
    async initialiseInstance(secret: string): Promise<void> {
        this.currentAuthenticationState = AuthenticationState.Authenticating;
        this.password = secret;
        this.randomEmail = localStorage.getItem('email');
        this.randomInstanceName = localStorage.getItem('instance');

        if (this.randomInstanceName === null && this.randomEmail === null) {
            this.randomEmail = await createRandomString(20);
            this.randomInstanceName = await createRandomString(64);
            localStorage.setItem('device_id', await createRandomString(64));
            localStorage.setItem('email', this.randomEmail);
            localStorage.setItem('instance', this.randomInstanceName);
        }

        if (this.randomInstanceName && this.randomEmail) {
            const {encryptStorage} = this;

            await initInstance({
                name: this.randomInstanceName,
                email: this.randomEmail,
                secret,
                encryptStorage,
                ownerName: 'name' + this.randomEmail,
                initialRecipes: Recipes
            });

            await importModules();
        }
        this.initialisingApplication();
    }

    /**
     * Helper function for initialising the modules of the application.
     */
    initialisingApplication(anonymousEmail?: string, takeOver?: boolean): void {
        // TODO: replace this when we have events that can handle promises as return values
        const firstCallback = (error?: Error): void => {
            if (error) {
                throw error;
            } else {
                this.emit('authstate_changed');

                // if a partner has no patients associated, then he enters in a
                // partner state, where the application is not available until a
                // patient is being associated with this partner
                this.accessModel
                    .getAccessGroupPersons(FreedaAccessGroups.partner)
                    .then(partners => {
                        if (
                            this.currentPatientTypeState.includes('partner') &&
                            partners.length === 0
                        ) {
                            this.currentPartnerState = true;
                            this.emit('partner_state_changed');
                        }
                    })
                    .catch(e => {
                        console.error('Error getting access group members:', e);
                    });
            }
        };
        // The AuthenticationState is needed to be on Authenticated so that
        // the models can be initialised (see Model.ts init method).
        this.currentAuthenticationState = AuthenticationState.Authenticated;
        this.emit(
            'authstate_changed_first',
            this.currentRegistrationState,
            firstCallback,
            anonymousEmail,
            takeOver
        );
    }

    /**
     * Login into the one instance using an existing instance.
     *
     * @param {string} secret - Secret for decryption
     * @param {string} patientType - type of the patient or of the partner
     * @param {string} isPersonalCloudInvite - if the url contains an invite
     * for personal cloud, the instance should not be initialised yet
     */
    async login(
        secret: string,
        patientType: string,
        isPersonalCloudInvite: boolean
    ): Promise<void> {
        this.currentPatientTypeState = patientType;

        if (isPersonalCloudInvite) {
            this.password = secret;
            this.currentRegistrationState = true;
            this.currentAuthenticationState = AuthenticationState.Authenticated;
            this.emit('registration_state_changed');
            this.emit('authstate_changed');
            return;
        }

        if (!OneInstanceModel.checkIfInstanceExists()) {
            throw TypeError(i18nModelsInstance.t('errors:login.userNotFound'));
        }

        const name = localStorage.getItem('instance');
        const email = localStorage.getItem('email');

        if (name && email) {
            await this.initialiseInstance(secret);

            const consentFile = await this.consentFileModel.getOwnerConsentFile();

            if (consentFile === undefined) {
                this.currentRegistrationState = true;
                this.emit('registration_state_changed');
            } else {
                this.currentRegistrationState = false;
            }
        }
    }

    /**
     * Depending on the logoutMode user will logout or the instance will be deleted.
     *
     * @param {logout} logoutMode
     */
    async logout(logoutMode: LogoutMode): Promise<void> {
        await this.connectionsModel.shutdown();
        const dbInstance = getDbInstance();

        setTimeout(() => {
            dbInstance.close();
            closeInstance();
        }, 1500);

        if (logoutMode === LogoutMode.PurgeData) {
            await this.deleteInstance(dbInstance.name);
        }

        this.currentAuthenticationState = AuthenticationState.NotAuthenticated;
        this.emit('authstate_changed_first');
        this.emit('authstate_changed');
    }

    /**
     * Register into the one instance by creating a new one.
     * @param {string} secret - Secret for decryption
     * @param {string} patientType
     */
    async register(secret: string, patientType: string): Promise<void> {
        if (!OneInstanceModel.checkIfInstanceExists()) {
            this.currentRegistrationState = true;
            this.currentPatientTypeState = patientType;
            await this.initialiseInstance(secret);
            this.emit('registration_state_changed');
            return;
        }

        throw EvalError(i18nModelsInstance.t('errors:oneInstanceModel.loginNotRegister'));
    }

    /**
     * After the user accepts the privacy policy or synchronise the current device
     * with another device that he owns, the registration state will be set to false
     * and the application will be displayed.
     */
    unregister(): void {
        this.currentRegistrationState = false;
        this.emit('registration_state_changed');
    }

    /**
     * Create a backup of the whole instance.
     *
     * @returns {Promise<Blob>} The exported content
     */
    async backupInstance(): Promise<Blob> {
        const hashesToImplode: SHA256Hash[] = [];
        const channelsInfo = await this.channelManager.channels();
        await Promise.all(
            channelsInfo.map(async (channelInfo: ChannelInformation) => {
                return hashesToImplode.push(channelInfo.hash);
            })
        );

        const implodedHashesResult = await Promise.all(
            hashesToImplode.map(async hashToImplode => await implode(hashToImplode))
        ).then(microdataArray => {
            return JSON.stringify(microdataArray);
        });

        return new Blob([implodedHashesResult], {type: 'text/html'});
    }

    /**
     * Restore an instance from an export
     *
     * @param {Blob} data - The data from which to restore the instance
     */
    async restoreInstance(data: Blob): Promise<void> {
        const dataText = await new Promise((resolve, reject) => {
            const fr = new FileReader();

            fr.addEventListener('load', () => {
                resolve(fr.result);
            });

            fr.addEventListener('error', err => {
                reject(err);
            });

            fr.readAsText(data);
        });

        if (typeof dataText === 'string') {
            const microdataArray = JSON.parse(dataText);

            await createManyObjectsThroughPurePlan(
                {
                    module: '@module/explodeObject',
                    versionMapPolicy: {
                        '*': VERSION_UPDATES.ALWAYS
                    }
                },
                microdataArray
            );
        }
    }

    getSecret(): string {
        return this.password;
    }

    /**
     * Deletes the instance db which name is given as argument.
     *
     * @param {string} dbInstanceName
     * @returns {Promise<void>}
     */
    async deleteInstance(dbInstanceName?: string): Promise<void> {
        const nameOfDBInstance = dbInstanceName ? dbInstanceName : getDbInstance().name;

        localStorage.clear();
        sessionStorage.clear();
        return new Promise((resolve, reject) => {
            const deletion = indexedDB.deleteDatabase(nameOfDBInstance);
            deletion.onsuccess = () => {
                console.log(111111);
                resolve();
                console.log(22222222);
            };
            deletion.onerror = () => {
                console.log(3333333);
                reject(new Error(`Error deleting indexedDB: ${deletion.error}`));
                console.log(4444444444);
            };
        });
    }
}
