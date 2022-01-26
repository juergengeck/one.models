import readline from 'readline';
import {
    createSingleObjectThroughPurePlan,
    VERSION_UPDATES,
    VersionedObjectResult
} from '@refinio/one.core/lib/storage';
import type {Module} from '@refinio/one.core/lib/recipes';

export async function waitForKeyPress(message = 'press a key to continue'): Promise<void> {
    await new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(message, answer => resolve(answer));
    });
}

/**
 * Import all plan modules
 */
export async function importModules(
    modules: Record<string, string>
): Promise<VersionedObjectResult<Module>[]> {
    const modulesList = Object.keys(modules).map(key => ({
        moduleName: key,
        code: modules[key as keyof typeof modules]
    }));

    return Promise.all(
        modulesList.map(module =>
            createSingleObjectThroughPurePlan(
                {
                    module: '@one/module-importer',
                    versionMapPolicy: {
                        '*': VERSION_UPDATES.NONE_IF_LATEST
                    }
                },
                module
            )
        )
    );
}
