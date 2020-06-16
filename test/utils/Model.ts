// @ts-nocheck
import JournalModel from '../../lib/JournalModel';
import QuestionnaireModel from '../../lib/QuestionnaireModel';
import WbcDiffModel from '../../lib/WbcDiffModel';
import HeartEventModel from '../../lib/HeartEventModel';
import DocumentModel from '../../lib/DocumentModel';
import ConnectionsModel from '../../lib/ConnectionsModel';
import BodyTemperatureModel from '../../lib/BodyTemperatureModel';
import DiaryModel from '../../lib/DiaryModel';
import NewsModel from '../../lib/NewsModel';
import OneInstanceModel, {AuthenticationState} from '../../lib/OneInstanceModel';
import ChannelManager from '../../lib/ChannelManager';
import ContactModel from '../../lib/ContactModel';
import ConsentFileModel from '../../lib/ConsentFileModel';
import PropertyTreeStore, {PropertyTree} from '../../lib/SettingsModel';

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
        await this.diary.init();
        await this.bodyTemperature.init();
        await this.consentFile.init();
        await this.settings.init();
    }

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
