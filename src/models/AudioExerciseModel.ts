import {Model} from './Model';
import type ChannelManager from './ChannelManager';
import type {ObjectData} from './ChannelManager';
import type {OneUnversionedObjectTypes, Person} from '@refinio/one.core/lib/recipes';
import type {AudioExercise} from '../recipes/AudioExerciseRecipes';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import type {QueryOptions} from './ChannelManager';

export default class AudioExerciseModel extends Model {
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
        this.state.assertCurrentState('Uninitialised');

        await this.channelManager.createChannel(AudioExerciseModel.channelId);
        this.disconnect = this.channelManager.onUpdated(this.handleChannelUpdate.bind(this));

        this.state.triggerEvent('init');
    }

    /**
     * Shutdown module
     */
    public async shutdown(): Promise<void> {
        this.state.assertCurrentState('Initialised');
        if (this.disconnect) {
            this.disconnect();
        }
        this.state.triggerEvent('shutdown');
    }

    /**
     * Used to store an audio exercise in one instance.
     * @param audioFileName - the name of the audio file that was played by the user.
     * @param startTimestamp - the time in milliseconds when the user started the audio.
     */
    async addAudioExercise(audioFileName: string, startTimestamp: number): Promise<void> {
        this.state.assertCurrentState('Initialised');

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
        this.state.assertCurrentState('Initialised');

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
        this.state.assertCurrentState('Initialised');

        yield* this.channelManager.objectIteratorWithType('AudioExercise', {
            ...queryOptions,
            channelId: AudioExerciseModel.channelId
        });
    }

    /**
     * Handler-function for the 'updated' event
     * @param id
     * @param data
     */
    private async handleChannelUpdate(
        id: string,
        data: ObjectData<OneUnversionedObjectTypes>
    ): Promise<void> {
        if (id === AudioExerciseModel.channelId) {
            this.onUpdated.emit(data);
        }
    }
}
