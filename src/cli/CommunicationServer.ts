import yargs from 'yargs';
import CommunicationServer from '../misc/CommunicationServer';
import * as Logger from 'one.core/lib/logger';

/**
 * Main function. This exists to be able to use await here.
 */
async function main(): Promise<void> {
    const argv =
        // Evaluate
        yargs

            // Url of communication server
            .alias('h', 'host')
            .describe('h', 'host to bind the listening port to')
            .default('h', 'localhost')

            // Spare connections
            .alias('p', 'port')
            .describe('p', 'Port to listen on')
            .default('p', 8000)

            // Ping interval
            .describe('tp', 'Ping interval')
            .default('tp', 5000)

            // Logger
            .describe('l', 'Enable logger')
            .boolean('l')

            // Logger
            .describe('d', 'Enable logger (all)')
            .boolean('d').argv;

    if (argv.l) {
        Logger.start({types: ['log', 'debug']});
    }
    if (argv.d) {
        Logger.start();
    }

    const commServer = new CommunicationServer();
    await commServer.start(argv.h, argv.p);

    // Stop comm server at sigint
    process.on('SIGINT', () => {
        commServer.stop();
    });
}

// Execute main function
main().catch(e => {
    console.log('Error happened: ' + e.toString());
});
