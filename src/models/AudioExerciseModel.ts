import {EventEmitter} from 'events';

import type {Model} from './Model';
import {OEvent} from '../misc/OEvent';
import type ChannelManager from './ChannelManager';
import type {ObjectData} from './ChannelManager';
import type {OneUnversionedObjectTypes, Person} from 'one.core/lib/recipes';
import type {AudioExercise} from '../recipes/AudioExerciseRecipes';
import type {SHA256IdHash} from 'one.core/lib/util/type-checks';
import type {QueryOptions} from './ChannelManager';

export default class AudioExerciseModel extends EventEmitter implements Model {
    /**
     * Event is emitted when audio data is updated.
     */
    public onUpdated = new OEvent<(data: ObjectData<OneUnversionedObjectTypes>) => void>();
    public static readonly channelId = 'audioExercise';

    channelManager: ChannelManager;
    private disconnect: (() => void) | undefined;

    constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
    }

    /**
     * Initialize this instance
     */
    async init(): Promise<void> {
        await this.channelManager.createChannel(AudioExerciseModel.channelId);
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
     */
    async addAudioExercise(audioFileName: string, startTimestamp: number): Promise<void> {
        /** store the audio exercise object in one **/
        await this.channelManager.postToChannel(
            AudioExerciseModel.channelId,
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
            channelId: AudioExerciseModel.channelId
        });
    }

    /**
     * returns iterator for audio exercises
     * @param queryOptions
     */
    async *audioExercisesIterator(
        queryOptions?: QueryOptions
    ): AsyncIterableIterator<ObjectData<AudioExercise>> {
        yield* this.channelManager.objectIteratorWithType('AudioExercise', {
            ...queryOptions,
            channelId: AudioExerciseModel.channelId
        });
    }

    /**
     * Handler-function for the 'updated' event
     * @param id
     * @param owner
     * @param data
     */
    private async handleChannelUpdate(
        id: string,
        owner: SHA256IdHash<Person>,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === AudioExerciseModel.channelId) {
            this.emit('updated');
            this.onUpdated.emit(data);
        }
    }
}
