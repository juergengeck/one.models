'use strict';

/**
 * Module description
 *
 * @module ModuleName
 * @author Maximilian Wisgickl <wisigcklma@refinio.net>
 * @copyright REFINIO GmbH
 * @license SEE LICENSE IN LICENSE.md
 * @version 0.0.1
 */

/**
 * Libraries
 */
const {exec} = require('child_process');

/**
 * Code
 */

const main = () => {
    if (__dirname.includes('node_modules')) {
        // do nothing
        return;
    }

    const install = process.platform === 'win32' ? 'install.sh' : 'sh ./install.sh';

    exec(install, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
    });
};

main();
