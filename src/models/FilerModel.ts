/**
 * @author Sebastian Sandru <sebastian@refinio.com>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

import {
    BLOB,
    FilerDirectory,
    FileRule,
    HashTypes,
    OneUnversionedObjectTypes,
    OneVersionedObjectTypes,
    SHA256Hash,
    SHA256IdHash
} from '@OneCoreTypes';
import {EventEmitter} from 'events';
import {
    createSingleObjectThroughPurePlan,
    getObject,
    getObjectByIdHash,
    VersionMapEntry
} from 'one.core/lib/storage';
import {ChannelManager} from './index';
import {VERSION_UPDATES} from 'one.core/lib/storage-base-common';
import {calculateHashOfObj} from 'one.core/lib/util/object';
import * as storage from 'one.core/lib/storage';

export default class FilerModel extends EventEmitter {
    private channelManager: ChannelManager;
    private readonly channelId: string;
    private readonly boundOnUpdatedHandler: (id: string) => Promise<void>;

    public constructor(channelManager: ChannelManager) {
        super();
        this.channelManager = channelManager;
        this.channelId = 'rootDirectories';
        this.boundOnUpdatedHandler = this.handleOnUpdated.bind(this);
    }

    /**
     * create the channel & the root directory if it does not exists
     * @returns {Promise<void>}
     */
    public async init() {
        await this.channelManager.createChannel(this.channelId);
        await this.createRootDirectoryIfNotExists();
        this.channelManager.on('updated', this.boundOnUpdatedHandler);
    }

    /**
     * Overwrites a file if the file already exist in the folder, otherwise, adds the file
     * @param directoryPath
     * @param fileHash
     * @param fileName
     * @param fileMode
     */
    public async addFile(
        directoryPath: string,
        fileHash: SHA256Hash<BLOB>,
        fileName: string,
        fileMode = 0o0100777
    ): Promise<FilerDirectory> {
        const targetDirectory = await this.retrieveDirectory(directoryPath);
        if (targetDirectory) {
            /** calculate the hash of the outdated directory **/
            const oldTargetDirectoryHash = await calculateHashOfObj(targetDirectory);

            const fileIndex = targetDirectory.files.findIndex(
                (file: FileRule) => file.name === fileName
            );
            /** if the file exists **/
            if (fileIndex !== -1) {
                /** replace it **/
                targetDirectory.files[fileIndex] = {
                    BLOB: fileHash,
                    mode: fileMode,
                    name: fileName
                };
            } else {
                /** otherwise add the file **/
                targetDirectory.files.push({
                    BLOB: fileHash,
                    mode: fileMode,
                    name: fileName
                });
            }

            /** update the directory **/
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                targetDirectory
            );
            /** get the updated directory hash **/
            const updatedTargetDirectoryHash = await calculateHashOfObj(targetDirectory);
            /** update the nodes above **/
            await this.updateParentDirectoryRecursive(
                oldTargetDirectoryHash,
                updatedTargetDirectoryHash
            );
            return await getObject(updatedTargetDirectoryHash);
        }

        throw new Error('Directory could not be found');
    }

    /**
     * @param directoryPath
     * @param newDirectoryObj
     */
    public async addDirectoryToDirectory(
        directoryPath: string,
        newDirectoryObj: FilerDirectory
    ): Promise<FilerDirectory> {
        const targetDirectory = await this.retrieveDirectory(directoryPath);

        const pathExists = await this.retrieveDirectory(newDirectoryObj.path);

        if (targetDirectory && pathExists === undefined) {
            /** calculate the hash of the outdated directory **/
            const newDirectory = await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                newDirectoryObj
            );
            const newDirectoryHash = await calculateHashOfObj(newDirectory.obj);

            /** Intentionally the same hash because this directory was created now **/
            await this.updateParentDirectoryRecursive(newDirectoryHash, newDirectoryHash);
            return newDirectory.obj;
        }

        throw new Error('Directory could not be found');
    }

    /**
     * Checks if a file exists or not
     * @param directoryPath
     * @param fileName
     */
    public async retrieveFile(
        directoryPath: string,
        fileName: string
    ): Promise<FileRule | undefined> {
        const directory = await this.retrieveDirectory(directoryPath);
        if (directory) {
            const exists = directory.files.find((file: FileRule) => file.name === fileName);
            if (exists) {
                return exists;
            }
            return undefined;
        }
        return undefined;
    }

    /**
     *
     * @param {string} path
     * @returns {Promise<FilerDirectory | undefined>}
     */
    public async retrieveDirectory(path: string): Promise<FilerDirectory | undefined> {
        /** get the latest root directory in the channel **/
        const directoriesResults = await this.channelManager.getObjectsWithType('FilerDirectory', {
            channelId: this.channelId,
            count: 1
        });
        const rootDirectory = directoriesResults[0];
        /** check if it is the root directory **/
        if (rootDirectory && rootDirectory.data.path === '/') {
            for await (const dir of this.iterateDirectories(rootDirectory.dataHash)) {
                if (dir.path === path) {
                    return dir;
                }
            }
        }
        return undefined;
    }

    /**
     *
     * @returns {Promise<((Demand & NotifiedUsers) | (Demand & Group) | (Demand & LocalInstancesList) | (Demand & Instance) | (Demand & Recipe) | (Demand & ContactApp) | (Demand & Access) | (Demand & ChannelInfo) | (Demand & Profile) | (Demand & IdAccess) | (Demand & SupplyMap) | (Demand & ChannelRegistry) | (Demand & MatchMap) | (Demand & Module) | (Demand & Chum) | (Demand & Person) | (Demand & Settings) | (Demand & DemandMap) | (PersonName & NotifiedUsers) | (PersonName & Group) | (PersonName & LocalInstancesList) | (PersonName & Instance) | (PersonName & Recipe) | (PersonName & ContactApp) | (PersonName & Access) | (PersonName & ChannelInfo) | (PersonName & Profile) | (PersonName & IdAccess) | (PersonName & SupplyMap) | (PersonName & ChannelRegistry) | (PersonName & MatchMap) | (PersonName & Module) | (PersonName & Chum) | (PersonName & Person) | (PersonName & Settings) | (PersonName & DemandMap) | (FilerDirectory & NotifiedUsers) | (FilerDirectory & Group) | (FilerDirectory & LocalInstancesList) | (FilerDirectory & Instance) | (FilerDirectory & Recipe) | (FilerDirectory & ContactApp) | (FilerDirectory & Access) | (FilerDirectory & ChannelInfo) | (FilerDirectory & Profile) | (FilerDirectory & IdAccess) | (FilerDirectory & SupplyMap) | (FilerDirectory & ChannelRegistry) | (FilerDirectory & MatchMap) | (FilerDirectory & Module) | (FilerDirectory & Chum) | (FilerDirectory & Person) | (FilerDirectory & Settings) | (FilerDirectory & DemandMap) | (BodyTemperature & NotifiedUsers) | (BodyTemperature & Group) | (BodyTemperature & LocalInstancesList) | (BodyTemperature & Instance) | (BodyTemperature & Recipe) | (BodyTemperature & ContactApp) | (BodyTemperature & Access) | (BodyTemperature & ChannelInfo) | (BodyTemperature & Profile) | (BodyTemperature & IdAccess) | (BodyTemperature & SupplyMap) | (BodyTemperature & ChannelRegistry) | (BodyTemperature & MatchMap) | (BodyTemperature & Module) | (BodyTemperature & Chum) | (BodyTemperature & Person) | (BodyTemperature & Settings) | (BodyTemperature & DemandMap) | (ConsentFile & NotifiedUsers) | (ConsentFile & Group) | (ConsentFile & LocalInstancesList) | (ConsentFile & Instance) | (ConsentFile & Recipe) | (ConsentFile & ContactApp) | (ConsentFile & Access) | (ConsentFile & ChannelInfo) | (ConsentFile & Profile) | (ConsentFile & IdAccess) | (ConsentFile & SupplyMap) | (ConsentFile & ChannelRegistry) | (ConsentFile & MatchMap) | (ConsentFile & Module) | (ConsentFile & Chum) | (ConsentFile & Person) | (ConsentFile & Settings) | (ConsentFile & DemandMap) | (Supply & NotifiedUsers) | (Supply & Group) | (Supply & LocalInstancesList) | (Supply & Instance) | (Supply & Recipe) | (Supply & ContactApp) | (Supply & Access) | (Supply & ChannelInfo) | (Supply & Profile) | (Supply & IdAccess) | (Supply & SupplyMap) | (Supply & ChannelRegistry) | (Supply & MatchMap) | (Supply & Module) | (Supply & Chum) | (Supply & Person) | (Supply & Settings) | (Supply & DemandMap) | (DiaryEntry & NotifiedUsers) | (DiaryEntry & Group) | (DiaryEntry & LocalInstancesList) | (DiaryEntry & Instance) | (DiaryEntry & Recipe) | (DiaryEntry & ContactApp) | (DiaryEntry & Access) | (DiaryEntry & ChannelInfo) | (DiaryEntry & Profile) | (DiaryEntry & IdAccess) | (DiaryEntry & SupplyMap) | (DiaryEntry & ChannelRegistry) | (DiaryEntry & MatchMap) | (DiaryEntry & Module) | (DiaryEntry & Chum) | (DiaryEntry & Person) | (DiaryEntry & Settings) | (DiaryEntry & DemandMap) | (ChannelEntry & NotifiedUsers) | (ChannelEntry & Group) | (ChannelEntry & LocalInstancesList) | (ChannelEntry & Instance) | (ChannelEntry & Recipe) | (ChannelEntry & ContactApp) | (ChannelEntry & Access) | (ChannelEntry & ChannelInfo) | (ChannelEntry & Profile) | (ChannelEntry & IdAccess) | (ChannelEntry & SupplyMap) | (ChannelEntry & ChannelRegistry) | (ChannelEntry & MatchMap) | (ChannelEntry & Module) | (ChannelEntry & Chum) | (ChannelEntry & Person) | (ChannelEntry & Settings) | (ChannelEntry & DemandMap) | (Someone & NotifiedUsers) | (Someone & Group) | (Someone & LocalInstancesList) | (Someone & Instance) | (Someone & Recipe) | (Someone & ContactApp) | (Someone & Access) | (Someone & ChannelInfo) | (Someone & Profile) | (Someone & IdAccess) | (Someone & SupplyMap) | (Someone & ChannelRegistry) | (Someone & MatchMap) | (Someone & Module) | (Someone & Chum) | (Someone & Person) | (Someone & Settings) | (Someone & DemandMap) | (Plan & NotifiedUsers) | (Plan & Group) | (Plan & LocalInstancesList) | (Plan & Instance) | (Plan & Recipe) | (Plan & ContactApp) | (Plan & Access) | (Plan & ChannelInfo) | (Plan & Profile) | (Plan & IdAccess) | (Plan & SupplyMap) | (Plan & ChannelRegistry) | (Plan & MatchMap) | (Plan & Module) | (Plan & Chum) | (Plan & Person) | (Plan & Settings) | (Plan & DemandMap) | (QuestionnaireResponse & NotifiedUsers) | (QuestionnaireResponse & Group) | (QuestionnaireResponse & LocalInstancesList) | (QuestionnaireResponse & Instance) | (QuestionnaireResponse & Recipe) | (QuestionnaireResponse & ContactApp) | (QuestionnaireResponse & Access) | (QuestionnaireResponse & ChannelInfo) | (QuestionnaireResponse & Profile) | (QuestionnaireResponse & IdAccess) | (QuestionnaireResponse & SupplyMap) | (QuestionnaireResponse & ChannelRegistry) | (QuestionnaireResponse & MatchMap) | (QuestionnaireResponse & Module) | (QuestionnaireResponse & Chum) | (QuestionnaireResponse & Person) | (QuestionnaireResponse & Settings) | (QuestionnaireResponse & DemandMap) | (Contact & NotifiedUsers) | (Contact & Group) | (Contact & LocalInstancesList) | (Contact & Instance) | (Contact & Recipe) | (Contact & ContactApp) | (Contact & Access) | (Contact & ChannelInfo) | (Contact & Profile) | (Contact & IdAccess) | (Contact & SupplyMap) | (Contact & ChannelRegistry) | (Contact & MatchMap) | (Contact & Module) | (Contact & Chum) | (Contact & Person) | (Contact & Settings) | (Contact & DemandMap) | (BlobDescriptor & NotifiedUsers) | (BlobDescriptor & Group) | (BlobDescriptor & LocalInstancesList) | (BlobDescriptor & Instance) | (BlobDescriptor & Recipe) | (BlobDescriptor & ContactApp) | (BlobDescriptor & Access) | (BlobDescriptor & ChannelInfo) | (BlobDescriptor & Profile) | (BlobDescriptor & IdAccess) | (BlobDescriptor & SupplyMap) | (BlobDescriptor & ChannelRegistry) | (BlobDescriptor & MatchMap) | (BlobDescriptor & Module) | (BlobDescriptor & Chum) | (BlobDescriptor & Person) | (BlobDescriptor & Settings) | (BlobDescriptor & DemandMap) | (OneInstanceEndpoint & NotifiedUsers) | (OneInstanceEndpoint & Group) | (OneInstanceEndpoint & LocalInstancesList) | (OneInstanceEndpoint & Instance) | (OneInstanceEndpoint & Recipe) | (OneInstanceEndpoint & ContactApp) | (OneInstanceEndpoint & Access) | (OneInstanceEndpoint & ChannelInfo) | (OneInstanceEndpoint & Profile) | (OneInstanceEndpoint & IdAccess) | (OneInstanceEndpoint & SupplyMap) | (OneInstanceEndpoint & ChannelRegistry) | (OneInstanceEndpoint & MatchMap) | (OneInstanceEndpoint & Module) | (OneInstanceEndpoint & Chum) | (OneInstanceEndpoint & Person) | (OneInstanceEndpoint & Settings) | (OneInstanceEndpoint & DemandMap) | (BlobCollection & NotifiedUsers) | (BlobCollection & Group) | (BlobCollection & LocalInstancesList) | (BlobCollection & Instance) | (BlobCollection & Recipe) | (BlobCollection & ContactApp) | (BlobCollection & Access) | (BlobCollection & ChannelInfo) | (BlobCollection & Profile) | (BlobCollection & IdAccess) | (BlobCollection & SupplyMap) | (BlobCollection & ChannelRegistry) | (BlobCollection & MatchMap) | (BlobCollection & Module) | (BlobCollection & Chum) | (BlobCollection & Person) | (BlobCollection & Settings) | (BlobCollection & DemandMap) | (Electrocardiogram & NotifiedUsers) | (Electrocardiogram & Group) | (Electrocardiogram & LocalInstancesList) | (Electrocardiogram & Instance) | (Electrocardiogram & Recipe) | (Electrocardiogram & ContactApp) | (Electrocardiogram & Access) | (Electrocardiogram & ChannelInfo) | (Electrocardiogram & Profile) | (Electrocardiogram & IdAccess) | (Electrocardiogram & SupplyMap) | (Electrocardiogram & ChannelRegistry) | (Electrocardiogram & MatchMap) | (Electrocardiogram & Module) | (Electrocardiogram & Chum) | (Electrocardiogram & Person) | (Electrocardiogram & Settings) | (Electrocardiogram & DemandMap) | (ProfileImage & NotifiedUsers) | (ProfileImage & Group) | (ProfileImage & LocalInstancesList) | (ProfileImage & Instance) | (ProfileImage & Recipe) | (ProfileImage & ContactApp) | (ProfileImage & Access) | (ProfileImage & ChannelInfo) | (ProfileImage & Profile) | (ProfileImage & IdAccess) | (ProfileImage & SupplyMap) | (ProfileImage & ChannelRegistry) | (ProfileImage & MatchMap) | (ProfileImage & Module) | (ProfileImage & Chum) | (ProfileImage & Person) | (ProfileImage & Settings) | (ProfileImage & DemandMap) | (News & NotifiedUsers) | (News & Group) | (News & LocalInstancesList) | (News & Instance) | (News & Recipe) | (News & ContactApp) | (News & Access) | (News & ChannelInfo) | (News & Profile) | (News & IdAccess) | (News & SupplyMap) | (News & ChannelRegistry) | (News & MatchMap) | (News & Module) | (News & Chum) | (News & Person) | (News & Settings) | (News & DemandMap) | (Keys & NotifiedUsers) | (Keys & Group) | (Keys & LocalInstancesList) | (Keys & Instance) | (Keys & Recipe) | (Keys & ContactApp) | (Keys & Access) | (Keys & ChannelInfo) | (Keys & Profile) | (Keys & IdAccess) | (Keys & SupplyMap) | (Keys & ChannelRegistry) | (Keys & MatchMap) | (Keys & Module) | (Keys & Chum) | (Keys & Person) | (Keys & Settings) | (Keys & DemandMap) | (MatchResponse & NotifiedUsers) | (MatchResponse & Group) | (MatchResponse & LocalInstancesList) | (MatchResponse & Instance) | (MatchResponse & Recipe) | (MatchResponse & ContactApp) | (MatchResponse & Access) | (MatchResponse & ChannelInfo) | (MatchResponse & Profile) | (MatchResponse & IdAccess) | (MatchResponse & SupplyMap) | (MatchResponse & ChannelRegistry) | (MatchResponse & MatchMap) | (MatchResponse & Module) | (MatchResponse & Chum) | (MatchResponse & Person) | (MatchResponse & Settings) | (MatchResponse & DemandMap) | (CreationTime & NotifiedUsers) | (CreationTime & Group) | (CreationTime & LocalInstancesList) | (CreationTime & Instance) | (CreationTime & Recipe) | (CreationTime & ContactApp) | (CreationTime & Access) | (CreationTime & ChannelInfo) | (CreationTime & Profile) | (CreationTime & IdAccess) | (CreationTime & SupplyMap) | (CreationTime & ChannelRegistry) | (CreationTime & MatchMap) | (CreationTime & Module) | (CreationTime & Chum) | (CreationTime & Person) | (CreationTime & Settings) | (CreationTime & DemandMap) | (WbcObservation & NotifiedUsers) | (WbcObservation & Group) | (WbcObservation & LocalInstancesList) | (WbcObservation & Instance) | (WbcObservation & Recipe) | (WbcObservation & ContactApp) | (WbcObservation & Access) | (WbcObservation & ChannelInfo) | (WbcObservation & Profile) | (WbcObservation & IdAccess) | (WbcObservation & SupplyMap) | (WbcObservation & ChannelRegistry) | (WbcObservation & MatchMap) | (WbcObservation & Module) | (WbcObservation & Chum) | (WbcObservation & Person) | (WbcObservation & Settings) | (WbcObservation & DemandMap) | (DocumentInfo & NotifiedUsers) | (DocumentInfo & Group) | (DocumentInfo & LocalInstancesList) | (DocumentInfo & Instance) | (DocumentInfo & Recipe) | (DocumentInfo & ContactApp) | (DocumentInfo & Access) | (DocumentInfo & ChannelInfo) | (DocumentInfo & Profile) | (DocumentInfo & IdAccess) | (DocumentInfo & SupplyMap) | (DocumentInfo & ChannelRegistry) | (DocumentInfo & MatchMap) | (DocumentInfo & Module) | (DocumentInfo & Chum) | (DocumentInfo & Person) | (DocumentInfo & Settings) | (DocumentInfo & DemandMap))[]>}
     */
    public async getObjectsTypes(): Promise<
        (OneUnversionedObjectTypes & OneVersionedObjectTypes)[]
    > {
        const types: (OneUnversionedObjectTypes & OneVersionedObjectTypes)[] = [];

        const objectHashes: SHA256Hash<HashTypes>[] = await storage.listAllObjectHashes();
        await Promise.all(
            objectHashes.map(async (objectHash: SHA256Hash<HashTypes>) => {
                const type = await storage.getFileType(objectHash);
                if (!types.find(typeItem => type === typeItem)) {
                    types.push(type as OneUnversionedObjectTypes & OneVersionedObjectTypes);
                }
            })
        );
        return types;
    }

    /**
     *
     * @returns {Promise<Map<(Demand & NotifiedUsers) | (Demand & Group) | (Demand & LocalInstancesList) | (Demand & Instance) | (Demand & Recipe) | (Demand & ContactApp) | (Demand & Access) | (Demand & ChannelInfo) | (Demand & Profile) | (Demand & IdAccess) | (Demand & SupplyMap) | (Demand & ChannelRegistry) | (Demand & MatchMap) | (Demand & Module) | (Demand & Chum) | (Demand & Person) | (Demand & Settings) | (Demand & DemandMap) | (PersonName & NotifiedUsers) | (PersonName & Group) | (PersonName & LocalInstancesList) | (PersonName & Instance) | (PersonName & Recipe) | (PersonName & ContactApp) | (PersonName & Access) | (PersonName & ChannelInfo) | (PersonName & Profile) | (PersonName & IdAccess) | (PersonName & SupplyMap) | (PersonName & ChannelRegistry) | (PersonName & MatchMap) | (PersonName & Module) | (PersonName & Chum) | (PersonName & Person) | (PersonName & Settings) | (PersonName & DemandMap) | (FilerDirectory & NotifiedUsers) | (FilerDirectory & Group) | (FilerDirectory & LocalInstancesList) | (FilerDirectory & Instance) | (FilerDirectory & Recipe) | (FilerDirectory & ContactApp) | (FilerDirectory & Access) | (FilerDirectory & ChannelInfo) | (FilerDirectory & Profile) | (FilerDirectory & IdAccess) | (FilerDirectory & SupplyMap) | (FilerDirectory & ChannelRegistry) | (FilerDirectory & MatchMap) | (FilerDirectory & Module) | (FilerDirectory & Chum) | (FilerDirectory & Person) | (FilerDirectory & Settings) | (FilerDirectory & DemandMap) | (BodyTemperature & NotifiedUsers) | (BodyTemperature & Group) | (BodyTemperature & LocalInstancesList) | (BodyTemperature & Instance) | (BodyTemperature & Recipe) | (BodyTemperature & ContactApp) | (BodyTemperature & Access) | (BodyTemperature & ChannelInfo) | (BodyTemperature & Profile) | (BodyTemperature & IdAccess) | (BodyTemperature & SupplyMap) | (BodyTemperature & ChannelRegistry) | (BodyTemperature & MatchMap) | (BodyTemperature & Module) | (BodyTemperature & Chum) | (BodyTemperature & Person) | (BodyTemperature & Settings) | (BodyTemperature & DemandMap) | (ConsentFile & NotifiedUsers) | (ConsentFile & Group) | (ConsentFile & LocalInstancesList) | (ConsentFile & Instance) | (ConsentFile & Recipe) | (ConsentFile & ContactApp) | (ConsentFile & Access) | (ConsentFile & ChannelInfo) | (ConsentFile & Profile) | (ConsentFile & IdAccess) | (ConsentFile & SupplyMap) | (ConsentFile & ChannelRegistry) | (ConsentFile & MatchMap) | (ConsentFile & Module) | (ConsentFile & Chum) | (ConsentFile & Person) | (ConsentFile & Settings) | (ConsentFile & DemandMap) | (Supply & NotifiedUsers) | (Supply & Group) | (Supply & LocalInstancesList) | (Supply & Instance) | (Supply & Recipe) | (Supply & ContactApp) | (Supply & Access) | (Supply & ChannelInfo) | (Supply & Profile) | (Supply & IdAccess) | (Supply & SupplyMap) | (Supply & ChannelRegistry) | (Supply & MatchMap) | (Supply & Module) | (Supply & Chum) | (Supply & Person) | (Supply & Settings) | (Supply & DemandMap) | (DiaryEntry & NotifiedUsers) | (DiaryEntry & Group) | (DiaryEntry & LocalInstancesList) | (DiaryEntry & Instance) | (DiaryEntry & Recipe) | (DiaryEntry & ContactApp) | (DiaryEntry & Access) | (DiaryEntry & ChannelInfo) | (DiaryEntry & Profile) | (DiaryEntry & IdAccess) | (DiaryEntry & SupplyMap) | (DiaryEntry & ChannelRegistry) | (DiaryEntry & MatchMap) | (DiaryEntry & Module) | (DiaryEntry & Chum) | (DiaryEntry & Person) | (DiaryEntry & Settings) | (DiaryEntry & DemandMap) | (ChannelEntry & NotifiedUsers) | (ChannelEntry & Group) | (ChannelEntry & LocalInstancesList) | (ChannelEntry & Instance) | (ChannelEntry & Recipe) | (ChannelEntry & ContactApp) | (ChannelEntry & Access) | (ChannelEntry & ChannelInfo) | (ChannelEntry & Profile) | (ChannelEntry & IdAccess) | (ChannelEntry & SupplyMap) | (ChannelEntry & ChannelRegistry) | (ChannelEntry & MatchMap) | (ChannelEntry & Module) | (ChannelEntry & Chum) | (ChannelEntry & Person) | (ChannelEntry & Settings) | (ChannelEntry & DemandMap) | (Someone & NotifiedUsers) | (Someone & Group) | (Someone & LocalInstancesList) | (Someone & Instance) | (Someone & Recipe) | (Someone & ContactApp) | (Someone & Access) | (Someone & ChannelInfo) | (Someone & Profile) | (Someone & IdAccess) | (Someone & SupplyMap) | (Someone & ChannelRegistry) | (Someone & MatchMap) | (Someone & Module) | (Someone & Chum) | (Someone & Person) | (Someone & Settings) | (Someone & DemandMap) | (Plan & NotifiedUsers) | (Plan & Group) | (Plan & LocalInstancesList) | (Plan & Instance) | (Plan & Recipe) | (Plan & ContactApp) | (Plan & Access) | (Plan & ChannelInfo) | (Plan & Profile) | (Plan & IdAccess) | (Plan & SupplyMap) | (Plan & ChannelRegistry) | (Plan & MatchMap) | (Plan & Module) | (Plan & Chum) | (Plan & Person) | (Plan & Settings) | (Plan & DemandMap) | (QuestionnaireResponse & NotifiedUsers) | (QuestionnaireResponse & Group) | (QuestionnaireResponse & LocalInstancesList) | (QuestionnaireResponse & Instance) | (QuestionnaireResponse & Recipe) | (QuestionnaireResponse & ContactApp) | (QuestionnaireResponse & Access) | (QuestionnaireResponse & ChannelInfo) | (QuestionnaireResponse & Profile) | (QuestionnaireResponse & IdAccess) | (QuestionnaireResponse & SupplyMap) | (QuestionnaireResponse & ChannelRegistry) | (QuestionnaireResponse & MatchMap) | (QuestionnaireResponse & Module) | (QuestionnaireResponse & Chum) | (QuestionnaireResponse & Person) | (QuestionnaireResponse & Settings) | (QuestionnaireResponse & DemandMap) | (Contact & NotifiedUsers) | (Contact & Group) | (Contact & LocalInstancesList) | (Contact & Instance) | (Contact & Recipe) | (Contact & ContactApp) | (Contact & Access) | (Contact & ChannelInfo) | (Contact & Profile) | (Contact & IdAccess) | (Contact & SupplyMap) | (Contact & ChannelRegistry) | (Contact & MatchMap) | (Contact & Module) | (Contact & Chum) | (Contact & Person) | (Contact & Settings) | (Contact & DemandMap) | (BlobDescriptor & NotifiedUsers) | (BlobDescriptor & Group) | (BlobDescriptor & LocalInstancesList) | (BlobDescriptor & Instance) | (BlobDescriptor & Recipe) | (BlobDescriptor & ContactApp) | (BlobDescriptor & Access) | (BlobDescriptor & ChannelInfo) | (BlobDescriptor & Profile) | (BlobDescriptor & IdAccess) | (BlobDescriptor & SupplyMap) | (BlobDescriptor & ChannelRegistry) | (BlobDescriptor & MatchMap) | (BlobDescriptor & Module) | (BlobDescriptor & Chum) | (BlobDescriptor & Person) | (BlobDescriptor & Settings) | (BlobDescriptor & DemandMap) | (OneInstanceEndpoint & NotifiedUsers) | (OneInstanceEndpoint & Group) | (OneInstanceEndpoint & LocalInstancesList) | (OneInstanceEndpoint & Instance) | (OneInstanceEndpoint & Recipe) | (OneInstanceEndpoint & ContactApp) | (OneInstanceEndpoint & Access) | (OneInstanceEndpoint & ChannelInfo) | (OneInstanceEndpoint & Profile) | (OneInstanceEndpoint & IdAccess) | (OneInstanceEndpoint & SupplyMap) | (OneInstanceEndpoint & ChannelRegistry) | (OneInstanceEndpoint & MatchMap) | (OneInstanceEndpoint & Module) | (OneInstanceEndpoint & Chum) | (OneInstanceEndpoint & Person) | (OneInstanceEndpoint & Settings) | (OneInstanceEndpoint & DemandMap) | (BlobCollection & NotifiedUsers) | (BlobCollection & Group) | (BlobCollection & LocalInstancesList) | (BlobCollection & Instance) | (BlobCollection & Recipe) | (BlobCollection & ContactApp) | (BlobCollection & Access) | (BlobCollection & ChannelInfo) | (BlobCollection & Profile) | (BlobCollection & IdAccess) | (BlobCollection & SupplyMap) | (BlobCollection & ChannelRegistry) | (BlobCollection & MatchMap) | (BlobCollection & Module) | (BlobCollection & Chum) | (BlobCollection & Person) | (BlobCollection & Settings) | (BlobCollection & DemandMap) | (Electrocardiogram & NotifiedUsers) | (Electrocardiogram & Group) | (Electrocardiogram & LocalInstancesList) | (Electrocardiogram & Instance) | (Electrocardiogram & Recipe) | (Electrocardiogram & ContactApp) | (Electrocardiogram & Access) | (Electrocardiogram & ChannelInfo) | (Electrocardiogram & Profile) | (Electrocardiogram & IdAccess) | (Electrocardiogram & SupplyMap) | (Electrocardiogram & ChannelRegistry) | (Electrocardiogram & MatchMap) | (Electrocardiogram & Module) | (Electrocardiogram & Chum) | (Electrocardiogram & Person) | (Electrocardiogram & Settings) | (Electrocardiogram & DemandMap) | (ProfileImage & NotifiedUsers) | (ProfileImage & Group) | (ProfileImage & LocalInstancesList) | (ProfileImage & Instance) | (ProfileImage & Recipe) | (ProfileImage & ContactApp) | (ProfileImage & Access) | (ProfileImage & ChannelInfo) | (ProfileImage & Profile) | (ProfileImage & IdAccess) | (ProfileImage & SupplyMap) | (ProfileImage & ChannelRegistry) | (ProfileImage & MatchMap) | (ProfileImage & Module) | (ProfileImage & Chum) | (ProfileImage & Person) | (ProfileImage & Settings) | (ProfileImage & DemandMap) | (News & NotifiedUsers) | (News & Group) | (News & LocalInstancesList) | (News & Instance) | (News & Recipe) | (News & ContactApp) | (News & Access) | (News & ChannelInfo) | (News & Profile) | (News & IdAccess) | (News & SupplyMap) | (News & ChannelRegistry) | (News & MatchMap) | (News & Module) | (News & Chum) | (News & Person) | (News & Settings) | (News & DemandMap) | (Keys & NotifiedUsers) | (Keys & Group) | (Keys & LocalInstancesList) | (Keys & Instance) | (Keys & Recipe) | (Keys & ContactApp) | (Keys & Access) | (Keys & ChannelInfo) | (Keys & Profile) | (Keys & IdAccess) | (Keys & SupplyMap) | (Keys & ChannelRegistry) | (Keys & MatchMap) | (Keys & Module) | (Keys & Chum) | (Keys & Person) | (Keys & Settings) | (Keys & DemandMap) | (MatchResponse & NotifiedUsers) | (MatchResponse & Group) | (MatchResponse & LocalInstancesList) | (MatchResponse & Instance) | (MatchResponse & Recipe) | (MatchResponse & ContactApp) | (MatchResponse & Access) | (MatchResponse & ChannelInfo) | (MatchResponse & Profile) | (MatchResponse & IdAccess) | (MatchResponse & SupplyMap) | (MatchResponse & ChannelRegistry) | (MatchResponse & MatchMap) | (MatchResponse & Module) | (MatchResponse & Chum) | (MatchResponse & Person) | (MatchResponse & Settings) | (MatchResponse & DemandMap) | (CreationTime & NotifiedUsers) | (CreationTime & Group) | (CreationTime & LocalInstancesList) | (CreationTime & Instance) | (CreationTime & Recipe) | (CreationTime & ContactApp) | (CreationTime & Access) | (CreationTime & ChannelInfo) | (CreationTime & Profile) | (CreationTime & IdAccess) | (CreationTime & SupplyMap) | (CreationTime & ChannelRegistry) | (CreationTime & MatchMap) | (CreationTime & Module) | (CreationTime & Chum) | (CreationTime & Person) | (CreationTime & Settings) | (CreationTime & DemandMap) | (WbcObservation & NotifiedUsers) | (WbcObservation & Group) | (WbcObservation & LocalInstancesList) | (WbcObservation & Instance) | (WbcObservation & Recipe) | (WbcObservation & ContactApp) | (WbcObservation & Access) | (WbcObservation & ChannelInfo) | (WbcObservation & Profile) | (WbcObservation & IdAccess) | (WbcObservation & SupplyMap) | (WbcObservation & ChannelRegistry) | (WbcObservation & MatchMap) | (WbcObservation & Module) | (WbcObservation & Chum) | (WbcObservation & Person) | (WbcObservation & Settings) | (WbcObservation & DemandMap) | (DocumentInfo & NotifiedUsers) | (DocumentInfo & Group) | (DocumentInfo & LocalInstancesList) | (DocumentInfo & Instance) | (DocumentInfo & Recipe) | (DocumentInfo & ContactApp) | (DocumentInfo & Access) | (DocumentInfo & ChannelInfo) | (DocumentInfo & Profile) | (DocumentInfo & IdAccess) | (DocumentInfo & SupplyMap) | (DocumentInfo & ChannelRegistry) | (DocumentInfo & MatchMap) | (DocumentInfo & Module) | (DocumentInfo & Chum) | (DocumentInfo & Person) | (DocumentInfo & Settings) | (DocumentInfo & DemandMap), SHA256Hash<HashTypes>[]>>}
     */
    public async getAllHashesByType(): Promise<
        Map<OneUnversionedObjectTypes & OneVersionedObjectTypes, SHA256Hash<HashTypes>[]>
    > {
        const typesMap: Map<
            OneUnversionedObjectTypes & OneVersionedObjectTypes,
            SHA256Hash<HashTypes>[]
        > = new Map<OneUnversionedObjectTypes & OneVersionedObjectTypes, SHA256Hash<HashTypes>[]>();

        const objectHashes: SHA256Hash<HashTypes>[] = await storage.listAllObjectHashes();
        await Promise.all(
            objectHashes.map(async (objectHash: SHA256Hash<HashTypes>) => {
                const type = (await storage.getFileType(objectHash)) as OneUnversionedObjectTypes &
                    OneVersionedObjectTypes;

                if (typesMap.get(type)) {
                    const hashes = typesMap.get(type);
                    if (hashes) {
                        hashes.push(objectHash);
                        typesMap.set(type, hashes);
                    } else {
                        typesMap.set(type, [objectHash]);
                    }
                } else {
                    typesMap.set(type, [objectHash]);
                }
            })
        );
        return typesMap;
    }

    /**
     *
     * @param {SHA256IdHash<T>} hash
     * @returns {Promise<VersionMapEntry<T>[]>}
     */
    public async getObjectVersionMap<T extends OneVersionedObjectTypes>(
        hash: SHA256IdHash<T>
    ): Promise<VersionMapEntry<T>[]> {
        return await storage.getAllVersionMapEntries(hash);
    }

    /**
     *
     * @param {string[]} bannedTypes
     * @returns {Promise<Map<SHA256IdHash<T>, VersionMapEntry<T>[]>>}
     */
    public async getAllVersionMapsByIdHash<T extends OneVersionedObjectTypes>(
        bannedTypes = ['*']
    ): Promise<Map<SHA256IdHash<T>, VersionMapEntry<T>[]>> {
        const idHashes: SHA256IdHash<T>[] = (await storage.listAllIdHashes()) as SHA256IdHash<T>[];
        const versionMapByIdHash: Map<SHA256IdHash<T>, VersionMapEntry<T>[]> = new Map<
            SHA256IdHash<T>,
            VersionMapEntry<T>[]
        >();
        await Promise.all(
            idHashes.map(async (idHash: SHA256IdHash<T>) => {
                const versionsList = await storage.getAllVersionMapEntries(idHash);
                if (!(bannedTypes[0] === '*' && bannedTypes.length === 1)) {
                    const object = await getObjectByIdHash(idHash);
                    if (bannedTypes.includes(object.obj.$type$)) {
                        versionMapByIdHash.set(idHash, versionsList);
                    }
                } else {
                    versionMapByIdHash.set(idHash, versionsList);
                }
            })
        );
        return versionMapByIdHash;
    }

    // ---------------------------------------- Private ----------------------------------------

    /**
     *
     * @param {string} givenPath
     * @returns {string}
     * @private
     */
    private getParentDirectoryFullPath(givenPath: string): string {
        const regex = new RegExp('/[^/]*$');
        let res = givenPath.replace(regex, '/');
        if (res !== '/') {
            return res.substring(0, res.length - 1);
        }
        return res;
    }

    /**
     * Updates the nodes above
     * @param {SHA256Hash<FilerDirectory>} outdatedCurrentDirectoryHash
     * @param {SHA256Hash<FilerDirectory>} updatedCurrentDirectoryHash
     * @returns {Promise<void>}
     * @private
     */
    private async updateParentDirectoryRecursive(
        outdatedCurrentDirectoryHash: SHA256Hash<FilerDirectory>,
        updatedCurrentDirectoryHash: SHA256Hash<FilerDirectory>
    ): Promise<void> {
        /** get the current directory **/
        const currentDirectory = await getObject(updatedCurrentDirectoryHash);

        /** get his parent path **/
        const parentPath = this.getParentDirectoryFullPath(currentDirectory.path);
        /** get his parent directory **/
        const currentDirectoryParent = await this.retrieveDirectory(parentPath);

        /** check if the parent directory exists**/
        if (currentDirectoryParent) {
            /** first, calculate the outdated parent hash **/
            const oldParentDirectoryHash = await calculateHashOfObj(currentDirectoryParent);
            /** locate the outdated current directory hash in the parent's children **/
            const indexOfOutdatedParentDirectory = currentDirectoryParent.children.findIndex(
                (childDirectoryHash: SHA256Hash<FilerDirectory>) =>
                    childDirectoryHash === outdatedCurrentDirectoryHash
            );
            if (indexOfOutdatedParentDirectory !== -1) {
                /** replace it with the updated current directory **/
                currentDirectoryParent.children[
                    indexOfOutdatedParentDirectory
                ] = updatedCurrentDirectoryHash;
            } else {
                /** otherwise just push it **/
                currentDirectoryParent.children.push(updatedCurrentDirectoryHash);
            }
            /** save the parent **/
            await createSingleObjectThroughPurePlan(
                {
                    module: '@one/identity',
                    versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
                },
                currentDirectoryParent
            );
            /** get the updated parent hash **/
            const updatedParentDirectoryHash = await calculateHashOfObj(currentDirectoryParent);
            /** update the nodes above **/

            if (currentDirectoryParent.path !== '/') {
                await this.updateParentDirectoryRecursive(
                    oldParentDirectoryHash,
                    updatedParentDirectoryHash
                );
            } else {
                /** update the channel with the updated root directory **/
                await this.channelManager.postToChannel(this.channelId, currentDirectoryParent);
            }
        }
    }

    /**
     * Consume files one-at-a-time
     * @param {SHA256Hash<FilerDirectory>} directoryHash
     */
    private async *iterateDirectories(
        directoryHash: SHA256Hash<FilerDirectory>
    ): AsyncGenerator<FilerDirectory> {
        const currentDirectory = await getObject(directoryHash);
        const childDirectories = currentDirectory.children;
        if (childDirectories.length > 0) {
            for (const dir of childDirectories) {
                yield currentDirectory;
                yield* this.iterateDirectories(dir);
            }
        } else {
            yield currentDirectory;
        }
    }

    /**
     *
     * @returns {Promise<void>}
     * @private
     */
    private async createRootDirectoryIfNotExists(): Promise<void> {
        const rootDirectory = await this.channelManager.getObjectsWithType('FilerDirectory', {
            channelId: this.channelId
        });
        if (rootDirectory.length === 0) {
            const root = await createSingleObjectThroughPurePlan({
                module: '@module/createRootFilerDirectory',
                versionMapPolicy: {'*': VERSION_UPDATES.NONE_IF_LATEST}
            });
            await this.channelManager.postToChannel(this.channelId, root.obj);
        }
    }

    /**
     * Handler function for the 'updated' event
     * @param {string} id
     * @return {Promise<void>}
     */
    private async handleOnUpdated(id: string): Promise<void> {
        if (id === this.channelId) {
            this.emit('updated');
        }
    }
}
