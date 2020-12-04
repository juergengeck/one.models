import EventEmitter from 'events';
import ChannelManager, {ObjectData} from './ChannelManager';
import {
    Person,
    Questionnaire,
    QuestionnaireResponse,
    QuestionnaireResponses,
    SHA256IdHash
} from '@OneCoreTypes';

/**
 * Type defines the data of a questionnaire response
 */
/*export interface QuestionnaireResponse {
    questionnaire: string;
    item: Record<string, string>;
}*/

/**
 * This model represents everything related to Questionnaires.
 *
 * At the moment this model is just managing questionnaire responses.
 * In the future this will most probably also manage questionnaires.
 */
export default class QuestionnaireModel extends EventEmitter {
    private channelManager: ChannelManager;
    private readonly channelId: string;
    private readonly availableQuestionnaires: Questionnaire[];
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;
    private readonly incompleteResponsesChannelId: string;

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
    async questionnaires(): Promise<Questionnaire[]> {
        return this.availableQuestionnaires;
    }

    /**
     * Get a specific questionnaire
     *
     * Note that this does not connect to the server behind the url. The url is
     * simply the id used by questionnaires. FHIR uses urls for identifying resources
     * such as questionnaires.
     *
     * @param {string} url - The url of the questionnaire
     */
    async getQuestionnaireByUrl(url: string): Promise<Questionnaire> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaire.url === url) {
                return questionnaire;
            }
        }
        throw Error('Questionnaire with url ' + url + ' does not exist');
    }

    /**
     * Get a specific questionnaire
     *
     * @param {string} name - The name of the questionnaire
     */
    async getQuestionnaireByName(name: string): Promise<Questionnaire> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaire.name === name) {
                return questionnaire;
            }
        }
        throw Error('Questionnaire with name ' + name + ' does not exist');
    }

    /**
     * Checks whether an url exists.
     *
     * @param url - Url of the questionnaire
     */
    async hasQuestionnaireWithUrl(url: string): Promise<boolean> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaire.url === url) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks whether an url exists.
     *
     * @param name - Name of the questionnaire
     */
    async hasQuestionnaireWithName(name: string): Promise<boolean> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaire.name === name) {
                return true;
            }
        }
        return false;
    }

    // #### Questionnaire response functions ####

    /**
     * Create a new response to a questionnaire
     *
     * @param response - The questionnaire response to post
     * @param name - The name for this collection. This could be something the user specifies in order to be identified easily.
     * @param type - An application specific type. It is up to the application what to do with it.
     * @param owner - Change the owner of the channel to post to. Defaults to the default channel person that is set in the channel manager.
     */
    async postResponse(
        response: QuestionnaireResponse,
        name?: string,
        type?: string,
        owner?: SHA256IdHash<Person>
    ): Promise<void> {
        // Assert that the questionnaire with questionnaireId exists
        let questionnaireExists = false;

        for (const questionnaire of this.availableQuestionnaires) {
            if (response.questionnaire === questionnaire.url) {
                questionnaireExists = true;
            }
        }

        if (!questionnaireExists) {
            throw Error(
                'Posting questionnaire response failed: Questionnaire ' +
                    response.questionnaire +
                    ' does not exist'
            );
        }

        // Todo: Assert that the mandatory fields have been set in the answer

        // Post the result to the one instance
        await this.channelManager.postToChannel(
            this.channelId,
            {
                $type$: 'QuestionnaireResponses',
                responses: [response]
            },
            owner
        );
        await postResponseCollection.postResponseCollection([response]);
    }

    /**
     * Post multiple responses as a single collection.
     *
     * This means that later when querying the questionnaires, this collection will appear as simple entry.
     * This is useful if you dynamically compose a big questionnaires from several partial questionnaires.
     *
     * @param responses - The list of questionnaire responses to post
     * @param name - The name for this collection. This could be something the user specifies in order to be identified easily.
     * @param type - An application specific type. It is up to the application what to do with it.
     * @param owner - Change the owner of the channel to post to. Defaults to the default channel person that is set in the channel manager.
     */
    async postResponseCollection(
        responses: QuestionnaireResponse[],
        name?: string,
        type?: string,
        owner?: SHA256IdHash<Person>,
    ): Promise<void> {
        // Todo: Assert that the mandatory fields have been set in the answer

        // Post the result to the one instance
        await this.channelManager.postToChannel(
            this.channelId,
            {
                $type$: 'QuestionnaireResponses',
                responses: responses
            },
            owner
        );
    }

    /**
     * Get a specific questionnaire response
     *
     * @param {string} questionnaireResponseId - the id of the questionnaire response
     */
    async getQuestionnaireResponseById(
        questionnaireResponseId: string
    ): Promise<ObjectData<QuestionnaireResponses>> {
        return await this.channelManager.getObjectWithTypeById(
            questionnaireResponseId,
            'QuestionnaireResponses'
        );
    }

    /**
     * Get a list of responses.
     */
    async responses(): Promise<ObjectData<QuestionnaireResponses>[]> {
        return await this.channelManager.getObjectsWithType('QuestionnaireResponses', {
            channelId: this.channelId
        });
    }

    /**
     *  Getting the number of completed questionnaire by questionnaire type.
     * @param {string} questionnaireResponseId - questionnaire response identifier
     * TODO: Why do we need this?
     */
    async getNumberOfQuestionnaireResponses(questionnaireResponseId: string): Promise<number> {
        return 1;
        /*const oneObjects = await this.channelManager.getObjectsWithType('QuestionnaireResponses', {
            channelId: this.channelId
        });
        let numberOfSpecificQuestionnaires = 0;

        for (const oneObject of oneObjects) {
            if (oneObject.data.questionnaire.includes(questionnaireResponseId)) {
                numberOfSpecificQuestionnaires++;
            }
        }

        return numberOfSpecificQuestionnaires;*/
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
     * ## Note: if an empty questionnaire response it's passed as the argument,
     * then the function will work as markIncompleteResponseAsComplete(questionnaireId: string) function.
     *
     * @param {QuestionnaireResponse} data - The answers for the questionnaire.
     */
    async postIncompleteResponse(data: QuestionnaireResponse): Promise<void> {
        // Assert that the questionnaire with questionnaireId exists
        let questionnaireExists = false;

        for (const questionnaire of this.availableQuestionnaires) {
            if (data.questionnaire === questionnaire.url) {
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

        // Post the result to the one instance
        await this.channelManager.postToChannel(this.incompleteResponsesChannelId, {
            $type$: 'QuestionnaireResponses',
            responses: [data]
        });
    }

    /**
     * Getting the latest incomplete questionnaire.
     * @param {Date} since - not older than this date.
     * @param {string} questionnaireId - questionnaire identifier.
     * @returns {Promise<ObjectData<QuestionnaireResponse>[]>}
     * TODO: we need to id it probably by type, not by questionnaire id anymore
     */
    async incompleteResponse(
        questionnaireId?: string,
        since?: Date
    ): Promise<ObjectData<QuestionnaireResponse> | null> {
        /**
        let incompleteResponse: ObjectData<QuestionnaireResponse> | null = null;

        for await (const item of this.channelManager.objectIteratorWithType(
            'QuestionnaireResponses',
            {
                channelId: this.incompleteResponsesChannelId,
                from: since
            }
        )) {
            if (questionnaireId && item.data.url !== questionnaireId) {
                continue;
            }

            const {data, ...restObjectData} = item;
            // Convert the data member from one to model representation
            incompleteResponse = {
                ...restObjectData,
                data: convertFromOne(data)
            };
            break;
        }

        return incompleteResponse;**/
        return null;
    }

    /**
     * Check if incomplete questionnaires exists.
     * @param {Date} since - not older than this date.
     * @param {string} questionnaireId - questionnaire identifier.
     * @returns {Promise<boolean>}
     */
    async hasIncompleteResponse(questionnaireId?: string, since?: Date): Promise<boolean> {
        /**
        for await (const item of this.channelManager.objectIteratorWithType(
            'QuestionnaireResponse',
            {
                channelId: this.incompleteResponsesChannelId,
                from: since
            }
        )) {
            if (questionnaireId && item.data.questionnaire !== questionnaireId) {
                continue;
            }

            // if the questionnaire it's empty then no incomplete questionnaire exists
            return item.data.item.length > 0;
        }
        */
        return false;
    }

    /**
     * Posting an empty questionnaire.
     *
     * ## Note: this function is used to mark when a complete questionnaire was posted,
     * so every time when a complete questionnaire it's added to the "questionnaireResponse" channel,
     * an empty questionnaire response it's added to the "incompleteQuestionnaireResponse" channel.
     *
     * @param {string} questionnaireId - the id of the questionnaire.
     * @returns {Promise<void>}
     */
    async markIncompleteResponseAsComplete(questionnaireId: string): Promise<void> {
        /*
        // Assert that the questionnaire with questionnaireId exists
        let questionnaireExists = false;

        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaireId === questionnaire.url) {
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
        */
    }
}
