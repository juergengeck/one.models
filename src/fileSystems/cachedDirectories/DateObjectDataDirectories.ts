import type {OneUnversionedObjectTypes} from '@refinio/one.core/lib/recipes';
import type {EasyDirectoryContent} from '../utils/EasyFileSystem';
import {DateToObjectDataTransformDirectory} from './DateToObjectDataTransformDirectory';
import type {ExtractSubDirectoryParamsT} from './utils/CachedDirectory';
import type {ChannelIterator} from './utils/ChannelIterator';
import type HierarchicalDirectoryFactory from './utils/HierarchicalDirectoryFactory';
import type {IDirectory} from './utils/IDirectory';
import {DateDirectories} from './DateDirectories';

/**
 * This directory generates three levels of directories:
 * <year>/<month>/<day> and outputs the data object of the channel
 */
export class DateObjectDataDirectories<T extends OneUnversionedObjectTypes | unknown = unknown>
    implements IDirectory
{
    private readonly subDirectoryFactory: HierarchicalDirectoryFactory<
        ExtractSubDirectoryParamsT<DateToObjectDataTransformDirectory<T>>
    >;
    private readonly dateDirectories: DateDirectories;

    constructor(iterator: ChannelIterator<T>) {
        this.dateDirectories = new DateDirectories(iterator);
        this.subDirectoryFactory = this.dateDirectories.setSubDirectory(
            p => new DateToObjectDataTransformDirectory<T>(iterator, p)
        );
    }

    setSubDirectory<DirT extends IDirectory>(
        subDirectoryFactory: (
            subDirectoryParams: ExtractSubDirectoryParamsT<DateToObjectDataTransformDirectory<T>>
        ) => DirT
    ): HierarchicalDirectoryFactory<ExtractSubDirectoryParamsT<DirT>> {
        return this.subDirectoryFactory.setSubDirectory(subDirectoryFactory);
    }

    setSubDirectoryAsFunction(
        subDirectoryFactory: (
            subDirectoryParams: ExtractSubDirectoryParamsT<DateToObjectDataTransformDirectory<T>>
        ) => EasyDirectoryContent | Promise<EasyDirectoryContent>
    ) {
        return this.subDirectoryFactory.setSubDirectoryAsFunction(subDirectoryFactory);
    }

    async createDirectoryContent(): Promise<EasyDirectoryContent> {
        return this.dateDirectories.createDirectoryContent();
    }
}
