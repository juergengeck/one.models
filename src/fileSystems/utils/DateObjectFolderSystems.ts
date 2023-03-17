import type {ObjectData, QueryOptions} from '../../models/ChannelManager';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './EasyFileSystem';

export type AsyncQueryObjectDataIterator<T> = (
    queryOptions?: QueryOptions
) => AsyncIterableIterator<ObjectData<T>>;

/**
 * Uses Iterator for ObjectData to provide ready to use folder structures
 */
export default class DateObjectFolderSystems<T> {
    private iterator: AsyncQueryObjectDataIterator<T>;
    private yearList: CacheList<T>;
    private monthList: CacheList<T>;
    private dayList: CacheList<T>;

    /**
     * @param iterator
     */
    constructor(iterator: AsyncQueryObjectDataIterator<T>) {
        this.iterator = iterator;
        this.yearList = new CacheList<T>(iterator, getYearDataForCache);
        this.monthList = new CacheList<T>(iterator, getMonthDataForCache);
        this.dayList = new CacheList<T>(iterator, getDayDataForCache);
    }

    /**
     * @param timeOfEarliestChange
     */
    public updateCache(_timeOfEarliestChange: Date) {
        this.yearList.updateNeeded();
        this.monthList.updateNeeded();
        this.dayList.updateNeeded();
    }

    /**
     * Creates a structure YYYY/MM/DD/{parseDataFilesContent}
     * @param parseDataFilesContent
     */
    public getYearMonthDayFileType(
        parseDataFilesContent: (
            objecyData: ObjectData<T>,
            adaptiveNamePrefix?: string
        ) => EasyDirectoryContent | Promise<EasyDirectoryContent>
    ): () => Promise<EasyDirectoryContent> {
        const parseDayEntriesFiles = this.createDayEntriesFiles.bind(this, parseDataFilesContent);
        const parseDayFolders = this.createDayFolders.bind(this, parseDayEntriesFiles);
        const parseMonthFolders = this.createMonthFolders.bind(this, parseDayFolders);
        return this.createYearFolders.bind(this, parseMonthFolders);
    }

    /**
     * Separating ObjectData in folders by year
     * @param parseContent
     * @returns
     */
    private async createYearFolders(
        parseContent: (year: number) => Promise<EasyDirectoryContent>
    ): Promise<EasyDirectoryContent> {
        const yearsList = await this.yearList.getList();

        return new Map<string, EasyDirectoryEntry>(
            yearsList.map<[string, EasyDirectoryEntry]>(year => [
                String(year),
                {
                    type: 'directory',
                    content: parseContent.bind(null, year)
                }
            ])
        );
    }

    /**
     * Separating ObjectData in folders by month for given year
     * @param parseContent
     * @param year
     * @returns
     */
    private async createMonthFolders(
        parseContent: (year: number, month: number) => Promise<EasyDirectoryContent>,
        year: number
    ): Promise<EasyDirectoryContent> {
        const monthsList = await this.monthList.getList({
            from: new Date(year, 0),
            to: new Date(year, 11, 31, 23, 59, 59)
        });

        return new Map<string, EasyDirectoryEntry>(
            monthsList.map<[string, EasyDirectoryEntry]>(month => [
                `${String(month + 1).padStart(2, '0')}`,
                {
                    type: 'directory',
                    content: parseContent.bind(null, year, month)
                }
            ])
        );
    }

    /**
     * Separating ObjectData in folders by day for given year and month
     * @param parseContent
     * @param year
     * @param month
     * @returns
     */
    private async createDayFolders(
        parseContent: (year: number, month: number, day: number) => Promise<EasyDirectoryContent>,
        year: number,
        month: number
    ): Promise<EasyDirectoryContent> {
        const daysList = await this.dayList.getList({
            from: new Date(year, month, 1),
            to: new Date(year, month + 1, 0, 23, 59, 59)
        });

        return new Map<string, EasyDirectoryEntry>(
            daysList.map<[string, EasyDirectoryEntry]>(day => [
                `${String(day).padStart(2, '0')}`,
                {
                    type: 'directory',
                    content: parseContent.bind(null, year, month, day)
                }
            ])
        );
    }

    /**
     * Creates files with information given by
     * parseDataFilesContent for given year, month and day
     *
     * @param parseContent
     * @param year
     * @param month
     * @param day
     * @returns
     */
    private async createDayEntriesFiles(
        parseContent: (
            objecyData: ObjectData<T>
        ) => EasyDirectoryContent | Promise<EasyDirectoryContent>,
        year: number,
        month: number,
        day: number
    ): Promise<EasyDirectoryContent> {
        let dir = new Map<string, EasyDirectoryEntry>();
        const queryOptions = {
            from: new Date(year, month, day),
            to: new Date(year, month, day, 23, 59, 59)
        };

        for await (const objectData of this.iterator(queryOptions)) {
            const nextDirMap = await parseContent(objectData);
            dir = new Map<string, EasyDirectoryEntry>([...dir, ...nextDirMap]);
        }

        return dir;
    }
}

function getYearDataForCache<T>(data: ObjectData<T>): number {
    return data.creationTime.getFullYear();
}

function getMonthDataForCache<T>(data: ObjectData<T>): number {
    return data.creationTime.getMonth();
}

function getDayDataForCache<T>(data: ObjectData<T>): number {
    return data.creationTime.getDate();
}

class CacheList<T> {
    private iterator: AsyncQueryObjectDataIterator<T>;
    private cache: Set<number>;
    private update: boolean;
    private getDataForCache: (data: ObjectData<T>) => number | Promise<number>;

    constructor(
        iterator: AsyncQueryObjectDataIterator<T>,
        getDataForCache: (data: ObjectData<T>) => number | Promise<number>
    ) {
        this.getDataForCache = getDataForCache;
        this.iterator = iterator;
        this.cache = new Set();
        this.update = true;
    }

    public updateNeeded() {
        this.update = true;
    }

    /**
     * Iterates ObjectData, getting a list by provided dataExtraction callback
     * @returns
     */
    async getList(queryOptions?: QueryOptions): Promise<number[]> {
        if (!this.update) {
            return [...this.cache];
        }

        for await (const objectData of this.iterator({
            omitData: true,
            ...queryOptions
        })) {
            this.cache.add(await this.getDataForCache(objectData));
        }

        return [...this.cache];
    }
}
