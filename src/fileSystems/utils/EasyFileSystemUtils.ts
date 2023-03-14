import type {ObjectData, QueryOptions} from '../../models/ChannelManager';
import type {EasyDirectoryContent, EasyDirectoryEntry} from './EasyFileSystem';

export type Iterator<T> = (queryOptions?: QueryOptions) => AsyncIterableIterator<ObjectData<T>>;
export type FilesInformation = ({fileNameAddon: string; fileContent: string} | string)[];
export type ParseDataFilesContent<T> = (data: T) => FilesInformation;

export default class EasyFileSystemUtils<T> {
    /**
     *
     * @param easyFileSystem
     * @param iterator
     * @param parseDataFilesContent
     */
    getYearMonthDayFileFolderSystem(
        iterator: Iterator<T>,
        parseDataFilesContent: (
            objectData: ObjectData<T>
        ) => FilesInformation | Promise<FilesInformation>
    ): () => Promise<EasyDirectoryContent> {
        const parseDayEntriesFiles = this.createDayEntriesFiles.bind(
            this,
            iterator,
            parseDataFilesContent
        );
        const parseDayFolders = this.createDayFolders.bind(null, iterator, parseDayEntriesFiles);
        const parseMonthFolders = this.createMonthFolders.bind(null, iterator, parseDayFolders);
        return this.createYearFolders.bind(null, iterator, parseMonthFolders);
    }

    /**
     * Iterates ObjectData, separating them in folders by year
     * @returns
     */
    async createYearFolders(
        iterator: Iterator<T>,
        parseContent: (year: number) => Promise<EasyDirectoryContent>
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        let lastYearFolder = 0;

        for await (const objectData of iterator({omitData: true})) {
            if (objectData.creationTime.getFullYear() !== lastYearFolder) {
                dir.set(String(objectData.creationTime.getFullYear()), {
                    type: 'directory',
                    content: parseContent.bind(null, objectData.creationTime.getFullYear())
                });
                lastYearFolder = objectData.creationTime.getFullYear();
            }
        }

        return dir;
    }

    /**
     * Iterates ObjectData, separating them in folders by month for given year
     * @returns
     */
    async createMonthFolders(
        iterator: Iterator<T>,
        parseContent: (year: number, month: number) => Promise<EasyDirectoryContent>,
        year: number
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const fromDate = new Date(year, 0);
        const toDate = new Date(year, 11, 31, 23, 59, 59);
        let lastMonthFolder = 0;

        for await (const objectData of iterator({omitData: true, from: fromDate, to: toDate})) {
            if (objectData.creationTime.getMonth() !== lastMonthFolder) {
                dir.set(String(objectData.creationTime.getMonth()), {
                    type: 'directory',
                    content: parseContent.bind(null, year, objectData.creationTime.getMonth())
                });
                lastMonthFolder = objectData.creationTime.getMonth();
            }
        }

        return dir;
    }

    /**
     * Iterates ObjectData, separating them in folders by day for given year and month
     * @returns
     */
    async createDayFolders(
        iterator: Iterator<T>,
        parseContent: (year: number, month: number, day: number) => Promise<EasyDirectoryContent>,
        year: number,
        month: number
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const fromDate = new Date(year, month, 1);
        const toDate = new Date(year, month + 1, 0, 23, 59, 59);
        let lastDayFolder = 0;

        for await (const objectData of iterator({omitData: true, from: fromDate, to: toDate})) {
            if (objectData.creationTime.getDate() !== lastDayFolder) {
                dir.set(String(objectData.creationTime.getDate()), {
                    type: 'directory',
                    content: parseContent.bind(null, year, month, objectData.creationTime.getDate())
                });
                lastDayFolder = objectData.creationTime.getDate();
            }
        }

        return dir;
    }

    /**
     * Iterates ObjectData creating files with information given by
     * parseDataFilesContent or defaultParseDataFilesContent
     * for given year, month and day
     *
     * @returns
     */
    async createDayEntriesFiles(
        iterator: Iterator<T>,
        parseContent: (objecyData: ObjectData<T>) => FilesInformation | Promise<FilesInformation>,
        year: number,
        month: number,
        day: number
    ): Promise<EasyDirectoryContent> {
        const dir = new Map<string, EasyDirectoryEntry>();

        const fromDate = new Date(year, month, day);
        const toDate = new Date(year, month, day, 23, 59, 59);

        for await (const objectData of iterator({from: fromDate, to: toDate})) {
            const creationTime = objectData.creationTime;
            const uniqueAddon = objectData.channelOwner
                ? objectData.channelOwner
                : creationTime.getMilliseconds();
            const time = `${creationTime.getHours()}-${creationTime.getMinutes()}-${creationTime.getSeconds()}`;

            const files = await parseContent(objectData);

            files.forEach(file => {
                const fileNameAddon = typeof file === 'string' ? undefined : file.fileNameAddon;
                const fileContent = typeof file === 'string' ? file : file.fileContent;

                dir.set(`${time}_${fileNameAddon ? `${fileNameAddon}_` : ''}${uniqueAddon}.txt`, {
                    type: 'regularFile',
                    content: fileContent
                });
            });
        }

        return dir;
    }
}
