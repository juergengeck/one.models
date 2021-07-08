'use strict';

const {promisify} = require('util');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const mkDir = promisify(fs.mkdir);
const jsesc = require('jsesc');

/**
 * @param {string} dir
 * @returns {Promise<unknown>}
 */
function mkDirExistOkay(dir) {
    return mkDir(dir, {recursive: true}).catch(err => {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    });
}

const BABEL_OPTS = {
    presets: [
        '@babel/preset-typescript'
        // 'minify'
    ],
    plugins: [
        [
            '@babel/plugin-transform-typescript',
            {
                strictMode: true
            }
        ],
        [
            '@babel/plugin-transform-modules-commonjs',
            {
                // We disallow default exports in ONE.core (eslint rule)
                noInterop: true
            }
        ],
        '@babel/proposal-class-properties',
        '@babel/proposal-object-rest-spread',
        '@babel/plugin-transform-runtime'
    ],
    comments: false,
    filename: ''
};

/**
 * @type {Record<string, string>}
 */
const modules = {};
let strConstantsStr = '';

const inputDirectory = path.join(__dirname, 'plans');
const outputDirectory = path.join(__dirname, 'src/generated');
const planModuleFiles = fs.readdirSync(inputDirectory);
const additionalOnePlanModules = path.join(outputDirectory, '/oneModules.ts');

/**
 * @param {string} file
 * @param {Record<string, string>} nameCodeMap
 * @param {string} inputDirectory
 * @returns {void}
 */
function addFileToNameCodeMap(file, nameCodeMap, inputDirectory) {
    const filePath = path.join(inputDirectory, file);
    const fileName = file.slice(0, -3);

    if (!filePath.endsWith('.ts')) {
        return;
    }

    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
        console.log('Building ' + file);
        const transCode = babel.transformFileSync(filePath, BABEL_OPTS);
        if (transCode === null) {
            throw new Error('Failure during Babel transform');
        }
        nameCodeMap[fileName] = jsesc(transCode.code);
    }
}

async function run() {
    await mkDirExistOkay(outputDirectory);

    for (const file of planModuleFiles) {
        if (file !== 'index.js') {
            addFileToNameCodeMap(file, modules, inputDirectory);
        }
    }

    let exportStr = 'const modules = {\n';

    for (const moduleName in modules) {
        if (Object.prototype.hasOwnProperty.call(modules, moduleName)) {
            strConstantsStr += 'const ' + moduleName + " = '" + modules[moduleName] + "';\n";
            exportStr += '    ' + moduleName + ',\n';
        }
    }

    exportStr = exportStr.slice(0, -2);
    exportStr += '\n} as const;\n\nexport default modules;\n\n';

    fs.writeFileSync(additionalOnePlanModules, strConstantsStr + '\n' + exportStr);
}

run().catch(e => {
    console.log(e);
    process.exit(-1);
});
