import type QuestionnaireModel from '../models/QuestionnaireModel';
import type {QuestionnaireResponses} from '../recipes/QuestionnaireRecipes/QuestionnaireResponseRecipes';
import type {FilesInformation} from './utils/IteratorSystemUtils';
import IteratorSystemUtils from './utils/IteratorSystemUtils';
import EasyFileSystem from './utils/EasyFileSystem';
import type {ObjectData} from '../models/ChannelManager';

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
        const iteratorSystemUtils = new IteratorSystemUtils<QuestionnaireResponses>(
            questionnaireModel.responsesIterator.bind(questionnaireModel)
        );

        this.setRootDirectory(
            iteratorSystemUtils.getYearMonthDayFileFolderSystem(
                this.parseDataFilesContent.bind(this)
            )
        );
    }

    private parseDataFilesContent(
        objectData: ObjectData<QuestionnaireResponses>
    ): FilesInformation {
        const files: FilesInformation = [];

        objectData.data.response.forEach(response => {
            files.push({
                fileNameAddon: `${response.status}${
                    response.questionnaire ? `_${response.questionnaire}` : ''
                }`,
                fileContent: JSON.stringify(response)
            });
        });

        return files;
    }
}
