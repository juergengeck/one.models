import EventEmitter from 'events';
import ChannelManager from './ChannelManager';
import {SHA256Hash, BLOB, Slider} from '@OneCoreTypes';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {WriteStorageApi} from 'one.core/lib/storage';
import * as Storage from 'one.core/lib/storage.js';

export type SliderInterfaceUI = ArrayBuffer[];

/**
 * The slider model, used to manipulate slider objects saved in ONE.
 */
export default class SliderModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'slider';
        this.channelManager = channelManager;
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * Used to init the model to receive the updates.
     */
    async init() {
        await this.channelManager.createChannel(this.channelId);
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

    /**
     * This function takes the items from a slider and save them into slider object.
     *
     * @param {SliderInterfaceUI} slider - the images from a slider which have the format used by UI.
     */
    async addSlider(slider: SliderInterfaceUI): Promise<void> {
        const minimalWriteStorageApiObj = {
            createFileWriteStream: createFileWriteStream
        } as WriteStorageApi;

        let slidesBlobId: SHA256Hash<BLOB>[] = [];

        // converting items from array buffer to BLOB by saving them in ONE
        for (const item of slider) {
            const stream = minimalWriteStorageApiObj.createFileWriteStream();
            stream.write(item);
            const blob = await stream.end();

            slidesBlobId.push(blob.hash);
        }

        const sliderObject: Slider = {$type$: 'Slider', items: slidesBlobId};

        await this.channelManager.postToChannel(this.channelId, sliderObject);
        this.emit('sliders');
    }

    /**
     * @returns {Promise<SliderInterfaceUI[]>} last saved slider.
     */
    async sliders(): Promise<SliderInterfaceUI[]> {
        const sliders: SliderInterfaceUI[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType('Slider', {
            channelId: this.channelId
        });

        const lastSlider = oneObjects[oneObjects.length - 1];

        let slider: ArrayBuffer[] = [];

        for (const item of lastSlider.data.items) {
            const stream = Storage.createFileReadStream(item);
            stream.onData.addListener(data => {
                slider.push(data);
            });
            await stream.promise;
        }

        sliders.push(slider);
        return sliders;
    }

    /**
     * Handler function for 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
