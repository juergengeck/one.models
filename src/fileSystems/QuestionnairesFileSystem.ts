import type QuestionnaireModel from '../models/QuestionnaireModel';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './utils/EasyFileSystem';
import EasyFileSystem from './utils/EasyFileSystem';

/**
 * Provides information about user profiles
 */
export default class QuestionnairesFileSystem extends EasyFileSystem {
    private readonly questionnaireModel: QuestionnaireModel;

    /**
     * Constructor
     * @param questionnaireModel
     */
    constructor(questionnaireModel: QuestionnaireModel) {
        super(true);
        this.questionnaireModel = questionnaireModel;
        this.setRootDirectory(this.createYearFolders.bind(this));
    }

    /**
     * Iterates questionnaire responses, separating them in folders by year
     * @returns
     */
    async createYearFolders(): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const questionnairesResponses = await this.questionnaireModel.responses();

        for (let i = 0; i < questionnairesResponses.length; i++) {
            const creationYear = questionnairesResponses[i].creationTime.getFullYear();

            if (
                i === questionnairesResponses.length - 1 ||
                creationYear !== questionnairesResponses[i + 1].creationTime.getFullYear()
            ) {
                dir.set(String(creationYear), {
                    type: 'directory',
                    content: this.createMonthFolders.bind(this, creationYear)
                });
            }
        }

        return dir;
    }

    /**
     * Iterates questionnaire responses, separating them in folders by month for given year
     * @returns
     */
    async createMonthFolders(year: number): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();
        const questionnairesResponses = await this.questionnaireModel.responses();

        for (let i = 0; i < questionnairesResponses.length; i++) {
            const creationMonth = questionnairesResponses[i].creationTime.getMonth();

            if (
                i === questionnairesResponses.length - 1 ||
                (year === questionnairesResponses[i].creationTime.getFullYear() &&
                    creationMonth !== questionnairesResponses[i + 1].creationTime.getMonth())
            ) {
                // due to months starting at 0, we add 1
                dir.set(String(creationMonth + 1).padStart(2, '0'), {
                    type: 'directory',
                    content: this.createDayFolders.bind(this, year, creationMonth)
                });
            }
        }

        return dir;
    }

    /**
     * Iterates questionnaire responses, separating them in folders by day for given year and month
     * @returns
     */
    async createDayFolders(year: number, month: number): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();
        const questionnairesResponses = await this.questionnaireModel.responses();

        for (let i = 0; i < questionnairesResponses.length; i++) {
            const creationDay = questionnairesResponses[i].creationTime.getDate();

            if (
                i === questionnairesResponses.length - 1 ||
                (questionnairesResponses[i].creationTime.getFullYear() === year &&
                    questionnairesResponses[i].creationTime.getMonth() === month &&
                    creationDay !== questionnairesResponses[i + 1].creationTime.getDate())
            ) {
                dir.set(String(creationDay).padStart(2, '0'), {
                    type: 'directory',
                    content: this.createDayEntriesFolder.bind(this, year, month, creationDay)
                });
            }
        }

        return dir;
    }

    /**
     * Iterates questionnaire responses creating files with JSON information for given year, month and day
     * @returns
     */
    async createDayEntriesFolder(
        year: number,
        month: number,
        day: number
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();
        const questionnairesResponses = await this.questionnaireModel.responses();

        questionnairesResponses.forEach(questionnairesResponse => {
            if (
                questionnairesResponse.creationTime.getFullYear() === year &&
                questionnairesResponse.creationTime.getMonth() === month &&
                questionnairesResponse.creationTime.getDate() === day
            ) {
                const creationTime = questionnairesResponse.creationTime;
                const addon = questionnairesResponse.channelOwner
                    ? questionnairesResponse.channelOwner
                    : creationTime.getMilliseconds();
                questionnairesResponse.data.response.forEach(response => {
                    const time = `${creationTime.getHours()}-${creationTime.getMinutes()}-${creationTime.getSeconds()}`;

                    dir.set(
                        `${time}_${response.status}${
                            response.questionnaire ? `_${response.questionnaire}` : ''
                        }_${addon}.txt`,
                        {
                            type: 'regularFile',
                            content: JSON.stringify(response)
                        }
                    );
                });
            }
        });

        return dir;
    }
}
