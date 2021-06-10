import EventEmitter from 'events';
import ChannelManager, {ObjectData, QueryOptions} from './ChannelManager';
import {
    OneUnversionedObjectTypes,
    Person,
    Questionnaire_1_1_0,
    QuestionnaireResponses as OneQuestionnaireResponses,
    SHA256IdHash
} from '@OneCoreTypes';
import {OEvent} from '../misc/OEvent';
import {Model} from './Model';

// Export the Questionnaire types
export interface Questionnaire extends Omit<Questionnaire_1_1_0, '$type$'> {}
export type Question = Questionnaire_1_1_0.Question;
export type QuestionnaireAnswerMinMaxValue = Questionnaire_1_1_0.QuestionnaireAnswerMinMaxValue;
export type AnswerRestriction = Questionnaire_1_1_0.AnswerRestriction;
export type Coding = Questionnaire_1_1_0.Coding;
export type QuestionnaireEnableWhenAnswer = Questionnaire_1_1_0.QuestionnaireEnableWhenAnswer;
export type QuestionnaireAnswerOptionValue = Questionnaire_1_1_0.QuestionnaireEnableWhenAnswer;
export type QuestionnaireValue = Questionnaire_1_1_0.QuestionnaireValue;

// Export the QuestionnaireResponses types
// @TODO the Omit thingy doesn't work as expected... the $type$ property it's still accessible from the outside
export interface QuestionnaireResponses extends Omit<OneQuestionnaireResponses, '$type$'> {}
export type QuestionnaireResponse = OneQuestionnaireResponses.QuestionnaireResponse;
export type QuestionnaireResponseItem = OneQuestionnaireResponses.QuestionnaireResponseItem;

/**
 * This model represents everything related to Questionnaires.
 *
 * At the moment this model is just managing questionnaire responses.
 * In the future this will most probably also manage questionnaires.
 */
export default class QuestionnaireModel extends EventEmitter implements Model {
    /**
     * Event is emitted when the incomplete questionnaire response data is updated.
     */
    public onIncompleteResponse = new OEvent<() => void>();

    /**
     * Event is emitted when the questionnaire response data is updated.
     */
    public onUpdated = new OEvent<(data?: ObjectData<OneUnversionedObjectTypes>) => void>();

    private channelManager: ChannelManager;
    private readonly channelId: string;
    private readonly availableQuestionnaires: Questionnaire[];
    private readonly incompleteResponsesChannelId: string;
    private disconnect: (() => void) | undefined;

    /**
     * Construct a new instance
     *
     * @param channelManager - The channel manager instance
     */
    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'questionnaireResponse';
        this.channelManager = channelManager;
        this.availableQuestionnaires = [];
        this.incompleteResponsesChannelId = 'incompleteQuestionnaireResponse';
    }

    /**
     * Initialize this instance
     *
     * This must be done after the one instance was initialized.
     */
    public async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        await this.channelManager.createChannel(this.incompleteResponsesChannelId);
        this.disconnect = this.channelManager.onUpdated(this.handleOnUpdated.bind(this));
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    // #### Questionnaire functions ####

    /**
     * Get a list of available questionnaires
     */
    public async questionnaires(): Promise<Questionnaire[]> {
        return this.availableQuestionnaires;
    }

    /**
     * Get a specific questionnaire
     *
     * Note that this does not connect to the server behind the url. The url is
     * simply the id used by questionnaires. FHIR uses urls for identifying resources
     * such as questionnaires.
     *
     * @param url - The url of the questionnaire
     */
    public async questionnaireByUrl(url: string): Promise<Questionnaire> {
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
     * @param name - The name of the questionnaire
     * @param language - Language of questionnaire. If empty, just return the first in any language.
     */
    public async questionnaireByName(name: string, language?: string): Promise<Questionnaire> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaire.name === name && (!language || questionnaire.language === language)) {
                return questionnaire;
            }
        }
        throw Error(
            'Questionnaire with name ' + name + ' and language ' + language + ' does not exist'
        );
    }

    /**
     * Get a questionnaire url by name and language.
     *
     * @param name
     * @param language
     */
    public async questionnaireUrlByName(name: string, language?: string): Promise<string> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (
                questionnaire.name === name &&
                (!language || questionnaire.language === language) &&
                questionnaire.url
            ) {
                return questionnaire.url;
            }
        }
        throw Error(
            'Questionnaire with name ' + name + ' and language ' + language + ' does not exist'
        );
    }

    /**
     * Checks whether a questionnaire exists.
     *
     * @param url - Url of the questionnaire
     */
    public async hasQuestionnaireWithUrl(url: string): Promise<boolean> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaire.url === url) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks whether a questionnaire exists.
     *
     * @param name - Name of the questionnaire
     * @param language - Language of questionnaire. If empty, just check in any language.
     */
    public async hasQuestionnaireWithName(name: string, language?: string): Promise<boolean> {
        for (const questionnaire of this.availableQuestionnaires) {
            if (questionnaire.name === name && (!language || questionnaire.language === language)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Adding questionnaires to the available questionnaires list.
     *
     * Note: In the future questionnaires will be served by one as one objects.
     *       This function will then change or be removed.
     *
     * @param questionnaires - The list of the questionnaires that will be added
     */
    public registerQuestionnaires(questionnaires: Questionnaire[]): void {
        this.availableQuestionnaires.push(...questionnaires);
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
    public async postResponse(
        response: QuestionnaireResponse,
        name?: string,
        type?: string,
        owner?: SHA256IdHash<Person>
    ): Promise<void> {
        await this.postResponseCollection([response], name, type, owner);
    }

    /**
     * Post multiple responses as a single collection.
     *
     * This means that later when querying the questionnaires, this collection will appear as single entry.
     * This is useful if you dynamically compose a big questionnaires from several partial questionnaires.
     *
     * @param responses - The list of questionnaire responses to post
     * @param name - The name for this collection. This could be something the user specifies in order to be identified easily.
     * @param type - An application specific type. It is up to the application what to do with it.
     * @param owner - Change the owner of the channel to post to. Defaults to the default channel person that is set in the channel manager.
     */
    public async postResponseCollection(
        responses: QuestionnaireResponse[],
        name?: string,
        type?: string,
        owner?: SHA256IdHash<Person>
    ): Promise<void> {
        // We decided not to do any validation here, because it is done by the questionnaire builder.
        // If you post something wrong, then shame on you :-)

        // Post the result to the one instance
        await this.channelManager.postToChannel(
            this.channelId,
            {
                $type$: 'QuestionnaireResponses',
                name,
                type,
                response: responses
            },
            owner
        );
    }

    /**
     * Get a list of responses.
     */
    public async responses(): Promise<ObjectData<QuestionnaireResponses>[]> {
        return await this.channelManager.getObjectsWithType('QuestionnaireResponses', {
            channelId: this.channelId
        });
    }

    /**
     * returns iterator for QuestionnaireResponses
     * @param queryOptions
     */
    async *responsesIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<OneQuestionnaireResponses>> {
        yield* this.channelManager.objectIteratorWithType('QuestionnaireResponses', {
            ...queryOptions,
            channelId: this.channelId
        });
    }

    /**
     * Get a specific questionnaire response
     *
     * @param id - the id of the questionnaire response. It is the id field of the ObjectData.
     */
    public async responsesById(id: string): Promise<ObjectData<QuestionnaireResponses>> {
        return await this.channelManager.getObjectWithTypeById(id, 'QuestionnaireResponses');
    }

    /**
     * Getting the number of completed questionnaire by questionnaire type.
     *
     * @param {string} questionnaireResponseId - questionnaire response identifier
     * TODO: Why do we need this? I disabled it, because it assumes a language suffix - we should rethink this!
     */
    /*async getNumberOfQuestionnaireResponses(questionnaireResponseId: string): Promise<number> {
        const oneObjects = await this.channelManager.getObjectsWithType('QuestionnaireResponses', {
            channelId: this.channelId
        });
        let numberOfSpecificQuestionnaires = 0;

        for (const oneObject of oneObjects) {
            if (oneObject.data.questionnaire.includes(questionnaireResponseId)) {
                numberOfSpecificQuestionnaires++;
            }
        }

        return numberOfSpecificQuestionnaires;
    }*/

    // ######### Incomplete Response Methods ########

    /**
     * Saving incomplete questionnaires.
     *
     * @param response - The incomplete response.
     * @param type - The type of the response. This is later used to find incomplete responses.
     * @param name - The name of the response
     */
    public async postIncompleteResponse(
        response: QuestionnaireResponse,
        type: string,
        name?: string
    ): Promise<void> {
        await this.postIncompleteResponseCollection([response], type, name);
    }

    /**
     * Save incomplete questionnaire collection.
     *
     * @param responses - The response list. If this list is empty then it works exactly as markIncompleteResponseAsComplete.
     * @param type - The type of the response. This is later used to find incomplete responses.
     * @param name - The name of the response
     */
    public async postIncompleteResponseCollection(
        responses: QuestionnaireResponse[],
        type: string,
        name?: string
    ): Promise<void> {
        // Post the result to the one instance
        await this.channelManager.postToChannel(this.incompleteResponsesChannelId, {
            $type$: 'QuestionnaireResponses',
            name,
            type,
            response: responses
        });
    }

    /**
     * Getting the latest incomplete questionnaire.
     *
     * @param type - type of incomplete response collection
     * @param since - not older than this date.
     * @returns the incomplete data, or null if there isn't such data.
     */
    public async incompleteResponse(
        type: string,
        since?: Date
    ): Promise<ObjectData<QuestionnaireResponses> | null> {
        // Construct iterator
        const iterator = this.channelManager.objectIteratorWithType('QuestionnaireResponses', {
            channelId: this.incompleteResponsesChannelId,
            from: since
        });

        // Iterate over all entries and see if a type is present
        for await (const responses of iterator) {
            if (responses.data.type !== type) {
                continue;
            }

            // Check if an empty element is found => no incomplete entry
            if (responses.data.response.length === 0) {
                return null;
            }

            return responses;
        }
        return null;
    }

    /**
     * Check if incomplete questionnaires exists.
     *
     * @param type - The type of the incomplete response collection.
     * @param since - Not older than this date.
     * @returns
     */
    public async hasIncompleteResponse(type: string, since?: Date): Promise<boolean> {
        return (await this.incompleteResponse(type, since)) !== null;
    }

    /**
     * Marks an incomplete response as complete.
     *
     * Note: This simply posts an empty responses object to the incomplete channel.
     *
     * @param type - The type of the incomplete response collection.
     * @returns
     */
    public async markIncompleteResponseAsComplete(type: string): Promise<void> {
        await this.channelManager.postToChannel(this.incompleteResponsesChannelId, {
            $type$: 'QuestionnaireResponses',
            type: type,
            response: []
        });
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @param {SHA256IdHash<Person>} owner
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleOnUpdated(
        id: string,
        owner: SHA256IdHash<Person>,
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === this.channelId || id === this.incompleteResponsesChannelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
            if (id === this.incompleteResponsesChannelId) {
                this.emit('updatedIncomplete');
                this.onIncompleteResponse.emit();
            }
        }
    }
}
