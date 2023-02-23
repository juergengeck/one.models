#!/usr/bin/env node

'use strict';

/*
  eslint-disable
  global-require,
  no-await-in-loop,
  no-console,
  require-jsdoc,
  no-sync,
  jsdoc/valid-types,
  @typescript-eslint/explicit-function-return-type,
  @typescript-eslint/no-use-before-define,
  @typescript-eslint/no-var-requires,
  @typescript-eslint/no-unsafe-call
 */

/**
 * @file Build project files for node.js, React-Native or for browsers, and strip Flow type
 * annotations.
 */

const fs = require('fs');
const {basename, dirname, join, sep} = require('path');
const {execSync} = require('child_process');

const {access, chmod, mkdir, rmdir, readdir, readFile, writeFile, rename, unlink} = fs.promises;

const babel = require('@babel/core');

/**
 * @param {string} file
 * @returns {Promise<boolean>}
 */
async function fileExists(file) {
    return access(file, fs.constants.F_OK)
        .then(() => true)
        .catch(err => {
            if (err.code === 'ENOENT') {
                return false;
            }

            throw err;
        });
}

/** @type {Record<string, string[]>} */
const PLATFORMS = {
    nodejs: ['commonjs', 'es2015'],
    browser: ['es2015'],
    rn: ['es2015']
};

/**
 * One of them will be added to the BABEL_OPTS.plugin array
 * @type {{systemjs: string, commonjs: *[], umd: string}}
 */
const BABEL_MODULE_TARGETS = {
    // See https://babeljs.io/docs/en/next/babel-plugin-transform-modules-commonjs.html
    commonjs: [
        '@babel/plugin-transform-modules-commonjs',
        {
            noInterop: false
        }
    ],
    // See https://babeljs.io/docs/en/next/babel-plugin-transform-modules-systemjs.html
    systemjs: '@babel/plugin-transform-modules-systemjs',
    // See https://babeljs.io/docs/en/next/babel-plugin-transform-modules-umd.html
    umd: '@babel/plugin-transform-modules-umd'
};

const BABEL_OPTS = {
    presets: [
        '@babel/preset-typescript'
        // 'minify'
    ],
    sourceMap: true,
    plugins: [
        [
            '@babel/plugin-transform-typescript',
            {
                strictMode: true
            }
        ],
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-proposal-nullish-coalescing-operator',
        '@babel/plugin-proposal-object-rest-spread',
        '@babel/plugin-proposal-optional-chaining',
        '@babel/plugin-transform-runtime'
    ],
    comments: false,
    filename: ''
};

/**
 * @param {unknown} thing
 * @returns {thing is Record<string, any>}
 */
function isObject(thing) {
    return typeof thing === 'object' && thing !== null;
}

/**
 * @param {string} s
 * @returns {s is 'nodejs'|'browser'|'rn'}
 */
function isValidPlatformString(s) {
    return s === 'nodejs' || s === 'browser' || s === 'rn';
}

/**
 * @returns {void}
 */
function usage() {
    console.log(`
Usage: node build.js or directly call ./build.js

Options: [h | help | -h | --help]
         [node|browser|rn|low|moddable]
         [-m es2015|commonjs|systemjs|umd]
         [-t target directory]
         [-f script.ts]

Options:

  Platform target:

  nodejs     Build for node.js
  browser    Build for webbrowsers
  rn         Build for React Native

  The target can also be given in package.json's refinio.platform.
  All package.json starting from the current project root to the highest
  (root) directory are searched for refinio.platform. The highest pakage.json
  that contains this setting is used.
  Specifying a target platform as command line argument takes precedence.
  If no platform is provided "nodejs" will be the default.

  -m Choose the target module system. Default is CommonJS. Other options are ES2015,
     SystemJS and UMD (all names need to be without any capitalization).

  -t target directory Default is ./lib/

  The -f option is for processing source files individually, usually by a watcher process:

  -f relative/path/script.ts

  Example for how to use it to build for the "node.js" target in a WebStorm watcher process that
  watches source files for changes and calls build.js when it detects a change:

  Program:   build.js
  Arguments: -f $/FilePathRelativeToProjectRoot$ node
  File Type: "Javascript"
  Scope: "Current File" (with any scope that contains more than one file build.js will be
         called for every file in that scope, even if only one file changed)
    `);
}

/**
 * @param {string} dir
 * @returns {Promise<void|string>}
 */
function mkDirExistOkay(dir) {
    return mkdir(dir, {recursive: true}).catch(err => {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    });
}

/**
 * @param {string} dir
 * @param {fs.Dirent} dirent - A node.js `Dirent` object
 * @returns {Promise<void>}
 */
async function deleteFile(dir, dirent) {
    const filePath = join(dir, dirent.name);

    if (dirent.isDirectory()) {
        return deleteDirectory(filePath);
    } else {
        return unlink(filePath);
    }
}

/**
 * @param {string} dir
 * @returns {Promise<void>}
 */
async function deleteDirectory(dir) {
    /** @type fs.Dirent[] */
    let files;

    try {
        files = await readdir(dir, {withFileTypes: true});
    } catch (/** @type any */ err) {
        if (err.code === 'ENOENT') {
            // Nothing to remove? That's okay!
            return;
        } else {
            throw err;
        }
    }

    await Promise.all(files.map(dirent => deleteFile(dir, dirent)));

    await rmdir(dir);
}

/**
 * @param {string} code
 * @param {object} options - See https://babeljs.io/docs/en/options
 * @returns {Promise<{code:string, map:any}>} Returns the transformed code string
 */
function transform(code, options) {
    return new Promise((resolve, reject) => {
        // See https://babeljs.io/docs/en/babel-core
        // result: {code, map, ast}
        babel.transform(code, options, (err, result) => {
            if (err) {
                return reject(err);
            }

            if (result === null) {
                return reject(new Error('transform() result is null'));
            }

            if (result.code === undefined || result.code === null) {
                return reject(new Error('transform() result.code is null'));
            }

            if (result.map === undefined || result.map === null) {
                return reject(new Error('transform() result.code is null'));
            }

            return resolve({
                code: result.code.replace(/(\nimport [^"']+["'])([^"']+).[tj]s(["'];)/gm, '$1$2$3'),
                map: result.map
            });
        });
    });
}

/**
 * @param {string} targetDir - Where to write the transpiled file to
 * @param {string} srcDir - Directory relative to PROJECT_ROOT
 * @param {string} file - The filename without path
 * @param {string} system - nodejs, browser, rn
 * @param {string} moduleTarget - commonjs, es2015, systemjs, umd
 * @returns {Promise<void>}
 */
async function transformAndWriteJsFile(targetDir, srcDir, file, system, moduleTarget) {
    if (!file.endsWith('.ts')) {
        return;
    }

    const code = await readFile(join(__dirname, srcDir, file), 'utf8');

    if (!code) {
        return console.warn(`WARNING: empty file ${file}`);
    }

    await mkDirExistOkay(targetDir);

    const destination = join(targetDir, file.replace(/\.ts$/, ''));

    if (file.endsWith('.d.ts')) {
        if (targetDir === 'test') {
            return;
        }

        console.log(`Copying file ${join(srcDir, file)} ⇒ ${destination}.ts`);
        await writeFile(destination + '.ts', code, {flag: 'w'});
    } else {
        BABEL_OPTS.filename = file;

        const fileExtension =
            targetDir !== 'test' && system === 'nodejs' && moduleTarget === 'es2015'
                ? '.mjs'
                : '.js';

        console.log(`Processing file ${join(srcDir, file)} ⇒ ${destination}${fileExtension}`);

        const transformedCode = await transform(code, BABEL_OPTS);
        transformedCode.code += `\n//# sourceMappingURL=${file.replace(/\.ts$/, '')}.js.map`;
        await writeFile(destination + fileExtension, transformedCode.code, {flag: 'w'});

        transformedCode.map.sources[0] = `../${srcDir}/` + transformedCode.map.sources[0];
        await writeFile(destination + '.js.map', JSON.stringify(transformedCode.map), {
            flag: 'w'
        });

        if (destination.endsWith(join('tools', file.replace(/\.ts$/, '')))) {
            await chmod(destination + fileExtension, '755');
        }
    }
}

/**
 * @param {string} srcDir
 * @param {string} targetDir
 * @param {string} system
 * @param {string} moduleTarget - One of commonjs, es2015, systemjs, umd
 * @returns {Promise<void>}
 */
async function processAllFiles(srcDir, targetDir, system, moduleTarget) {
    console.log(`=> Processing directory ${srcDir}...`);

    const files = await readdir(join(__dirname, srcDir));

    for (const file of files) {
        const stats = fs.statSync(join(srcDir, file));

        if (stats.isDirectory()) {
            await processAllFiles(join(srcDir, file), join(targetDir, file), system, moduleTarget);
        } else {
            await transformAndWriteJsFile(targetDir, srcDir, file, system, moduleTarget);
        }
    }
}

/**
 * @param {string} targetDir
 * @returns {Promise<boolean>}
 */
async function createDeclarationFiles(targetDir) {
    let failed = false;

    for (const dir of ['src', 'test']) {
        console.log(`Calling tsc for ${dir} to create declaration and map files...`);

        // The incremental build files can lead to unpredictable build issues for the full-build
        // run, possibly because the target directory is deleted first.
        try {
            await unlink(join('.', `tsconfig.${dir}.tsbuildinfo`));
        } catch (/** @type any */ err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }

        try {
            execSync(
                `npx --no-install tsc -p ${dir}/tsconfig.json --outDir ` +
                    (dir === 'test' ? 'test' : targetDir),
                {
                    stdio: 'inherit'
                }
            );
        } catch (/** @type any */ err) {
            failed = true;
            console.error(
                '\ntsc failed with ' +
                    err.message +
                    '   ERRORS CAN BE IGNORED if the declaration files were created.\n'
            );
        }
    }

    return failed;
}

/**
 * @param {string} dir
 * @returns {Promise<Record<string, any>|undefined>}
 */
async function readPkgJsonRefinio(dir) {
    const file = join(dir, 'package.json');

    try {
        const pJson = await readFile(file, 'utf8');
        const pkgJson = JSON.parse(pJson);
        return isObject(pkgJson) && isObject(pkgJson.refinio) ? pkgJson.refinio : undefined;
    } catch (_err) {
        // It is not a task of this build script to check for errors in package.json, and not
        // finding the file is not an error to begin with.
        return {};
    }
}

/**
 * Iterate directories starting with the project directory and then upwards all the was to "/".
 * Check for a `package.json` file. Check for `refinio.platform` (string property). Remember the
 * last find. Sop iterating at the top and return the last find or undefined.
 * @returns {Promise<string|undefined>}
 */
async function findHighestPkgJsonRefinioPlatform() {
    /** @type {('nodejs' | 'browser' | 'rn' | undefined)} */
    let system;
    let dir = __dirname;
    let prevDir = '';

    while (dir !== prevDir) {
        const refinio = await readPkgJsonRefinio(dir);

        if (isObject(refinio)) {
            if (isValidPlatformString(refinio.platform)) {
                system = refinio.platform;
                console.log(
                    `Found refinio.platform "${refinio.platform}" in ${join(dir, 'package.json')}`
                );
            } else {
                console.log(
                    `Invalid refinio.platform "${refinio.platform}" in ${join(dir, 'package.json')}`
                );
            }
        }

        prevDir = dir;
        dir = join(dir, '..');
    }

    return system;
}

/**
 * The target platform. This determines which src/system-* folder is used and becomes
 * targetDir/system/
 * @returns {Promise<string>}
 */
async function getSystem() {
    let system;

    if (process.argv.includes('nodejs')) {
        system = 'nodejs';
    } else if (process.argv.includes('browser')) {
        system = 'browser';
    } else if (process.argv.includes('rn') || process.argv.includes('react-native')) {
        system = 'rn';
    } else {
        system = (await findHighestPkgJsonRefinioPlatform()) || 'nodejs';
    }

    return system;
}

/**
 * If "-m" option is found a target system is set, otherwise the default of "commonjs" is used.
 * GLOBAL SIDE EFFECT: Possibly mutates BABEL_OPTS
 * @returns {string}
 */
function setModuleTarget() {
    const mIndex = process.argv.findIndex(arg => arg.startsWith('-m'));

    const moduleTarget = mIndex >= 0 ? process.argv[mIndex + 1].toLocaleLowerCase() : 'commonjs';

    switch (moduleTarget) {
        case 'es2015':
            break;

        case 'commonjs':
        case 'systemjs':
        case 'umd':
            // @ts-ignore
            BABEL_OPTS.plugins.push(BABEL_MODULE_TARGETS[moduleTarget]);
            break;

        default:
            throw new Error(
                'Option -m detected but no valid module system string (see usage with -h)'
            );
    }

    return moduleTarget;
}

/**
 * If "-t" option is found a target directory is set, otherwise the default of "lib" is used.
 * @returns {string}
 */
function getTargetDir() {
    const tIndex = process.argv.findIndex(arg => arg.startsWith('-t'));

    if (tIndex >= 0) {
        const targetDir = process.argv[tIndex + 1];

        if (targetDir === undefined) {
            throw new Error('Option -t detected but no target directory');
        }

        return targetDir;
    }

    return 'lib';
}

/**
 * Called e.g. by a watcher process for a single file? If so option "-f filename" will be found.
 * @returns {string} Returns the filename or an empty string if no "-f" option was detected
 */
function calledForSingleFile() {
    const fIndex = process.argv.findIndex(arg => arg.startsWith('-f'));

    if (fIndex >= 0) {
        const file = process.argv[fIndex + 1];

        if (file === undefined) {
            throw new Error('Option -f detected but no filename');
        }

        return file;
    }

    return '';
}

/**
 * @returns {Promise<void>}
 */
async function run() {
    // Package installation: There is no src/ but there already is a lib/
    if (!(await fileExists('src')) && (await fileExists('lib'))) {
        console.log('install.js @refinio/one.models: DO NOTHING');
        return;
    }

    const system = await getSystem();
    const targetDir = getTargetDir();
    const moduleTarget = setModuleTarget(); // Call with side effect
    const singleFile = calledForSingleFile();

    if (singleFile !== '') {
        let destination = join(targetDir, dirname(singleFile).replace(/^src[\\/]?/, ''));

        if (singleFile.startsWith('test' + sep)) {
            destination = destination.replace('lib' + sep, '');
        }

        return transformAndWriteJsFile(
            destination,
            dirname(singleFile),
            basename(singleFile),
            system,
            moduleTarget
        );
    }

    console.log(`\n========== Begin building one.models (${moduleTarget}/${system}) ==========`);

    await deleteDirectory(targetDir);
    await processAllFiles('src', targetDir, system, moduleTarget);
    const failed = await createDeclarationFiles(targetDir);
    await processAllFiles('test', 'test', system, moduleTarget);

    console.log(`========== Done building one.models (${moduleTarget}/${system}) ==========\n`);

    // Only fail on nodejs - browser still has some errors because of node specific code in
    // tests and other files
    if (failed && system === 'nodejs') {
        throw new Error(
            'Tsc failed for at least one source file. Look at the console output for' +
                ' further information.'
        );
    }
}

/**
 * @returns {void}
 */
function runBuilForAllTargets() {
    for (const platform of Object.keys(PLATFORMS)) {
        for (const moduleSystem of PLATFORMS[platform]) {
            execSync(
                `node ./build.js ${platform} -t ${join(
                    'builds',
                    platform
                )}.${moduleSystem} -m ${moduleSystem}`,
                {stdio: 'inherit'}
            );
        }
    }
}

if (
    process.argv.includes('h') ||
    process.argv.includes('-h') ||
    process.argv.includes('help') ||
    process.argv.includes('--help')
) {
    usage();
    process.exit(0);
}

if (process.argv.includes('ALL')) {
    runBuilForAllTargets();
} else {
    run().catch(err => {
        console.log(err.message);
        process.exit(1);
    });
}
