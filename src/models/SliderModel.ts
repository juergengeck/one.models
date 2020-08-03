import EventEmitter from 'events';
import ChannelManager from './ChannelManager';
import {SHA256Hash, BLOB} from '@OneCoreTypes';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {WriteStorageApi} from 'one.core/lib/storage';
import * as Storage from 'one.core/lib/storage.js';

export type SliderInterfaceUI = ArrayBuffer[];

export default class SliderModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'slider';
        this.channelManager = channelManager;
    }

    async init() {
        await this.channelManager.createChannel(this.channelId);
        this.channelManager.on('updated', id => {
            if (id === this.channelId) {
                this.emit('updated');
            }
        });
    }

    async addSlider(slider: SliderInterfaceUI): Promise<void> {
        const minimalWriteStorageApiObj = {
            createFileWriteStream: createFileWriteStream
        } as WriteStorageApi;

        let slidesBlobId: SHA256Hash<BLOB>[] = [];

        for (const item of slider) {
            const stream = minimalWriteStorageApiObj.createFileWriteStream();
            stream.write(item);
            const blob = await stream.end();

            slidesBlobId.push(blob.hash);
        }

        await this.channelManager.postToChannel(this.channelId, {
            $type$: 'Slider',
            items: slidesBlobId
        });
        this.emit('sliders');
    }

    async sliders(): Promise<SliderInterfaceUI[]> {
        const sliders: SliderInterfaceUI[] = [];

        const oneObjects = await this.channelManager.getObjectsWithType(this.channelId, 'Slider');

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
}
