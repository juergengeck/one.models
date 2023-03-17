import type JournalModel from '../models/JournalModel';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './utils/EasyFileSystem';
import EasyFileSystem from './utils/EasyFileSystem';
import DateObjectFolderSystems from './utils/DateObjectFolderSystems';
import type {ObjectData} from '../models/ChannelManager';

type ObjectDataType = unknown;

/**
 * Provides information about journal registered events
 */
export default class JournalFileSystem extends EasyFileSystem {
    /**
     * Constructor
     * @param journalModel
     */
    constructor(journalModel: JournalModel) {
        super(true);
        const dateObjectFolderSystems = new DateObjectFolderSystems<ObjectDataType>(
            journalModel.objectDataIterator.bind(journalModel)
        );

        this.setRootDirectory(
            dateObjectFolderSystems.getYearMonthDayFileType(this.parseDataFilesContent.bind(this))
        );

        journalModel.onUpdated(dateObjectFolderSystems.updateCache.bind(dateObjectFolderSystems));
    }

    /**
     * @param objectData
     * @returns
     */
    private parseDataFilesContent(objectData: ObjectData<ObjectDataType>): EasyDirectoryContent {
        const creationTime = objectData.creationTime;
        const channelOwnerAddon = objectData.channelOwner ? `_${objectData.channelOwner}` : '';
        const time = `${creationTime.getHours()}-${creationTime.getMinutes()}-${creationTime.getSeconds()}-${creationTime.getMilliseconds()}`;

        return new Map<string, EasyDirectoryEntry>([
            [
                `${time}${channelOwnerAddon}_${creationTime.getMilliseconds()}`,
                {
                    type: 'regularFile',
                    content: JSON.stringify(objectData)
                }
            ]
        ]);
    }
}
