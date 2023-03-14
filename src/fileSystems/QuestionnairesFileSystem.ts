import type QuestionnaireModel from '../models/QuestionnaireModel';
import type {QuestionnaireResponses} from '../recipes/QuestionnaireRecipes/QuestionnaireResponseRecipes';
import type {FilesInformation} from './utils/EasyFileSystemUtils';
import EasyFileSystemUtils from './utils/EasyFileSystemUtils';
import EasyFileSystem from './utils/EasyFileSystem';

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
        const easyFileSystemUtils = new EasyFileSystemUtils<QuestionnaireResponses>();

        this.setRootDirectory(
            easyFileSystemUtils.getYearMonthDayFileFolderSystem(
                questionnaireModel.responsesIterator,
                this.parseDataFilesContent.bind(this)
            )
        );
    }

    parseDataFilesContent(data: QuestionnaireResponses): FilesInformation {
        const files: FilesInformation = [];

        data.response.forEach(response => {
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
