import CommunicationServer from '../CommunicationServer';
import * as Logger from 'one.core/lib/logger';
Logger.start();

const communicationServer = new CommunicationServer();
communicationServer.start('localhost', 8000).then(() => {
    if (process.send) {
        process.send('server started');
    }
});

process.on('SIGKILL', async () => {
    await communicationServer.stop();
});
