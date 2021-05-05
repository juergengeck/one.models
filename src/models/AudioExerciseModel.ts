import EventEmitter from 'events';
import {Model} from './Model';
import {OEvent} from '../misc/OEvent';
import ChannelManager, {ObjectData} from './ChannelManager';
import {OneUnversionedObjectTypes, Person, SHA256IdHash, AudioExercise} from '@OneCoreTypes';

export default class AudioExerciseModel extends EventEmitter implements Model {
    /**
     * Event is emitted when audio data is updated.
     */
    public onUpdated = new OEvent<(data?: ObjectData<OneUnversionedObjectTypes>) => void>();

    channelManager: ChannelManager;
    channelId: string;
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
        this.channelId = 'audioExercise';
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(this.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleChannelUpdate.bind(this));
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        if (this.disconnect) {
            this.disconnect();
        }
    }

    /**
     * Used to store an audio exercise in one instance.
     * @param audioFileName - the name of the audio file that was played by the user.
     * @param startTimestamp - the time in milliseconds when the user started the audio.
     * @returns {Promise<void>}
     */
    async addAudioExercise(audioFileName: string, startTimestamp: number): Promise<void> {
        /** store the audio exercise object in one **/
        await this.channelManager.postToChannel(
            this.channelId,
            {
                $type$: 'AudioExercise',
                name: audioFileName
            },
            undefined,
            startTimestamp
        );
    }

    /**
     * Get a list of audio exercises.
     */
    public async audioExercises(): Promise<ObjectData<AudioExercise>[]> {
        return await this.channelManager.getObjectsWithType('AudioExercise', {
            channelId: this.channelId
        });
    }

    /**
     *  Handler function for the 'updated' event
     * @param {string} id
     * @param {SHA256IdHash<Person>} owner
     * @param {ObjectData<OneUnversionedObjectTypes>} data
     * @return {Promise<void>}
     */
    private async handleChannelUpdate(
        id: string,
        owner: SHA256IdHash<Person>,
        data?: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
        }
    }
}
