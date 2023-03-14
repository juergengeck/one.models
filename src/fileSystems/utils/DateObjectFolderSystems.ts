import type {SHA256Hash} from '@refinio/one.core/lib/util/type-checks';

import type {ObjectData, QueryOptions} from '../../models/ChannelManager';
import type {ChannelEntry} from '../../recipes/ChannelRecipes';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './EasyFileSystem';

export type AsyncQueryObjectDataIterator<T> = (
    queryOptions?: QueryOptions
) => AsyncIterableIterator<ObjectData<T>>;
export type FilesInformation = ({fileNameAddon: string; fileContent: string} | string)[];
export type ParseDataFilesContent<T> = (data: T) => FilesInformation;

/**
 * Uses Iterator for ObjectData to provide ready to use folder structures
 */
export default class DateObjectFolderSystems<T> {
    private iterator: AsyncQueryObjectDataIterator<T>;
    private dateLists: Map<DateListType, DateList>;

    /**
     * @param iterator
     * @param options.withChannelEntryHashCache uses ObjectData.ChannelEntryHashCache to cache folder Lists
     */
    constructor(
        iterator: AsyncQueryObjectDataIterator<T>,
        options = {withChannelEntryHashCache: true}
    ) {
        this.iterator = iterator;
        this.dateLists = new Map<DateListType, DateList>();
        if (options.withChannelEntryHashCache) {
            for (const dateType of DateListTypes) {
                this.dateLists.set(dateType, new CachedList<T>(iterator, dateType));
            }
        } else {
            for (const dateType of DateListTypes) {
                this.dateLists.set(dateType, new NonCachedList<T>(iterator, dateType));
            }
        }
    }

    /**
     * Creates a structure YYYY/MM/DD/{parseDataFilesContent}
     * @param parseDataFilesContent
     */
    getYearMonthDayFileType(
        parseDataFilesContent: (
            objecyData: ObjectData<T>
        ) => EasyDirectoryContent | Promise<EasyDirectoryContent>
    ): () => Promise<EasyDirectoryContent> {
        const parseDayEntriesFiles = this.createDayEntriesFiles.bind(this, parseDataFilesContent);
        const parseDayFolders = this.createDayFolders.bind(null, parseDayEntriesFiles);
        const parseMonthFolders = this.createMonthFolders.bind(null, parseDayFolders);
        return this.createYearFolders.bind(null, parseMonthFolders);
    }

    /**
     * Separating ObjectData in folders by year
     * @param parseContent
     * @returns
     */
    private async createYearFolders(
        parseContent: (year: number) => Promise<EasyDirectoryContent>
    ): Promise<EasyDirectoryContent> {
        const dateYearList = this.dateLists.get(DateYearType);
        if (dateYearList === undefined) {
            throw Error(`Date list ${DateYearType} is required`);
        }
        const yearsList = await dateYearList.getList();

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
        const dateMonthList = this.dateLists.get(DateMonthType);
        if (dateMonthList === undefined) {
            throw Error(`Date list ${DateMonthType} is required`);
        }
        const monthsList = await dateMonthList.getList({
            from: new Date(year, 0),
            to: new Date(year, 11, 31, 23, 59, 59)
        });

        return new Map<string, EasyDirectoryEntry>(
            monthsList.map<[string, EasyDirectoryEntry]>(month => [
                String(month + 1),
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
        const dateDayList = this.dateLists.get(DateDayType);
        if (dateDayList === undefined) {
            throw Error(`Date list ${DateDayType} is required`);
        }
        const daysList = await dateDayList.getList({
            from: new Date(year, month, 1),
            to: new Date(year, month + 1, 0, 23, 59, 59)
        });

        return new Map<string, EasyDirectoryEntry>(
            daysList.map<[string, EasyDirectoryEntry]>(day => [
                String(day),
                {
                    type: 'directory',
                    content: parseContent.bind(null, year, month, day)
                }
            ])
        );
    }

    /**
     * Creates files with information given by
     * parseDataFilesContent or defaultParseDataFilesContent
     * for given year, month and day
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
            dir = new Map<string, EasyDirectoryEntry>([
                ...dir,
                ...(await parseContent(objectData))
            ]);
        }

        return dir;
    }
}

interface DateList {
    getList(queryOptions?: QueryOptions): number[] | Promise<number[]>;
}

// one of Date methods that return a number >0
const DateYearType = 'getFullYear';
const DateMonthType = 'getMonth';
const DateDayType = 'getDate';
const DateListTypes = [DateDayType, DateMonthType, DateYearType] as const;
type DateListType = typeof DateListTypes[number];

class CachedList<T> implements DateList {
    private iterator: AsyncQueryObjectDataIterator<T>;
    private dateType: DateListType;
    private cache: number[];
    private channelEntryHash: SHA256Hash<ChannelEntry> | undefined;

    constructor(iterator: AsyncQueryObjectDataIterator<T>, dateType: DateListType) {
        this.iterator = iterator;
        this.cache = [];
        this.dateType = dateType;
    }

    /**
     * Iterates ObjectData, getting a list by specified Date method
     * @returns
     */
    async getList(queryOptions?: QueryOptions): Promise<number[]> {
        const dataList = [];
        let lastValue = -1;
        let firstChannelEntryHash: SHA256Hash<ChannelEntry> | undefined = undefined;

        for await (const objectData of this.iterator({
            omitData: true,
            ...queryOptions
        })) {
            // first object and same channelEntryHash
            // means no change from privous cache, so return old list
            if (
                lastValue === -1 &&
                this.channelEntryHash &&
                this.channelEntryHash === objectData.channelEntryHash
            ) {
                return this.cache;
            }
            // new list, so save new channelEntryHash of first object
            if (lastValue === -1) {
                firstChannelEntryHash = objectData.channelEntryHash;
            }
            // we got to the head of cached info, no need to continue
            // building the list as we have it, so combine them
            if (this.channelEntryHash && this.channelEntryHash === objectData.channelEntryHash) {
                this.channelEntryHash = firstChannelEntryHash;
                this.cache = Array.from(new Set([...dataList, ...this.cache]));
                return this.cache;
            }
            // build list
            if (objectData.creationTime[this.dateType]() !== lastValue) {
                dataList.push(objectData.creationTime[this.dateType]());
                lastValue = objectData.creationTime[this.dateType]();
            }
        }

        this.channelEntryHash = firstChannelEntryHash;
        this.cache = dataList;
        return this.cache;
    }
}

class NonCachedList<T> implements DateList {
    private iterator: AsyncQueryObjectDataIterator<T>;
    private dateType: DateListType;

    constructor(iterator: AsyncQueryObjectDataIterator<T>, dateType: DateListType) {
        this.iterator = iterator;
        this.dateType = dateType;
    }

    /**
     * Iterates ObjectData, getting a list by specified Date method
     * @returns
     */
    async getList(queryOptions?: QueryOptions): Promise<number[]> {
        const dataList = [];
        let lastValue = -1;

        for await (const objectData of this.iterator({
            omitData: true,
            ...queryOptions
        })) {
            if (objectData.creationTime[this.dateType]() !== lastValue) {
                dataList.push(objectData.creationTime[this.dateType]());
                lastValue = objectData.creationTime[this.dateType]();
            }
        }

        return dataList;
    }
}
