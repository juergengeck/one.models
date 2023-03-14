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
            journalModel.objectDataIterator.bind(journalModel),
            // LeuteModel retrieveStatusesForJournal generates the same (zeroed)
            // dummy channelEntryHash for each entry, so we can not use this type of cache it here
            {withChannelEntryHashCache: false}
        );

        this.setRootDirectory(
            dateObjectFolderSystems.getYearMonthDayFileType(this.parseDataFilesContent.bind(this))
        );
    }

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
