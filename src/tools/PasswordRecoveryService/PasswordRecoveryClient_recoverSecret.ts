import {mkdir} from 'fs/promises';
import PasswordRecoveryClient from '../../misc/PasswordRecoveryService/PasswordRecoveryClient';
// @ts-ignore The getBaseDirName is only available for node.js. The next line shows an ts error,
// because the storage-base.d.ts file is generated from the system/storage-base.ts file and not
// from the system-nodejs/storage-base.ts
import {getBaseDirOrName, setBaseDirOrName} from '@refinio/one.core/lib/system/storage-base';
import {generateNewIdentity} from '../../misc/IdentityExchange';

function parseCommandLine(argv: string[]): {
    symmetricKey: string;
} {
    function getUsage() {
        return `usage: ${argv[0]} ${argv[1]} <symmetrickey>`;
    }

    if (argv.length !== 3) {
        console.error(getUsage());
        process.exit(1);
    }

    const params = {
        symmetricKey: ''
    };

    if (argv[2] === '-h') {
        console.log(getUsage());
        process.exit(0);
    }

    params.symmetricKey = argv[2];
    return params;
}

async function main(): Promise<void> {
    await setBaseDirOrName();
    await mkdir(getBaseDirOrName(), {recursive: true});
    const cmdArgs = parseCommandLine(process.argv);

    // For restoring the secret we do not need the identity.
    const identity = await generateNewIdentity('http://dummy.invalid');
    const client = new PasswordRecoveryClient(identity.public);
    const secret = await client.recoverSecretAsString(cmdArgs.symmetricKey);
    console.log(`The recovered secret is: ${secret}`);
}

main().catch(console.error);
