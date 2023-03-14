import type {ObjectData, QueryOptions} from '../../models/ChannelManager';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './EasyFileSystem';

export type Iterator<T> = (queryOptions?: QueryOptions) => AsyncIterableIterator<ObjectData<T>>;
export type FilesInformation = ({fileNameAddon: string; fileContent: string} | string)[];
export type ParseDataFilesContent<T> = (data: T) => FilesInformation;

export default class IteratorSystemUtils<T> {
    private iterator: Iterator<T>;

    /**
     * @param iterator
     */
    constructor(iterator: Iterator<T>) {
        this.iterator = iterator;
    }

    /**
     * Creates a structure YYYY/MM/DD/file.txt with parseDataFilesContent
     * @param parseDataFilesContent
     */
    getYearMonthDayFileFolderSystem(
        parseDataFilesContent: (
            objectData: ObjectData<T>
        ) => FilesInformation | Promise<FilesInformation>
    ): () => Promise<EasyDirectoryContent> {
        const parseDayEntriesFiles = this.createDayEntriesFiles.bind(this, parseDataFilesContent);
        const parseDayFolders = this.createDayFolders.bind(null, parseDayEntriesFiles);
        const parseMonthFolders = this.createMonthFolders.bind(null, parseDayFolders);
        return this.createYearFolders.bind(null, parseMonthFolders);
    }

    /**
     * Iterates ObjectData, getting years of creation
     * @returns
     */
    async getYearList(): Promise<number[]> {
        const years = [];

        let lastYearFolder = 0;

        for await (const objectData of this.iterator({omitData: true})) {
            if (objectData.creationTime.getFullYear() !== lastYearFolder) {
                years.push(objectData.creationTime.getFullYear());
                lastYearFolder = objectData.creationTime.getFullYear();
            }
        }

        return years;
    }

    /**
     * Separating ObjectData in folders by year
     * @returns
     */
    async createYearFolders(
        parseContent: (year: number) => Promise<EasyDirectoryContent>
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const getYearList = await this.getYearList();

        for (const year of getYearList) {
            dir.set(String(year), {
                type: 'directory',
                content: parseContent.bind(null, year)
            });
        }

        return dir;
    }

    /**
     * Iterates ObjectData, getting months of creation for given year
     * @returns
     */
    async getMonthList(year: number): Promise<number[]> {
        const months = [];
        let lastMonth = -1;

        const queryOptions = {
            omitData: true,
            from: new Date(year, 0),
            to: new Date(year, 11, 31, 23, 59, 59)
        };

        for await (const objectData of this.iterator(queryOptions)) {
            if (objectData.creationTime.getMonth() !== lastMonth) {
                months.push(objectData.creationTime.getMonth());
                lastMonth = objectData.creationTime.getMonth();
            }
        }

        return months;
    }

    /**
     * Separating ObjectData in folders by month for given year
     * @returns
     */
    async createMonthFolders(
        parseContent: (year: number, month: number) => Promise<EasyDirectoryContent>,
        year: number
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();
        const monthList = await this.getMonthList(year);

        for (const month of monthList) {
            dir.set(String(month + 1), {
                type: 'directory',
                content: parseContent.bind(null, year, month)
            });
        }

        return dir;
    }

    /**
     * Iterates ObjectData, getting days of creation for given year and month
     * @returns
     */
    async getDayList(year: number, month: number): Promise<number[]> {
        const days = [];
        let lastDay = -1;

        const queryOptions = {
            omitData: true,
            from: new Date(year, month, 1),
            to: new Date(year, month + 1, 0, 23, 59, 59)
        };

        for await (const objectData of this.iterator(queryOptions)) {
            if (objectData.creationTime.getDate() !== lastDay) {
                days.push(objectData.creationTime.getDate());
                lastDay = objectData.creationTime.getDate();
            }
        }

        return days;
    }

    /**
     * Separating ObjectData in folders by day for given year and month
     * @returns
     */
    async createDayFolders(
        parseContent: (year: number, month: number, day: number) => Promise<EasyDirectoryContent>,
        year: number,
        month: number
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();
        const daysList = await this.getDayList(year, month);

        for (const day of daysList) {
            dir.set(String(day), {
                type: 'directory',
                content: parseContent.bind(null, year, month, day)
            });
        }

        return dir;
    }

    /**
     * Creates files with information given by
     * parseDataFilesContent or defaultParseDataFilesContent
     * for given year, month and day
     *
     * @returns
     */
    async createDayEntriesFiles(
        parseContent: (objecyData: ObjectData<T>) => FilesInformation | Promise<FilesInformation>,
        year: number,
        month: number,
        day: number
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const queryOptions = {
            from: new Date(year, month, day),
            to: new Date(year, month, day, 23, 59, 59)
        };

        for await (const objectData of this.iterator(queryOptions)) {
            const creationTime = objectData.creationTime;
            const channelOwnerAddon = objectData.channelOwner ? `_${objectData.channelOwner}` : '';
            const time = `${creationTime.getHours()}-${creationTime.getMinutes()}-${creationTime.getSeconds()}-${creationTime.getMilliseconds()}`;

            const files = await parseContent(objectData);

            files.forEach(file => {
                const fileNameAddon = typeof file === 'string' ? '' : `_${file.fileNameAddon}`;
                const fileContent = typeof file === 'string' ? file : file.fileContent;

                dir.set(`${time}${fileNameAddon}${channelOwnerAddon}.txt`, {
                    type: 'regularFile',
                    content: fileContent
                });
            });
        }

        return dir;
    }
}
