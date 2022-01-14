import {writeRandomIdentityToFile} from './IdentityExchange-fs';

(async () => {
    if (process.argv.length != 3 && process.argv.length != 4) {
        console.error(`${process.argv[1]} <filename_prefix> <commserverurl>`);
    }

    const filenamePrefix = process.argv[2];
    const commServerUrl = process.argv.length < 4 ? 'ws://localhost:8000' : process.argv[3];
    const output = await writeRandomIdentityToFile(filenamePrefix, commServerUrl);
    console.log('Created files:');
    console.log(output.secretFileName);
    console.log(output.publicFileName);
})();
