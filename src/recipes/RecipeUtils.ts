import type {RecipeRule} from 'one.core/lib/recipes';

// ######## Modifying functions ########

/**
 * Clones the whole rule array.
 *
 * If you want to develop a rule based on another one you have to clone
 * the whole rule tree, otherwise you will also alter the original rule.
 *
 * This deep clones all the rule RecipeRule objects and the RecipeRule
 * arrays (only the rule children of a RecipeRule)
 *
 * @param rules - The rule array to deep copy
 */
export function cloneRule(rules: RecipeRule[]): RecipeRule[] {
    const clonedRules: RecipeRule[] = [];
    for (const rule of rules) {
        const newRule = {...rule};
        if (newRule.rule) {
            newRule.rule = cloneRule(newRule.rule);
        }
        clonedRules.push(newRule);
    }
    return clonedRules;
}

/**
 * Add a rule to rule array.
 *
 * @param rules - The rule array to modify
 * @param path - Dot separated path to the parent rule whose rule array shall be altered
 * @param rule - The rule to add.
 * @throws Error when a rule at the specified path already exists.
 */
export function addRule(rules: RecipeRule[], path: string, rule: RecipeRule): void {
    const completePath = [path, rule.itemprop].join('.');
    if (hasRule(rules, completePath)) {
        throw new Error(`addRule: A rule ${completePath} already exists.`);
    }
    const pickedRules = getRuleRules(rules, path);
    pickedRules.push(rule);
}

/**
 * This overwrites an existing rule.
 *
 * @param rules - The rule array to modify
 * @param path - Dot separated path to the parent rule whose rule array shall be altered
 * @param rule - The rule to add.
 * @throws Error when the rule at the specified path does not exist.
 */
export function overwriteRule(rules: RecipeRule[], path: string, rule: RecipeRule): void {
    const completePath = [path, rule.itemprop].join('.');

    if (!hasRule(rules, completePath)) {
        throw new Error(`overwriteRule: A rule ${completePath} does not exist.`);
    }
    removeRule(rules, completePath);
    addRule(rules, path, rule);
}

/**
 * Remove a rule from a rule array.
 *
 * @param rules - The rule array to modify
 * @param path - Dot separated path to the rule that should be removed.
 * @throws Error when the rule at the specified path does not exist.
 */
export function removeRule(rules: RecipeRule[], path: string): void {
    if (!hasRule(rules, path)) {
        throw new Error(`removeRule: A rule '${path}' does not exist.`);
    }

    const pathStack = path.split('.');
    const pickedRules = getRuleRules(rules, pathStack.slice(0, -1).join('.'));
    const index = pickedRules.findIndex(rule => rule.itemprop === pathStack[pathStack.length - 1]);
    if (index === -1) {
        throw new Error(`removeRule: A rule '${path}' does not exist.`);
    }
    pickedRules.splice(index, 1);
}

// ######## GETTERS ########

/**
 * Returns the RecipeRule object that is stored at the given path.
 *
 * @param rules - The rule array to query
 * @param path - Dot separated path to the rule that should be obtained.
 * @throws Error If no rule exists for the given path.
 */
export function getRule(rules: RecipeRule[], path: string): RecipeRule {
    const pathStack = path.split('.');
    const foundRule = rules.find(rule => rule.itemprop === pathStack[0]);
    if (!foundRule) {
        throw new Error(`Did not find the requested rule '${path}'`);
    }

    // If we just have a single element in the pathStack, we return it.
    if (pathStack.length === 1) {
        return foundRule;
    }

    // If the path stack has more than one element we assume that
    // the picked rule itself has a rule as child. So we follow that
    if (!foundRule.rule) {
        throw new Error('Rule element does not have a nested rule.');
    }

    // Get the rule of the child
    return getRule(foundRule.rule, pathStack.slice(1).join('.'));
}

/**
 * Check if the specified rule exists.
 *
 * @param rules - The rule array to query
 * @param path - Dot separated path to the rule to check
 */
export function hasRule(rules: RecipeRule[], path: string): boolean {
    const pathStack = path.split('.');
    const foundRule = rules.find(rule => rule.itemprop === pathStack[0]);
    if (!foundRule) {
        return false;
    }

    // If we just have a single element in the pathStack, we return it.
    if (pathStack.length === 1) {
        return true;
    }

    // If the path stack has more than one element we assume that
    // the picked rule itself has a rule as child. So we follow that
    if (!foundRule.rule) {
        return false;
    }

    // Get the rule of the child
    return hasRule(foundRule.rule, pathStack.slice(1).join('.'));
}

/**
 * Returns the .rule array of the RecipeRule object that is stored at the given path.
 *
 * This is almost the same as getRecipeRule, except that it returns the 'rule' child
 * of the found RecipeRule. This is a convenience function, so that you don't have to
 * check the existence of the 'rules' child when you query it.
 *
 * @param rules - The rule array to query
 * @param path - Dot separated path to the rule to query
 * @throws Error If no rule exists for the given path or the found rule does not have child rules.
 */
export function getRuleRules(rules: RecipeRule[], path: string): RecipeRule[] {
    if (path === '') {
        return rules;
    }

    const rule = getRule(rules, path);
    if (!rule.rule) {
        throw new Error('Rule element does not have a nested rule.');
    }

    return rule.rule;
}
