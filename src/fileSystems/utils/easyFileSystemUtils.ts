import type {ObjectData, QueryOptions} from '../../models/ChannelManager';
import type {EasyDirectory, EasyDirectoryContent, EasyDirectoryEntry} from './EasyFileSystem';

export type Iterator<T> = (queryOptions?: QueryOptions) => AsyncIterableIterator<ObjectData<T>>;
export type FilesInformation = ({fileNameAddon: string; fileContent: string} | string)[];
export type ParseDataFilesContent<T> = (data: T) => FilesInformation;

/**
 * Create folder structure YYYY/MM/DD/file
 * @param iterator
 * @param parseContent
 * @returns
 */
export function createYearMonthDayFileFolderStructure<T>(
    iterator: Iterator<T>,
    parseContent: (data: T) => FilesInformation | Promise<FilesInformation>
): () => Promise<EasyDirectoryContent> {
    // use prettier ignore else eslint complains
    // prettier-ignore
    const parseDayEntriesFiles = ((createDayEntriesFiles)<T>).bind(null, iterator, parseContent);
    // prettier-ignore
    const parseDayFolders = ((createDayFolders)<T>).bind(null, iterator, parseDayEntriesFiles);
    // prettier-ignore
    const parseMonthFolders = ((createMonthFolders)<T>).bind(null, iterator, parseDayFolders);
    // prettier-ignore
    const parseYearFolders = ((createYearFolders)<T>).bind(null, iterator, parseMonthFolders);
    return parseYearFolders;
}

/**
 * Iterates ObjectData, separating them in folders by year
 * @returns
 */
export async function createYearFolders<T>(
    iterator: Iterator<T>,
    parseContent: (year: number) => Promise<EasyDirectory>
): Promise<EasyDirectoryContent> {
    const dir = new Map<string, EasyDirectoryEntry>();

    let lastYearFolder = 0;

    for await (const objectData of iterator({omitData: true})) {
        if (objectData.creationTime.getFullYear() !== lastYearFolder) {
            dir.set(String(objectData.creationTime.getFullYear()), {
                type: 'directory',
                content: await parseContent(objectData.creationTime.getFullYear())
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
export async function createMonthFolders<T>(
    iterator: Iterator<T>,
    parseContent: (year: number, month: number) => Promise<EasyDirectory>,
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
                content: await parseContent(year, objectData.creationTime.getMonth())
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
export async function createDayFolders<T>(
    iterator: Iterator<T>,
    parseContent: (year: number, month: number, day: number) => Promise<EasyDirectory>,
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
                content: await parseContent(year, month, objectData.creationTime.getDate())
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
export async function createDayEntriesFiles<T>(
    iterator: Iterator<T>,
    parseContent: (data: T) => FilesInformation | Promise<FilesInformation>,
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

        const files = await parseContent(objectData.data);

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
