import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import type {EasyDirectoryContent} from '../utils/EasyFileSystem';
import type {ExtractSubDirectoryParamsT} from './utils/CachedDirectory';
import type {ChannelIterator} from './utils/ChannelIterator';
import type HierarchicalDirectoryFactory from './utils/HierarchicalDirectoryFactory';
import type {IDirectory} from './utils/IDirectory';
import {DaysDirectory} from './DaysDirectory';
import {MonthsDirectory} from './MonthsDirectory';
import {YearsDirectory} from './YearsDirectory';

/**
 * This directory generates three levels of directories:
 * <year>/<month>/<day>
 */
export class DateDirectories<T extends OneUnversionedObjectTypes | unknown = unknown>
    implements IDirectory
{
    private readonly subDirectoryFactory: HierarchicalDirectoryFactory<
        ExtractSubDirectoryParamsT<DaysDirectory>
    >;
    private readonly yearsDirectory: YearsDirectory;

    constructor(iterator: ChannelIterator<T>) {
        this.yearsDirectory = new YearsDirectory(iterator);
        this.subDirectoryFactory = this.yearsDirectory
            .setSubDirectory(p => new MonthsDirectory(iterator, p))
            .setSubDirectory(p => new DaysDirectory(iterator, p));
    }

    setSubDirectory<DirT extends IDirectory>(
        subDirectoryFactory: (subDirectoryParams: ExtractSubDirectoryParamsT<DaysDirectory>) => DirT
    ): HierarchicalDirectoryFactory<ExtractSubDirectoryParamsT<DirT>> {
        return this.subDirectoryFactory.setSubDirectory(subDirectoryFactory);
    }

    setSubDirectoryAsFunction(
        subDirectoryFactory: (
            subDirectoryParams: ExtractSubDirectoryParamsT<DaysDirectory>
        ) => EasyDirectoryContent | Promise<EasyDirectoryContent>
    ) {
        return this.subDirectoryFactory.setSubDirectoryAsFunction(subDirectoryFactory);
    }

    async createDirectoryContent(): Promise<EasyDirectoryContent> {
        return this.yearsDirectory.createDirectoryContent();
    }
}
