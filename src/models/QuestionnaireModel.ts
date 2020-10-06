import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {
    Person,
    QuestionnaireResponse as OneQuestionnaireResponse,
    SHA256IdHash
} from '@OneCoreTypes';
import {Questionnaire} from './QuestionTypes';

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
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;
    incompleteResponsesChannelId: string;

    /**
     * Construct a new instance
     *
     * @param {ChannelManager} channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'questionnaireResponse';
        this.channelManager = channelManager;
        this.availableQuestionnaires = [];
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
        this.incompleteResponsesChannelId = 'incompleteQuestionnaireResponse';
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        await this.channelManager.createChannel(this.incompleteResponsesChannelId);
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Shutdown module
     *
     * @returns {Promise<void>}
     */
    async shutdown(): Promise<void> {
        this.channelManager.removeListener('updated', this.boundOnUpdatedHandler);
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
     * @param {SHA256IdHash<Person>} owner - change the owner of the channel to post to.
     */
    async postResponse(data: QuestionnaireResponse, owner?: SHA256IdHash<Person>): Promise<void> {
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
        await this.channelManager.postToChannel(this.channelId, convertToOne(data), owner);
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
        const oneObjects = await this.channelManager.getObjectsWithType('QuestionnaireResponse', {
            channelId: this.channelId
        });

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
        const oneObjects = await this.channelManager.getObjectsWithType('QuestionnaireResponse', {
            channelId: this.channelId
        });
        let numberOfSpecificQuestionnaires = 0;

        for (const oneObject of oneObjects) {
            if (oneObject.data.questionnaire.includes(questionnaireResponseId)) {
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

    /**
     * Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId || id === this.incompleteResponsesChannelId) {
            this.emit('updated');
        }
    }

    // ######### Incomplete Response Methods ########

    /**
     * Saving incomplete questionnaires.
     *
     * @param {QuestionnaireResponse} data - The answers for the questionnaire.
     */
    async postIncompleteResponse(data: QuestionnaireResponse): Promise<void> {
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

        // if the questionnaire response is not empty
        if (Object.keys(data.item).length > 0) {
            // Post the result to the one instance
            await this.channelManager.postToChannel(
                this.incompleteResponsesChannelId,
                convertToOne(data)
            );
        }
    }

    /**
     * Getting the incomplete questionnaires.
     * @param {string} questionnaireId - question identifier.
     * @param {Date} since - not older than this date.
     * @returns {Promise<ObjectData<QuestionnaireResponse>[]>}
     */
    async hasIncompleteResponse(
        questionnaireId?: string,
        since?: Date
    ): Promise<ObjectData<QuestionnaireResponse>> {
        let incompleteResponse: ObjectData<QuestionnaireResponse> = {} as ObjectData<
            QuestionnaireResponse
        >;

        const oneObjects = await this.channelManager.getObjectsWithType('QuestionnaireResponse', {
            channelId: this.incompleteResponsesChannelId,
            from: since
        });

        if (questionnaireId) {
            for (let i = oneObjects.length - 1; i >= 0; i--) {
                if (oneObjects[i].data.questionnaire.includes(questionnaireId)) {
                    const {data, ...restObjectData} = oneObjects[i];
                    // Convert the data member from one to model representation
                    incompleteResponse = {...restObjectData, data: convertFromOne(data)};
                    break;
                }
            }
        } else {
            const {data, ...restObjectData} = oneObjects[oneObjects.length - 1];
            incompleteResponse = {...restObjectData, data: convertFromOne(data)};
        }

        return incompleteResponse;
    }

    /**
     * Posting an empty questionnaire.
     * @param {string} questionnaireId - the id of the questionnaire.
     * @returns {Promise<void>}
     */
    async markIncompleteResponseAsComplete(questionnaireId: string): Promise<void> {
        // Assert that the questionnaire with questionnaireId exists
        let questionnaireExists = false;

        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaireId === questionnaire.identifier) {
                questionnaireExists = true;
            }
        }

        if (!questionnaireExists) {
            throw Error(
                'Posting questionnaire response failed: Questionnaire ' +
                    questionnaireId +
                    ' does not exist'
            );
        }

        const emptyQuestionnaire: QuestionnaireResponse = {
            questionnaire: questionnaireId,
            item: {}
        };

        // Post the result to the one instance
        await this.channelManager.postToChannel(
            this.incompleteResponsesChannelId,
            convertToOne(emptyQuestionnaire)
        );
    }
}
