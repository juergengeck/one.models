import fs from 'fs';

// #### Configuration to be set by user ####

const oneCoreFolder = '../one.core';

// #### Implementation ####

const oneCoreLibSrcFolder = `${oneCoreFolder}/lib`;
const oneCoreLibDstFolder = `./node_modules/@refinio/one.core/lib`;

function recCopy(src, dst) {
    try {
        console.log(`Delete dst folder ${dst}`);
        fs.rmSync(dst, {recursive: true});
    } catch(_e) {
        // Error means that folder did not exist
    }
    console.log(`Copy src folder ${src} to dst folder ${dst}`);
    fs.cpSync(src, dst, {recursive: true});
}

let copyCore = true;

if (process.argv.length > 2) {
    copyCore = process.argv[2] === 'core';
}

if (copyCore) recCopy(oneCoreLibSrcFolder, oneCoreLibDstFolder);
