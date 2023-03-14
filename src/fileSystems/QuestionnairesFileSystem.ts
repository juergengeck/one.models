import type QuestionnaireModel from '../models/QuestionnaireModel';
import type {QuestionnaireResponses} from '../recipes/QuestionnaireRecipes/QuestionnaireResponseRecipes';
import DateObjectFolderSystems from './utils/DateObjectFolderSystems';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './utils/EasyFileSystem';
import EasyFileSystem from './utils/EasyFileSystem';
import type {ObjectData} from '../models/ChannelManager';

type ObjectDataType = QuestionnaireResponses;

/**
 * Provides a file system about questionnaire responses
 */
export default class QuestionnairesFileSystem extends EasyFileSystem {
    /**
     * Constructor
     * @param questionnaireModel
     */
    constructor(questionnaireModel: QuestionnaireModel) {
        super(true);
        const dateObjectFolderSystems = new DateObjectFolderSystems<ObjectDataType>(
            questionnaireModel.responsesIterator.bind(questionnaireModel)
        );

        this.setRootDirectory(
            dateObjectFolderSystems.getYearMonthDayFileType(this.parseDataFilesContent.bind(this))
        );
    }

    /**
     * @param objectData
     * @returns
     */
    private parseDataFilesContent(objectData: ObjectData<ObjectDataType>): EasyDirectoryContent {
        const dir = new Map<string, EasyDirectoryEntry>();
        const creationTime = objectData.creationTime;
        const channelOwnerAddon = objectData.channelOwner ? `_${objectData.channelOwner}` : '';
        const time = `${creationTime.getHours()}-${creationTime.getMinutes()}-${creationTime.getSeconds()}-${creationTime.getMilliseconds()}`;

        objectData.data.response.forEach(response => {
            const nameAddon = `${response.status}${
                response.questionnaire ? `_${response.questionnaire}` : ''
            }`;
            dir.set(`${time}_${nameAddon}${channelOwnerAddon}_${creationTime.getMilliseconds()}`, {
                type: 'regularFile',
                content: JSON.stringify(response)
            });
        });

        return dir;
    }
}
