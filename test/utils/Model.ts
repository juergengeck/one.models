// @ts-nocheck
import JournalModel from '../../lib/model/JournalModel';
import QuestionnaireModel from '../../lib/model/QuestionnaireModel';
import WbcDiffModel from '../../lib/model/WbcDiffModel';
import HeartEventModel from '../../lib/model/HeartEventModel';
import DocumentModel from '../../lib/model/DocumentModel';
import ConnectionsModel from '../../lib/model/ConnectionsModel';
import BodyTemperatureModel from '../../lib/model/BodyTemperatureModel';
import DiaryModel from '../../lib/model/DiaryModel';
import NewsModel from '../../lib/model/NewsModel';
import OneInstanceModel, {AuthenticationState} from '../../lib/model/OneInstanceModel';
import ChannelManager from '../../lib/model/ChannelManager';
import ContactModel from '../../lib/model/ContactModel';
import ConsentFileModel from '../../lib/model/ConsentFileModel';
import PropertyTreeStore, {PropertyTree} from '../../lib/model/SettingsModel';

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
