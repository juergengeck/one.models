#!/usr/bin/env node

/* eslint-disable no-console */

import {dirname} from 'path';
import {fileURLToPath} from 'url';
import {rm} from 'fs/promises';
import {execSync} from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
    console.log('########## one.models: Build ##########');

    console.log('=> Run tsc --build --clean');

    execSync('npx --no-install tsc --build --clean', {stdio: 'inherit'});

    console.log('=> Remove target folder "lib"');

    await rm('lib', {recursive: true, force: true});

    console.log('=> Remove tsc build cache files tsconfig.[src.|test.]tsbuildinfo');

    // The incremental build files can lead to unpredictable build issues for the full-build
    // run, possibly because the target directory is deleted first.
    await rm('tsconfig.tsbuildinfo', {force: true});
    await rm('tsconfig.src.tsbuildinfo', {force: true});
    await rm('tsconfig.test.tsbuildinfo', {force: true});

    console.log('=> Calling tsc --build...');

    execSync('npx --no-install tsc --build --force --verbose', {stdio: 'inherit'});

    console.log('########## one.models: End build ##########');
}

process.chdir(__dirname);

run().catch(err => {
    console.log(err.message);
    process.exit(1);
});
