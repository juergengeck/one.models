import EventEmitter from 'events';
import ChannelManager from './ChannelManager';
import {Slider as OneSlider} from '@OneCoreTypes';

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
        await this.channelManager.postToChannel(this.channelId, convertToOne(slider));
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
