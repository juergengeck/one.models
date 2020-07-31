import EventEmitter from 'events';
import ChannelManager from './ChannelManager';
import {Slider as OneSlider, SHA256Hash, BLOB} from '@OneCoreTypes';
import {createFileWriteStream} from 'one.core/lib/system/storage-streams';
import {WriteStorageApi} from 'one.core/lib/storage';

export type Slider = ArrayBuffer[];

function convertToOne(slider: Slider): OneSlider {
    return {
        $type$: 'Slider',
        items: slider
    };
}

function convertSliderFromOne(slider: OneSlider): Slider {
    return slider.items;
}

export default class SliderModel extends EventEmitter {
    channelManager: ChannelManager;
    channelId: string;

    constructor(channelManager: ChannelManager) {
        super();

        this.channelId = 'Slider';
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

    async addSlider(slider: Slider): Promise<void> {
        const minimalWriteStorageApiObj = {
            createFileWriteStream: createFileWriteStream
        } as WriteStorageApi;

        let ids: SHA256Hash<BLOB>[] = [];

        for (const item of slider) {
            const stream = minimalWriteStorageApiObj.createFileWriteStream();
            stream.write(item);
            const blob = await stream.end();

            ids.push(blob.hash);
        }

        await this.channelManager.postToChannel(this.channelId, {$type$: 'Slider', items: ids});
    }

    async sliders(): Promise<Slider[]> {
        const sliders: Slider[] = [];
        const oneObjects = await this.channelManager.getObjectsWithType(this.channelId, 'Slider');

        for (const slider of oneObjects) {
            sliders.push(convertSliderFromOne(slider.data));
        }

        return sliders;
    }
}
