// @ts-nocheck
import JournalModel from '../../lib/models/JournalModel';
import QuestionnaireModel from '../../lib/models/QuestionnaireModel';
import WbcDiffModel from '../../lib/models/WbcDiffModel';
import HeartEventModel from '../../lib/models/HeartEventModel';
import DocumentModel from '../../lib/models/DocumentModel';
import ConnectionsModel from '../../lib/models/ConnectionsModel';
import BodyTemperatureModel from '../../lib/models/BodyTemperatureModel';
import DiaryModel from '../../lib/models/DiaryModel';
import NewsModel from '../../lib/models/NewsModel';
import OneInstanceModel, {AuthenticationState} from '../../lib/models/OneInstanceModel';
import ChannelManager from '../../lib/models/ChannelManager';
import ContactModel from '../../lib/models/ContactModel';
import ConsentFileModel from '../../lib/models/ConsentFileModel';
import PropertyTreeStore, {PropertyTree} from '../../lib/models/SettingsModel';
import {Module, Person, VersionedObjectResult, BodyTemperature} from '@OneCoreTypes';
import {createSingleObjectThroughPurePlan, VERSION_UPDATES} from 'one.core/lib/storage';
import oneModules from '../../lib/generated/oneModules';
import {AccessModel} from '../../lib/models';

export function createRandomBodyTemperature(): BodyTemperature {
    return {
        type: 'BodyTemperature',
        temperature: Math.random().toString()
    };
}

/**
 * Import all plan modules
 */
export async function importModules(): Promise<VersionedObjectResult<Module>[]> {
    const modules = Object.keys(oneModules).map((key) => ({
        moduleName: key,
        code: oneModules[key]
    }));

    return await Promise.all(
        modules.map(
            async (module) =>
                await createSingleObjectThroughPurePlan(
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

export default class Model {
    constructor() {
        this.channelManager = new ChannelManager();
        this.questionnaires = new QuestionnaireModel(this.channelManager);
        this.wbcDiffs = new WbcDiffModel();
        this.heartEvents = new HeartEventModel();
        this.documents = new DocumentModel();
        this.diary = new DiaryModel(this.channelManager);
        this.bodyTemperature = new BodyTemperatureModel(this.channelManager);
        this.connections = new ConnectionsModel();
        this.access = new AccessModel();
        this.news = new NewsModel();

        this.consentFile = new ConsentFileModel(this.channelManager);
        this.oneInstance = new OneInstanceModel(
            this.connections,
            this.channelManager,
            this.consentFile
        );
        this.contactModel = new ContactModel(this.oneInstance);
        this.settings = new PropertyTreeStore('Settings', '.');
        this.journal = new JournalModel(
            this.wbcDiffs,
            this.questionnaires,
            this.heartEvents,
            this.documents,
            this.diary,
            this.bodyTemperature,
            this.consentFile
        );

        this.oneInstance.on('authstate_changed_first', (firstCallback: (err?: Error) => void) => {
            if (this.oneInstance.authenticationState() === AuthenticationState.Authenticated) {
                this.init()
                    .then(() => {
                        firstCallback();
                    })
                    .catch((err: any) => {
                        firstCallback(err);
                    });
            }
        });
    }

    async init(): Promise<void> {
        await this.channelManager.init();
        await this.contactModel.init();
        await this.questionnaires.init();
        await this.connections.init();
        await this.access.init();
        await this.diary.init();
        await this.bodyTemperature.init();
        await this.consentFile.init();
        await this.settings.init();
    }
    access: AccessModel;
    channelManager: ChannelManager;
    contactModel: ContactModel;
    journal: JournalModel;
    questionnaires: QuestionnaireModel;
    wbcDiffs: WbcDiffModel;
    heartEvents: HeartEventModel;
    documents: DocumentModel;
    news: NewsModel;
    oneInstance: OneInstanceModel;
    connections: ConnectionsModel;
    diary: DiaryModel;
    bodyTemperature: BodyTemperatureModel;
    consentFile: ConsentFileModel;
    settings: PropertyTree;
}
