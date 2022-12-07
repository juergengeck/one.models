import {readIdentityFile} from '../../misc/IdentityExchange-fs';
import {mkdir} from 'fs/promises';
import PasswordRecoveryClient from '../../misc/PasswordRecoveryService/PasswordRecoveryClient';
// @ts-ignore The getBaseDirName is only available for node.js. The next line shows an ts error,
// because the storage-base.d.ts file is generated from the system/storage-base.ts file and not
// from the system-nodejs/storage-base.ts
import {getBaseDirOrName, setBaseDirOrName} from '@refinio/one.core/lib/system/storage-base';

function parseCommandLine(argv: string[]): {
    secret: string;
    identity: string;
    identityFileName: string;
} {
    function getUsage() {
        return `usage: ${argv[0]} ${argv[1]} <secret> <identity> [identityFileName]`;
    }

    if (argv.length < 3 || argv.length > 5) {
        console.error(getUsage());
        process.exit(1);
    }

    const params = {
        secret: '',
        identity: '',
        identityFileName: 'pw.id.json'
    };

    if (argv[2] === '-h') {
        console.log(getUsage());
        process.exit(0);
    }

    params.secret = argv[2];
    params.identity = argv[3];

    if (argv.length === 5) {
        params.identityFileName = argv[4];
    }

    return params;
}

async function main(): Promise<void> {
    await setBaseDirOrName();
    await mkdir(getBaseDirOrName(), {recursive: true});
    const cmdArgs = parseCommandLine(process.argv);
    const identity = await readIdentityFile(cmdArgs.identityFileName);

    const client = new PasswordRecoveryClient(identity);
    await client.createAndStoreRecoveryInformation(cmdArgs.secret, cmdArgs.identity);
    await client.sendRecoveryInformationToServer();
}

main().catch(console.error);
