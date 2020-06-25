import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {QuestionnaireResponse as OneQuestionnaireResponse} from '@OneCoreTypes';

export enum QuestionType {
    Display = 0,
    Group = 1,
    Choice = 2,
    String = 3,
    Boolean = 4,
    Date = 5,
    Integer = 6,
    OpenChoice = 7,
    OpenChoiceGroup = 8
}

export type Questionnaire = {
    identifier: string;
    item: Question[];
};

export type Question = {
    questionIdentifier: string;
    enableWhen?: EnableWhen[];
    required?: boolean;
    question: string;
    questionType: QuestionType;
    answerValue?: string[];
    maxLength?: number;
    minLength?: number;
    regEx?: string;
    item?: Question[];
};

export type EnableWhen = {
    question: string;
    operator: string;
    answer: string;
};

/**
 * Type defines the data of a questionnaire response
 */
export interface QuestionnaireResponse {
    questionnaire: string;
    item: Record<string, string>;
}

/**
 * Convert from model representation to one representation.
 *
 * @param {QuestionnaireResponse} modelObject - the model object
 * @returns {OneQuestionnaireResponse} The corresponding one object
 */
function convertToOne(modelObject: QuestionnaireResponse): OneQuestionnaireResponse {
    const {item, ...rest} = modelObject;
    const oneItems = [];

    // Transform the items from object to array
    for (const itemId in item) {
        oneItems.push({
            linkId: itemId,
            answer: item[itemId]
        });
    }

    // Create the resulting object
    return {
        $type$: 'QuestionnaireResponse',
        ...rest,
        item: oneItems
    };
}

/**
 * Convert from one representation to model representation.
 *
 * @param {OneQuestionnaireResponse} oneObject - the one object
 * @returns {QuestionnaireResponse} The corresponding model object
 */
function convertFromOne(oneObject: OneQuestionnaireResponse): QuestionnaireResponse {
    const {item, ...restOneQuestionnaireResponse} = oneObject;

    // transform the items from array to object
    const newItems: Record<string, string> = {};

    for (const i of item) {
        newItems[i.linkId] = i.answer;
    }

    // Create the new ObjectData item
    return {
        ...restOneQuestionnaireResponse, // This is "questionnaire" and others that
        // might be later added to Questionnaire
        // Response
        item: newItems
    };
}

/**
 * This model represents everything related to Questionnaires.
 *
 * At the moment this model is just managing questionnaire responses.
 * In the future this will most probably also manage questionnaires.
 */
export default class QuestionnaireModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;
    availableQuestionnaires: Questionnaire[];

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'questionnaire';
        this.channelManager = channelManager;
        this.availableQuestionnaires = [];
    }

    /**
     * Initialize this inistance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', (id) => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

    // #### Questionnaire functions ####

    /**
     * Get a list of available questionnaires
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async questionnaires(): Promise<Questionnaire[]> {
        return this.availableQuestionnaires;
    }

    /**
     * Get a specific questionnaire
     *
     * @param {string} questionnaireId - the identifier of the questionnaire
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async getQuestionnaireById(questionnaireId: string): Promise<Questionnaire> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaireId === questionnaire.identifier) {
                return questionnaire;
            }
        }

        throw Error('Questionnaire with id ' + questionnaireId + ' does not exist');
    }

    // #### Questionnaire response functions ####

    /**
     * Create a new response for the Covid2 Patient questionnaire
     *
     * @param {QuestionnaireResponse} data - The answers for the questionnaire.
     */
    async postResponse(data: QuestionnaireResponse): Promise<void> {
        // Assert that the questionnaire with questionnaireId exists
        let questionnaireExists = false;

        for (const questionnaire of this.availableQuestionnaires) {
            if (data.questionnaire === questionnaire.identifier) {
                questionnaireExists = true;
            }
        }

        if (!questionnaireExists) {
            throw Error(
                'Posting questionnaire response failed: Questionnaire ' +
                    data.questionnaire +
                    ' does not exist'
            );
        }

        // Todo: Assert that the mandatory fields have been set in the answer

        // Post the result to the one instance
        await this.channelManager.postToChannel(this.channelId, convertToOne(data));
    }

    /**
     * Get a specific questionnaire response
     *
     * @param {string} questionnaireResponseId - the id of the questionnaire response
     */
    async getQuestionnaireResponseById(
        questionnaireResponseId: string
    ): Promise<ObjectData<QuestionnaireResponse>> {
        const {data, ...restObjectData} = await this.channelManager.getObjectWithTypeById(
            this.channelId,
            questionnaireResponseId,
            'QuestionnaireResponse'
        );
        return {...restObjectData, data: convertFromOne(data)};
    }

    /**
     * Get a list of responses.
     */
    async responses(): Promise<ObjectData<QuestionnaireResponse>[]> {
        const objects: ObjectData<QuestionnaireResponse>[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'QuestionnaireResponse'
        );

        // Convert the data member from one to model representation
        for (const oneObject of oneObjects) {
            const {data, ...restObjectData} = oneObject;
            objects.push({...restObjectData, data: convertFromOne(data)});
        }

        return objects;
    }

    /**
     *  Getting the number of completed questionnaire by questionnaire type.
     * @param {string} questionnaireResponseId - questionnaire response identifier
     */
    async getNumberOfQuestionnaireResponses(questionnaireResponseId: string): Promise<number> {
        const oneObjects = await this.channelManager.getObjectsWithType(
            this.channelId,
            'QuestionnaireResponse'
        );
        let numberOfSpecificQuestionnaires = 0;

        for (const oneObject of oneObjects) {
            if (oneObject.data.questionnaire === questionnaireResponseId) {
                numberOfSpecificQuestionnaires++;
            }
        }

        return numberOfSpecificQuestionnaires;
    }

    /**
     * Adding questionnaires to the available questionnaires list.
     * @param questionnaires - Questionnaire[] - the list of the questionnaires that will be added to the available questionnaires list
     */
    registerQuestionnaires(questionnaires: Questionnaire[]): void {
        this.availableQuestionnaires.push(...questionnaires);
    }
}
