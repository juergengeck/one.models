import type QuestionnaireModel from '../models/QuestionnaireModel';
import type {QuestionnaireResponses} from '../recipes/QuestionnaireRecipes/QuestionnaireResponseRecipes';
import {DateToObjectDataTransformDirectory} from './cachedDirectories/DateToObjectDataTransformDirectory';
import {DaysDirectory} from './cachedDirectories/DaysDirectory';
import {MonthsDirectory} from './cachedDirectories/MonthsDirectory';
import {YearsDirectory} from './cachedDirectories/YearsDirectory';
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
        const iterator = questionnaireModel.responsesIterator.bind(questionnaireModel);

        const rootDirectory = new YearsDirectory(iterator);
        rootDirectory
            .setSubDirectory(p => new MonthsDirectory(iterator, p))
            .setSubDirectory(p => new DaysDirectory(iterator, p))
            .setSubDirectory(
                p => new DateToObjectDataTransformDirectory<ObjectDataType>(iterator, p)
            )
            .setSubDirectoryAsFunction(this.parseDataFilesContent.bind(this));

        /*const rootDirectory2 = new DateObjectDataDirectories(iterator).setSubDirectoryAsFunction(
            this.parseDataFilesContent.bind(this)
        );*/

        this.setRootDirectory(rootDirectory.createDirectoryContent.bind(rootDirectory));
        questionnaireModel.onUpdated(rootDirectory.markCachesAsOutOfDate.bind(rootDirectory));
    }

    /**
     * @param data
     * @returns
     */
    private parseDataFilesContent(data: {data: ObjectData<ObjectDataType>}): EasyDirectoryContent {
        const objectData = data.data;

        const dir = new Map<string, EasyDirectoryEntry>();
        const creationTime = objectData.creationTime;
        const channelOwnerAddon = objectData.channelOwner ? `_${objectData.channelOwner}` : '';
        const time = `${creationTime.getHours()}-${creationTime.getMinutes()}-${creationTime.getSeconds()}-${creationTime.getMilliseconds()}`;

        objectData.data.response.forEach(response => {
            const nameAddon = `${response.status}${
                response.questionnaire ? `_${response.questionnaire}` : ''
            }`;
            dir.set(
                `${time}_${nameAddon}${channelOwnerAddon}_${creationTime.getMilliseconds()}.json`,
                {
                    type: 'regularFile',
                    content: JSON.stringify(response, null, 4)
                }
            );
        });

        return dir;
    }
}
