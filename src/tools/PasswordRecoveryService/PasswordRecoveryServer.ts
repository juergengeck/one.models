import {readIdentityWithSecretsFile} from '../../misc/IdentityExchange-fs';
import PasswordRecoveryServer from '../../misc/PasswordRecoveryService/PasswordRecoveryServer';
import {mkdir, writeFile} from 'fs/promises';
import path from 'path';

function parseCommandLine(argv: string[]): {outputFolder: string; identityFileName: string} {
    function getUsage() {
        return `usage: ${argv[0]} ${argv[1]} [outputFolder] [identityFileName]`;
    }

    if (argv.length > 4) {
        console.error(getUsage());
        process.exit(1);
    }

    const params = {
        outputFolder: 'passwordRecoveryRequests',
        identityFileName: 'pw_secret.id.json'
    };

    if (argv.length >= 3) {
        params.outputFolder = argv[2];
        if (argv[2] === '-h') {
            console.log(getUsage());
            process.exit(0);
        }
    }

    if (argv.length >= 4) {
        params.identityFileName = argv[3];
    }

    return params;
}

async function main(): Promise<void> {
    const cmdArgs = parseCommandLine(process.argv);
    const identity = await readIdentityWithSecretsFile(cmdArgs.identityFileName);

    await mkdir(cmdArgs.outputFolder, {recursive: true});

    const server = new PasswordRecoveryServer(identity);
    server.onPasswordRecoveryRequest(request => {
        console.log('Received request');
        writeFile(path.join(cmdArgs.outputFolder, Date.now().toString()), JSON.stringify(request));
    });
    process.on('SIGINT', () => {
        server.stop();
    });
    await server.start();
}

main().catch(console.error);
