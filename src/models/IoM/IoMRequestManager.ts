import type {OneUnversionedObjectTypeNames, Person} from '@refinio/one.core/lib/recipes';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks';
import {
    createSingleObjectThroughPurePlan,
    onUnversionedObj,
    SET_ACCESS_MODE,
    UnversionedObjectResult
} from '@refinio/one.core/lib/storage';
import {affirm, affirmedBy} from '../../misc/Certificate';
import {
    getObjectByIdObj,
    storeVersionedObject
} from '@refinio/one.core/lib/storage-versioned-objects';
import type {OneUnversionedObjectInterfaces} from '@OneObjectInterfaces';
import type {IoMRequestsRegistry} from '../../recipes/IoM/IoMRequestsRegistry';
import type {IoMRequest} from '../../recipes/IoM/IoMRequest';
import {OEvent} from '../../misc/OEvent';
import type {AffirmationCertificate} from '../../recipes/CertificateRecipes';
import {createMessageBus} from '@refinio/one.core/lib/message-bus';
import type {Signature} from '../../recipes/SignatureRecipes';
const messageBus = createMessageBus('IoMRequestManager');

function isUnversionedObjectResultOfType<T extends OneUnversionedObjectTypeNames>(
    arg: UnversionedObjectResult,
    typeName: T
): arg is UnversionedObjectResult<OneUnversionedObjectInterfaces[T]> {
    return arg.obj.$type$ === typeName;
}

export default class IoMRequestManager {
    public onError = new OEvent<(message: any) => void>();
    public onNewRequest = new OEvent<
        (requestHash: SHA256Hash<IoMRequest>, request: IoMRequest) => void
    >();
    public onRequestUpdate = new OEvent<
        (requestHash: SHA256Hash<IoMRequest>, request: IoMRequest) => void
    >();
    public onRequestComplete = new OEvent<
        (requestHash: SHA256Hash<IoMRequest>, request: IoMRequest) => void
    >();
    private disconnectListener: (() => void) | null = null;
    private requestsRegistry: IoMRequestsRegistry = {
        $type$: 'IoMRequestsRegistry',
        appId: 'one.iom',
        requests: new Set()
    };
    private isInitialized = false;

    // ######## model state management ########

    public async init(): Promise<void> {
        messageBus.send('debug', 'init');
        this.disconnectListener = onUnversionedObj.addListener(result => {
            if (isUnversionedObjectResultOfType(result, 'IoMRequest')) {
                this.processNewIomRequest(result);
            }
            if (isUnversionedObjectResultOfType(result, 'Signature')) {
                this.processNewIoMRequestCertificate(result);
            }
        });

        // initialize the registry
        await this.initRegistry();

        this.isInitialized = true;
    }

    public async shutdown(): Promise<void> {
        messageBus.send('debug', 'shutdown');
        this.isInitialized = false;
        if (this.disconnectListener) {
            this.disconnectListener();
        }
        await this.shutdownRegistry();
    }

    // ######## requests management ########

    async createIoMRequest(participants: SHA256IdHash<Person>[]) {
        messageBus.send('debug', `createIoMReuqest ${JSON.stringify(participants)}`);
        const requestResult = await storeUnversionedObject({
            $type$: 'IoMRequest',
            timestamp: Date.now(),
            participants: new Set(participants)
        });

        messageBus.send(
            'log',
            `Create IoM Request ${requestResult.hash} with participants ${participants}`
        );

        await IoMRequestManager.affirmRequestObj(requestResult.hash, requestResult.obj);
    }

    async affirmRequest(requestHash: SHA256Hash<IoMRequest>) {
        messageBus.send('debug', `affirmRequest ${requestHash}`);
        await IoMRequestManager.affirmRequestObj(requestHash, await getObject(requestHash));
    }

    async allRequests(): Promise<
        {active: boolean; requestHash: SHA256Hash<IoMRequest>; request: IoMRequest}[]
    > {
        const requests = [];

        for (const requestHash of this.requestsRegistry.requests) {
            const request = await getObject(requestHash);
            requests.push({
                active: await IoMRequestManager.isRequestCompleted(requestHash, request),
                requestHash,
                request
            });
        }

        return requests;
    }

    // ######## Check completeness ########

    private static async isRequestCompleted(
        requestHash: SHA256Hash<IoMRequest>,
        request: IoMRequest
    ): Promise<boolean> {
        messageBus.send(
            'debug',
            `isRequestCompleted ${requestHash} ${JSON.stringify(request)} ${[
                ...request.participants
            ]}`
        );
        const affirmedByPersons = new Set(await affirmedBy(requestHash));
        messageBus.send(
            'debug',
            `isRequestCompleted - affirmed by ${requestHash} ${JSON.stringify([
                ...affirmedByPersons
            ])}`
        );

        // Check that the sets are equal
        if (affirmedByPersons.size !== request.participants.size) {
            messageBus.send(
                'debug',
                `isRequestCompleted - size mismatch ${requestHash} ${affirmedByPersons.size} !== ${request.participants.size}`
            );
            return false;
        }

        // Now check all the elements
        for (const participant of request.participants) {
            if (!affirmedByPersons.has(participant)) {
                messageBus.send(
                    'debug',
                    `isRequestCompleted - content mismatch ${requestHash} ${participant}`
                );
                return false;
            }
        }

        messageBus.send('debug', `isRequestCompleted - success ${requestHash}`);
        return true;
    }

    private async emitIfRequestCompleted(
        requestHash: SHA256Hash<IoMRequest>,
        request: IoMRequest
    ): Promise<void> {
        if (await IoMRequestManager.isRequestCompleted(requestHash, request)) {
            messageBus.send('log', `Request ${requestHash} was accepted by all participants.`);
            this.onRequestComplete.emit(requestHash, request);
        }
    }

    // ######## ObjectListener ########

    private async processNewIomRequest(result: UnversionedObjectResult<IoMRequest>) {
        messageBus.send('debug', `processNewIomRequest ${result.hash}`);
        this.requestsRegistry.requests.add(result.hash);
        await this.saveRegistry();
        this.onNewRequest.emit(result.hash, result.obj);
    }

    private async processNewIoMRequestCertificate(result: UnversionedObjectResult<Signature>) {
        messageBus.send('debug', `processNewIoMRequestCertificate ${result.hash}`);

        // Step 1: Load the certificate object (might be something else)
        const certificate = await getObject(result.obj.data);
        if (certificate.$type$ !== 'AffirmationCertificate') {
            return;
        }

        // Step 2: Load the request (might be something else)
        const request = await getObject(certificate.data);
        if (request.$type$ !== 'IoMRequest') {
            return;
        }

        // Step 3: Check if IoM request is fulfilled
        messageBus.send('debug', `processNewIoMRequestCertificate - isIomRequest ${result.hash}`);
        const requestHash = certificate.data as SHA256Hash<IoMRequest>;

        messageBus.send(
            'log',
            `Participant ${result.obj.issuer} affirmed IoM Request ${certificate.data}`
        );

        this.onRequestUpdate.emit(requestHash, request);
        await this.emitIfRequestCompleted(requestHash, request);
    }

    // ######## IoMRequestsRegistry ########

    private async initRegistry() {
        try {
            this.requestsRegistry = (
                await getObjectByIdObj({
                    $type$: 'IoMRequestsRegistry',
                    appId: 'one.iom'
                })
            ).obj;
        } catch (e) {
            // Ignore file not found error and just use the empty default IoMRequests. Persist
            // the empty registry.
            await this.saveRegistry();
        }
    }

    private async shutdownRegistry() {
        this.requestsRegistry = {
            $type$: 'IoMRequestsRegistry',
            appId: 'one.iom',
            requests: new Set()
        };
    }

    private async saveRegistry() {
        await storeVersionedObject(this.requestsRegistry);
    }

    // ######## Misc ########

    private assertInitialized() {
        if (!this.isInitialized) {
            throw new Error(
                'PersonNameCache: You cannot use any method of this class, because it is already shut down.'
            );
        }
    }

    private static async affirmRequestObj(
        requestHash: SHA256Hash<IoMRequest>,
        request: IoMRequest
    ) {
        messageBus.send('debug', `affirmRequestObj ${requestHash}`);

        // affirm the request
        const requestCertificateSignature = await affirm(requestHash);

        messageBus.send(
            'debug',
            `affirmRequestObj - requestHash ${requestHash}, signatureHash ${requestCertificateSignature.hash}`
        );

        // Share it with all the participants
        await createSingleObjectThroughPurePlan(
            {
                module: '@one/access'
            },
            [
                {
                    object: requestCertificateSignature.hash,
                    person: [...request.participants],
                    group: [],
                    mode: SET_ACCESS_MODE.REPLACE
                }
            ]
        );
    }
}
