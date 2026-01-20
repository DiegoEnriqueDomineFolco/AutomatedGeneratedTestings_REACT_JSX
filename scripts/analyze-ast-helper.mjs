// scripts/analyze-ast-helper.mjs
// Central AST helpers for pattern detection and extraction
// Modularized for DRY and reuse

/**
 * Helpers for pattern detection and extraction in AST
 */

// babel imports
import traverseModule from "@babel/traverse";
const traverse = typeof traverseModule === "function" ? traverseModule : traverseModule.default;

// import helpers & constants
import {
    CORE_HOOKS,
    EVENT_HANDLER_REGEX,
    API_CALLS,
    SUPABASE_METHODS,
    MEMOIZATION,
    ERROR_HANDLING,
    CONDITIONAL_RENDERING,
    extractPropsFromParams,
    getJSXElementName,
    isCustomHook,
    isEventHandler,
    isApiCall,
    isMemoization,
    isConditionalRendering,
    isErrorHandling,
    getMainComponentName,
    isDeclarationNode
} from "./ast-helpers.mjs";

//logging helper
import { writeLog } from "./generate/utils.mjs";

/***********************************************************************
 * Main function to analyze AST and extract relevant patterns
 */

// filename is optional, but if provided it helps with component name fallbacks
export function analyzeASTHelper(ast, filename = "") {
    const comments = findCommentsAndDocblocks(ast);
    const importedComponents = findImportedComponents(ast);
    const customHooks = findCustomHooks(ast);
    const memoization = findMemoization(ast);
    const propTypes = findPropTypes(ast);
    const stateVars = findStateVariables(ast);
    const effectDeps = findEffectDependencies(ast);
    const returnedJSX = findReturnedJSX(ast);
    const eventHandlers = findEventHandlers(ast);
    const apiCalls = findApiCalls(ast);
    const errorHandling = findErrorHandling(ast);
    const conditionalRendering = findConditionalRendering(ast);
    const mainComponent = findMainComponent(ast, filename);
    const hooks = findHooks(ast);
    // writeLog(`[analyzeASTHelper] hooks: ${JSON.stringify(hooks)}`, 'analyze-ast-helper.log');
    const jsxElements = findJSXElements(ast);
    const variables = findVariables(ast);
    // writeLog(`[analyzeASTHelper] variables: ${JSON.stringify(variables)}`, 'analyze-ast-helper.log');
    const internalFunctions = findInternalFunctions(ast);
    const imports = findImports(ast);
    // writeLog(`[analyzeASTHelper] imports: ${JSON.stringify(imports)}`, 'analyze-ast-helper.log');

    // Detect accessed keys in params (result of useParams)
    // findParamsKeys internally validates if applicable
    const paramsKeys = findParamsKeys(ast);
    // Extract possible example values for props
    const propValueHints = findPropValueHints(ast);
    // Extract props and propagate hints
    const props = findProps(ast, propValueHints);
    const branches = findBranches(ast);
    const usedVariablesInFunction = getUsedVariablesInFunction(mainComponent);
    const { missingDeps, unusedDeps, mutableDeps } = compareHookDependencies(usedVariablesInFunction, effectDeps);
    const inlineFunctionsInJSX = findInlineFunctionsInJSX(ast);
    const expensiveCalculationsInJSX = findExpensiveCalculationsInJSX(ast);

    // NEW: Detected contexts
    const { contexts, contextDefaultValues } = findContexts(ast, imports);

    let resultados = {
        comments,
        importedComponents,
        customHooks,
        memoization,
        propTypes,
        stateVars,
        effectDeps,
        returnedJSX,
        eventHandlers,
        apiCalls,
        errorHandling,
        conditionalRendering,
        mainComponent, // <--- now is the main one
        hooks,
        jsxElements,
        variables,
        internalFunctions,
        imports,
        props,
        branches,
        usedVariablesInFunction,
        hooksDependences: {
            missingDeps,
            unusedDeps,
            mutableDeps
        },
        inlineFunctionsInJSX,
        expensiveCalculationsInJSX,
        propValueHints,
        contexts,
        contextDefaultValues,
        paramsKeys, // <-- Propagate accessed keys from params
    };

    // writeLog(false, `analyzeASTHelper resultados: ${JSON.stringify(resultados, null, 2)}`, 'analyze-ast-helper.log');
    return resultados;
}


/*********************************************************************
 * All helper sub-functions for specific pattern detections are below
 * Each sub-function uses Babel traverse to walk the AST and extract info
 */

/**
 * Finds the "main component" of the file.
 * 1. Tries export default (findExportDefault)
 * 2. If not found, looks for the first named export that is a function, arrow function, or class
 *    (prioritizes names with Provider, Context, etc.)
 */
function findMainComponent(ast, fileName = "") {
    // 1. Try export default
    const exportDefault = findExportDefault(ast, fileName);
    if (exportDefault) return exportDefault;

    // 2. Look for named exports that are functions, arrows, or classes
    let candidates = [];
    traverse(ast, {
        ExportNamedDeclaration(path) {
            const decl = path.node.declaration;
            if (!decl) return;
            // export function Name() { ... }
            if (decl.type === "FunctionDeclaration") {
                candidates.push({
                    type: "function",
                    name: decl.id?.name,
                    params: decl.params?.map(p => p.name),
                    loc: decl.loc
                });
            }
            // export class Name { ... }
            if (decl.type === "ClassDeclaration") {
                candidates.push({
                    type: "class",
                    name: decl.id?.name,
                    loc: decl.loc
                });
            }
            // export const Name = ...
            if (decl.type === "VariableDeclaration") {
                decl.declarations.forEach(d => {
                    if (
                        d.init &&
                        (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")
                    ) {
                        candidates.push({
                            type: d.init.type === "ArrowFunctionExpression" ? "arrow" : "function",
                            name: d.id?.name,
                            params: d.init.params?.map(p => p.name),
                            loc: d.loc || d.init.loc
                        });
                    }
                });
            }
        }
    });

    // Heurística: priorizar Provider, Context, luego el primero
    let main = candidates.find(c => /Provider|Context/i.test(c.name));
    if (!main && candidates.length) main = candidates[0];
    if (main) return main;

    // Fallback: usar el nombre del archivo
    if (typeof fileName === "string" && fileName.length > 0) {
        const base = fileName.split("/").pop()?.split(".")[0];
        if (base) return { type: "unknown", name: base };
    }
    // Fallback final
    return { type: "unknown", name: "Component" };
}

/***********************************************************************
 * Detection of contexts (hooks and providers)
 * Returns an array of objects with info about each used context
 */
function findNamedExports(ast) {
    // Returns an array of names exported as named exports
    const namedExports = new Set();
    traverse(ast, {
        ExportNamedDeclaration(path) {
            const decl = path.node.declaration;
            if (decl) {
                if (decl.type === "VariableDeclaration") {
                    decl.declarations.forEach(d => {
                        if (d.id && d.id.name) namedExports.add(d.id.name);
                    });
                } else if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
                    if (decl.id && decl.id.name) namedExports.add(decl.id.name);
                }
            }
            // Also supports: export { Foo, Bar };
            if (path.node.specifiers) {
                path.node.specifiers.forEach(spec => {
                    if (spec.exported && spec.exported.name) namedExports.add(spec.exported.name);
                });
            }
        }
    });
    // writeLog(true, `[findNamedExports] namedExports: ${JSON.stringify(Array.from(namedExports), null, 2)}`, 'analyze-ast-helper.log');
    return namedExports;
}

function findContexts(ast, imports = []) {
    const contexts = [];
    // Map of imports: { localName: importSource }
    const importMap = {};
    if (Array.isArray(imports)) {
        imports.forEach(imp => {
            if (Array.isArray(imp.specifiers)) {
                imp.specifiers.forEach(name => {
                    importMap[name] = imp.source;
                });
            }
        });
        // writeLog(true, `[findContexts] importMap: ${JSON.stringify(importMap, null, 2)}`, 'analyze-ast-helper.log');
    }

    // Detect named exports
    const namedExports = findNamedExports(ast);
    // writeLog(true, `[findContexts] namedExports: ${JSON.stringify(Array.from(namedExports), null, 2)}`, 'analyze-ast-helper.log');

    // Look for createContext to extract valueShape and mark real contexts
    const contextDefaultValues = {};
    const realContexts = [];
    traverse(ast, {
        VariableDeclarator(path) {
            // Example: const DataExportContext = createContext(defaultValue)
            if (
                path.node.init &&
                path.node.init.type === "CallExpression" &&
                path.node.init.callee.name === "createContext"
            ) {
                const contextName = path.node.id.name;
                let valueShape = undefined;
                if (path.node.init.arguments.length > 0) {
                    const arg = path.node.init.arguments[0];
                    // Only support literals and simple objects/arrays for now
                    if (arg.type === "ObjectExpression") {
                        valueShape = {};
                        arg.properties.forEach(prop => {
                            if (prop.key && prop.value) {
                                valueShape[prop.key.name || prop.key.value] = prop.value.value !== undefined ? prop.value.value : null;
                            }
                        });
                    } else if (arg.type === "ArrayExpression") {
                        valueShape = [];
                    } else if (arg.type === "Literal" || arg.type === "StringLiteral" || arg.type === "NumericLiteral" || arg.type === "BooleanLiteral") {
                        valueShape = arg.value;
                    }
                }
                contextDefaultValues[contextName] = valueShape;
                // Mark as real context (provider)
                realContexts.push({
                    name: contextName,
                    importSource: importMap[contextName],
                    path: importMap[contextName],
                    isHook: false,
                    isProvider: true,
                    valueShape,
                    loc: path.node.loc,
                    created: true,
                    isExported: namedExports.has(contextName)
                });
            }
        }
    });

    // Look for custom hooks (useXxx, useAppContext, etc)
    traverse(ast, {
        CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type === "Identifier" && /^use[A-Z]/.test(callee.name)) {
                // Look for destructuring
                let usedProperties = [];
                if (
                    path.parent.type === "VariableDeclarator" &&
                    path.parent.id.type === "ObjectPattern"
                ) {
                    usedProperties = path.parent.id.properties.map(p => p.key.name);
                }
                const importPath = importMap[callee.name];
                // Only add if NOT a real context
                if (!realContexts.some(ctx => ctx.name === callee.name)) {
                    contexts.push({
                        name: callee.name,
                        importSource: importPath,
                        path: importPath,
                        usedProperties,
                        isHook: true,
                        isProvider: false,
                        valueShape: contextDefaultValues[callee.name],
                        loc: path.node.loc,
                        isExported: namedExports.has(callee.name)
                    });
                }
            }
        },
        // Look for context providers (<XxxProvider>)
        JSXOpeningElement(path) {
            const name = path.node.name.name;
            if (name && name.endsWith("Provider")) {
                const importPath = importMap[name];
                // Associate with real context if exists
                const realCtx = realContexts.find(ctx => name.startsWith(ctx.name));
                contexts.push({
                    name,
                    importSource: importPath,
                    path: importPath,
                    isHook: false,
                    isProvider: true,
                    valueShape: realCtx ? realCtx.valueShape : contextDefaultValues[name],
                    loc: path.node.loc,
                    isExported: namedExports.has(name)
                });
            }
        }
    });
    // Add all real contexts (providers) detected by createContext
    realContexts.forEach(ctx => {
        // Check if already exists in contexts (by name and isProvider)
        const alreadyPresent = contexts.some(c => c.name === ctx.name && c.isProvider);
        if (!alreadyPresent) {
            contexts.push(ctx);
        }
    });

    // Audit log: show contextDefaultValues and contexts
    // writeLog(true, `[findContexts] contexts: ${JSON.stringify(contexts, null, 2)}`, 'analyze-ast-helper.log');
    // writeLog(true, `[findContexts] contextDefaultValues: ${JSON.stringify(contextDefaultValues, null, 2)}`, 'analyze-ast-helper.log');
    return {
        contexts,
        contextDefaultValues
    };
}

/***********************************************************************
 * Extract possible example values for props (comparisons, defaults, enums, etc.)
 * Returns an object: { [propName]: { possibleValues: [...], defaultValue } }
 * Currently detects ALL THESE: 
 * .map, .includes, indexOf, startsWith, endsWith, if (prop === value), switch/case, default values, boolean checks, numeric comparisons, etc. 
 * list:
 * .map over prop -> suggests example array
 * .includes, indexOf, startsWith, endsWith -> suggests string/array values
 * if (prop === "value") or if (prop !== "value") -> suggests string value
 * if (prop > 5) or if (prop < 10) -> suggests numeric value
 * if (prop === true) or if (prop === false) -> suggests boolean value
 * switch(prop) { case "value": ... } -> suggests string/numeric/boolean value
 * default values in destructuring -> suggests default value
 * if (prop) or if (!prop) -> suggests boolean value
 * 
 * You can expand it to detect more patterns if needed
 * traverse:
 * CallExpression, BinaryExpression, SwitchCase, AssignmentPattern, UnaryExpression, IfStatement
 */
function findPropValueHints(ast) {
    const hints = {};

    traverse(ast, {
        // Detect usage of .map over props to suggest example array
        CallExpression(path) {
            // .map for arrays
            if (
                path.node.callee &&
                path.node.callee.type === "MemberExpression" &&
                path.node.callee.property &&
                path.node.callee.property.name === "map" &&
                path.node.callee.object &&
                path.node.callee.object.type === "Identifier"
            ) {
                const propName = path.node.callee.object.name;
                if (!hints[propName]) hints[propName] = {};
                if (!hints[propName].exampleArray) {
                    if (/class|option|list|items|array/i.test(propName)) {
                        hints[propName].exampleArray = '[{ id: 1, label: "Example" }]';
                    } else {
                        hints[propName].exampleArray = '[1, 2, 3]';
                    }
                }
            }
            // includes, indexOf, startsWith, endsWith for strings/arrays
            if (
                path.node.callee &&
                path.node.callee.type === "MemberExpression" &&
                ["includes", "indexOf", "startsWith", "endsWith"].includes(path.node.callee.property.name) &&
                path.node.callee.object &&
                path.node.callee.object.type === "Identifier" &&
                path.node.arguments.length > 0 &&
                path.node.arguments[0].type === "StringLiteral"
            ) {
                const propName = path.node.callee.object.name;
                const value = path.node.arguments[0].value;
                if (!hints[propName]) hints[propName] = { possibleValues: [] };
                if (!hints[propName].possibleValues.includes(value)) {
                    hints[propName].possibleValues.push(value);
                }
            }
        },
        // Direct comparisons: if (role === "admin") or if (role !== "admin")
        BinaryExpression(path) {
            // Strings (already implemented)
            if (
                (path.node.operator === "===" || path.node.operator === "==" || path.node.operator === "!==" || path.node.operator === "!=") &&
                path.node.left.type === "Identifier" &&
                typeof path.node.right.value === "string"
            ) {
                const propName = path.node.left.name;
                const value = path.node.right.value;
                if (!hints[propName]) hints[propName] = { possibleValues: [] };
                if (!hints[propName].possibleValues.includes(value)) {
                    hints[propName].possibleValues.push(value);
                }
            }
            // Numeric comparisons: if (count > 5) or if (count < 10)
            if (
                ["<", ">", "<=", ">="].includes(path.node.operator) &&
                path.node.left.type === "Identifier" &&
                typeof path.node.right.value === "number"
            ) {
                const propName = path.node.left.name;
                const value = path.node.right.value;
                if (!hints[propName]) hints[propName] = { possibleValues: [] };
                let example;
                if (path.node.operator === ">" || path.node.operator === ">=") example = value + 1;
                if (path.node.operator === "<" || path.node.operator === "<=") example = value - 1;
                if (!hints[propName].possibleValues.includes(example)) {
                    hints[propName].possibleValues.push(example);
                }
            }
            // Booleans: if (flag === true) or if (flag === false)
            if (
                (path.node.operator === "===" || path.node.operator === "==" || path.node.operator === "!==" || path.node.operator === "!=") &&
                path.node.left.type === "Identifier" &&
                typeof path.node.right.value === "boolean"
            ) {
                const propName = path.node.left.name;
                const value = path.node.right.value;
                if (!hints[propName]) hints[propName] = { possibleValues: [] };
                if (!hints[propName].possibleValues.includes(value)) {
                    hints[propName].possibleValues.push(value);
                }
            }
        },
        // Switch/case: case "admin":
        SwitchCase(path) {
            if (typeof path.node.test?.value === "string" || typeof path.node.test?.value === "number" || typeof path.node.test?.value === "boolean") {
                const switchNode = path.parentPath.node.discriminant;
                if (switchNode && switchNode.type === "Identifier") {
                    const propName = switchNode.name;
                    const value = path.node.test.value;
                    if (!hints[propName]) hints[propName] = { possibleValues: [] };
                    if (!hints[propName].possibleValues.includes(value)) {
                        hints[propName].possibleValues.push(value);
                    }
                }
            }
        },
        // Default values in destructuring: function Comp({ role = "user" })
        AssignmentPattern(path) {
            if (
                path.node.left.type === "Identifier" &&
                (typeof path.node.right.value === "string" || typeof path.node.right.value === "number" || typeof path.node.right.value === "boolean")
            ) {
                const propName = path.node.left.name;
                const value = path.node.right.value;
                if (!hints[propName]) hints[propName] = {};
                hints[propName].defaultValue = value;
            }
        },
        // Booleans: if (flag) or if (!flag)
        UnaryExpression(path) {
            if (
                path.node.operator === "!" &&
                path.node.argument.type === "Identifier"
            ) {
                const propName = path.node.argument.name;
                if (!hints[propName]) hints[propName] = { possibleValues: [] };
                if (!hints[propName].possibleValues.includes(false)) {
                    hints[propName].possibleValues.push(false);
                }
            }
        },
        IfStatement(path) {
            if (
                path.node.test &&
                path.node.test.type === "Identifier"
            ) {
                const propName = path.node.test.name;
                if (!hints[propName]) hints[propName] = { possibleValues: [] };
                if (!hints[propName].possibleValues.includes(true)) {
                    hints[propName].possibleValues.push(true);
                }
            }
        },
    });

    return hints;
}

/**
 * Sub-function: detect PropTypes in React components
 */
function findPropTypes(ast) {
    const propTypes = [];
    traverse(ast, {
        AssignmentExpression(path) {
            // Detects Component.propTypes = { ... }
            if (
                path.node.left.type === "MemberExpression" &&
                path.node.left.property.name === "propTypes" &&
                path.node.right.type === "ObjectExpression"
            ) {
                const componentName = path.node.left.object.name;
                const props = {};

                // Extract each prop definition
                path.node.right.properties.forEach(prop => {
                    if (prop.type === "ObjectProperty" && prop.key && prop.value) {
                        let type = null;
                        let required = false;

                        switch (prop.value.type) {
                            case "MemberExpression":
                                // Detects PropTypes.string, PropTypes.number, etc.
                                if (
                                    prop.value.object &&
                                    prop.value.object.type === "MemberExpression" &&
                                    prop.value.object.property.name === "isRequired"
                                ) {
                                    required = true;
                                    type = prop.value.object.object.property.name;
                                } else if (prop.value.property.name === "isRequired") {
                                    required = true;
                                    type = prop.value.object.property.name;
                                } else {
                                    type = prop.value.property.name;
                                }
                                break;
                            case "CallExpression":
                                // Detects PropTypes.string.isRequired()
                                if (
                                    prop.value.callee &&
                                    prop.value.callee.type === "MemberExpression"
                                ) {
                                    type = prop.value.callee.property.name;
                                }
                                break;
                            default:
                                break;
                        }

                        props[prop.key.name] = { type, required, loc: prop.loc };
                    }
                });

                propTypes.push({ component: componentName, props, loc: path.node.loc });
            }
        }
    });

    return propTypes;
}///end findPropTypes


// Sub-function: comments and docblocks
function findCommentsAndDocblocks(ast) {
    // Babel no recorre comentarios por defecto, pero los incluye en ast.comments
    return ast.comments ? ast.comments.map(c => ({ value: c.value.trim(), loc: c.loc })) : [];
}///end findCommentsAndDocblocks

// Sub-function: imported components
function findImportedComponents(ast) {
    const comps = [];
    traverse(ast, {
        ImportDeclaration(path) {
            path.node.specifiers.forEach(spec => {
                if (spec.type === "ImportDefaultSpecifier" || spec.type === "ImportSpecifier") {
                    comps.push({ name: spec.local.name, loc: path.node.loc });
                }
            });
        }
    });

    return comps;
}///end findImportedComponents

// Sub-function: custom hooks
function findCustomHooks(ast) {
    const hooks = [];
    traverse(ast, {
        CallExpression(path) {
            switch (path.node.callee.type) {
                case "Identifier": {
                    const name = path.node.callee.name;
                    if (isCustomHook(name)) {
                        hooks.push({ name, loc: path.node.loc });
                    }
                    break;
                }
                // You can add more cases here if you need to detect other custom hook patterns
                default:
                    break;
            }
        }
    });

    return hooks;
}///end findCustomHooks

// Sub-function: memoization (useMemo, useCallback)
function findMemoization(ast) {
    const memo = [];
    traverse(ast, {
        CallExpression(path) {
            switch (path.node.callee.type) {
                case "Identifier": {
                    const name = path.node.callee.name;
                    if (isMemoization(name)) {
                        memo.push({ name, loc: path.node.loc });
                    }
                    break;
                }
                case "MemberExpression": {
                    const objName = path.node.callee.object?.name;
                    const propName = path.node.callee.property?.name;
                    if (objName && propName && isMemoization(`${objName}.${propName}`)) {
                        memo.push({ name: `${objName}.${propName}`, loc: path.node.loc });
                    }
                    break;
                }
                // Additional cases can be added here if needed
                default:
                    break;
            }
        }
    });

    return memo;
}///end findMemoization

// Sub-function: state variables (useState)
function findStateVariables(ast) {
    const stateVars = [];
    traverse(ast, {
        VariableDeclarator(path) {
            if (
                path.node.init &&
                path.node.init.type === "CallExpression"
            ) {
                switch (path.node.init.callee.name) {
                    case "useState":
                        if (path.node.id.type === "ArrayPattern") {
                            const varName = path.node.id.elements[0]?.name;
                            if (varName) stateVars.push({ name: varName, loc: path.node.loc });
                        }
                        break;
                    default:
                        break;
                }
            }
        }
    });

    return stateVars;
}///end findStateVariables

// Sub-function: dependencies of useEffect
function findEffectDependencies(ast) {
    const deps = [];
    traverse(ast, {
        CallExpression(path) {
            if (path.node.callee.name === "useEffect") {
                const args = path.node.arguments;
                if (args.length === 2 && args[1].type === "ArrayExpression") {
                    args[1].elements.forEach(el => {
                        switch (el.type) {
                            case "Identifier":
                                deps.push({ name: el.name, loc: el.loc });
                                break;
                            case "MemberExpression":
                                if (el.object && el.property) {
                                    const objName = el.object.name || (el.object.type === "ThisExpression" ? "this" : undefined);
                                    const propName = el.property.name;
                                    if (objName && propName) {
                                        deps.push({ name: `${objName}.${propName}`, loc: el.loc });
                                    }
                                }
                                break;
                            default:
                                break;
                        }
                    });
                }
            }
        }
    });

    return deps;
}///end findEffectDependencies

// Sub-function: returned JSX by the main component
function findReturnedJSX(ast) {
    const jsxNames = [];
    traverse(ast, {
        ReturnStatement(path) {
            const arg = path.node.argument;
            const name = getJSXElementName(arg);
            if (name) jsxNames.push({ name, loc: path.node.loc });
        }
    });

    return jsxNames;
}///end findReturnedJSX

// Sub-function: event handlers (onClick, onChange, etc)
function findEventHandlers(ast) {
    const handlers = [];
    traverse(ast, {
        JSXAttribute(path) {
            const name = path.node.name.name;
            if (name && isEventHandler(name)) {
                handlers.push({ name, loc: path.node.loc });
            }
        }
    });

    return handlers;
}///end findEventHandlers

// Sub-function: API calls (fetch, axios, supabase, etc)
function findApiCalls(ast) {
    const apis = [];
    traverse(ast, {
        CallExpression(path) {
            switch (path.node.callee.type) {
                case "Identifier": {
                    const name = path.node.callee.name;
                    if (isApiCall(name)) {
                        apis.push({ name, loc: path.node.loc });
                    }
                    break;
                }
                case "MemberExpression": {
                    const obj = path.node.callee.object;
                    const prop = path.node.callee.property;
                    if (obj && obj.name === "supabase" && prop && SUPABASE_METHODS.has(prop.name)) {
                        apis.push({ name: `supabase.${prop.name}`, loc: path.node.loc });
                    }
                    break;
                }
                default:
                    break;
            }
        }
    });

    return apis;
}///end findApiCalls

// Sub-function: error handling (try/catch, throw)
function findErrorHandling(ast) {
    const errors = [];
    traverse(ast, {
        TryStatement(path) {
            const type = "try/catch";
            if (isErrorHandling(type)) {
                errors.push({ type, loc: path.node.loc });
            }
        },
        ThrowStatement(path) {
            const type = "throw";
            if (isErrorHandling(type)) {
                errors.push({ type, loc: path.node.loc });
            }
        }
    });

    return errors;
}///end findErrorHandling

// Sub-function: conditional rendering (cond && <Comp />, ternaries)
function findConditionalRendering(ast) {
    const conditionals = [];
    traverse(ast, {
        JSXExpressionContainer(path) {
            const exprType = path.node.expression.type;
            if (isConditionalRendering(exprType)) {
                conditionals.push({ type: exprType, loc: path.node.loc });
            }
        }
    });

    return conditionals;
}///end findConditionalRendering

// Sub-function: imports
export function findImports(ast) {
    const imports = [];
    traverse(ast, {
        ImportDeclaration(path) {
            imports.push({
                source: path.node.source.value,
                specifiers: path.node.specifiers.map(s => s.local.name),
                loc: path.node.loc
            });
        }
    });

    return imports;
}///end findImports

// Sub-function: variables declared
function findProps(ast, propValueHints = {}) {
    const props = [];
    traverse(ast, {
        MemberExpression(path) {
            if (path.node.object && path.node.object.name === "props") {
                const name = path.node.property.name;
                const hint = propValueHints?.[name] || {};
                props.push({ name, loc: path.node.loc, ...hint });
            }
        },
        FunctionDeclaration(path) {
            if (path.node.params) {
                extractPropsFromParams(path.node.params).forEach(p => {
                    const hint = propValueHints?.[p] || {};
                    props.push({ name: p, loc: path.node.loc, ...hint });
                });
            }
        },
        FunctionExpression(path) {
            if (path.node.params) {
                extractPropsFromParams(path.node.params).forEach(p => {
                    const hint = propValueHints?.[p] || {};
                    props.push({ name: p, loc: path.node.loc, ...hint });
                });
            }
        },
        ArrowFunctionExpression(path) {
            if (path.node.params) {
                extractPropsFromParams(path.node.params).forEach(p => {
                    const hint = propValueHints?.[p] || {};
                    props.push({ name: p, loc: path.node.loc, ...hint });
                });
            }
        },
        ExportDefaultDeclaration(path) {
            const decl = path.node.declaration;
            if ((decl.type === "FunctionDeclaration" || decl.type === "FunctionExpression" || decl.type === "ArrowFunctionExpression") && decl.params) {
                extractPropsFromParams(decl.params).forEach(p => {
                    const hint = propValueHints?.[p] || {};
                    props.push({ name: p, loc: path.node.loc, ...hint });
                });
            }
        }
    });

    return props;
}///end findProps

// Sub-function: branches (if, switch, try/catch)
function findBranches(ast) {
    const branches = [];
    traverse(ast, {
        IfStatement(path) {
            branches.push({ type: "if", loc: path.node.loc });
        },
        SwitchStatement(path) {
            branches.push({ type: "switch", loc: path.node.loc });
        },
        TryStatement(path) {
            branches.push({ type: "try/catch", loc: path.node.loc });
        }
    });

    return branches;
}///end findBranches

// Sub-function: export default detection
// filename es opcional, pero si se provee ayuda a los fallbacks de nombre de componente
function findExportDefault(ast, fileName = "") {
    // console.log("[findExportDefault] Iniciando análisis de export default");
    let result = null;
    traverse(ast, {
        ExportDefaultDeclaration(path) {
            const decl = path.node.declaration;
            // console.log("[findExportDefault] ExportDefaultDeclaration type:", decl.type);
            switch (decl.type) {
                case "FunctionDeclaration":
                    // console.log("[findExportDefault] FunctionDeclaration name:", decl.id?.name);
                    result = {
                        type: "function",
                        name: decl.id?.name,
                        params: decl.params.map(p => p.name),
                        loc: decl.loc
                    };
                    break;
                case "ClassDeclaration":
                    // console.log("[findExportDefault] ClassDeclaration name:", decl.id?.name);
                    result = {
                        type: "class",
                        name: decl.id?.name,
                        loc: decl.loc
                    };
                    break;
                case "Identifier":
                    // console.log("[findExportDefault] Identifier name:", decl.name);
                    result = {
                        type: "identifier",
                        name: decl.name,
                        loc: decl.loc
                    };
                    break;
                case "CallExpression":
                    // Detects HOC: export default Protect(WelcomePage, ...)
                    const hocName = decl.callee.name;
                    const wrappedComponent = decl.arguments[0]?.name;
                    // console.log("[findExportDefault] CallExpression (HOC): hocName=", hocName, ", wrappedComponent=", wrappedComponent);
                    result = {
                        type: "hoc",
                        isHOC: true,
                        hocName,
                        wrappedComponent,
                        loc: decl.loc
                    };
                    break;
                // Optionally handle other types if needed
                default:
                    // console.log("[findExportDefault] Unhandled export default type:", decl.type);
                    break;
            }
        }
    });

    // Fallback: si no hay nombre, intentar inferirlo
    if (result && !result.name) {
        // console.log("[findExportDefault] Fallback: result sin nombre, tipo:", result.type);
        // Buscar una declaración previa con el mismo identificador
        // O usar el nombre del archivo (sin extensión) como último recurso
        if (result.type === "identifier" && result.name === undefined && ast.program && Array.isArray(ast.program.body)) {
            // Buscar declaración previa
            const idNode = ast.program.body.find(
                n => (n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id && n.id.name
            );
            if (idNode) {
                // console.log("[findExportDefault] Fallback: encontrado idNode:", idNode.id.name);
                result.name = idNode.id.name;
            }
        }
        // Si sigue sin nombre, usar el nombre del archivo si está disponible
        if (!result.name && typeof fileName === "string" && fileName.length > 0) {
            const base = fileName.split("/").pop()?.split(".")[0];
            if (base) {
                // console.log("[findExportDefault] Fallback: usando filename base:", base);
                result.name = base;
            }
        }
        // Fallback final
        if (!result.name) {
            // console.log("[findExportDefault] Fallback: usando 'Component' como nombre final");
            result.name = "Component";
        }
    }

    // console.log("[findExportDefault] Resultado final:", result);
    return result;
}///end findExportDefault

// Sub-function: hooks
function findHooks(ast) {
    const hooks = [];
    traverse(ast, {
        CallExpression(path) {
            if (path.node.callee.type === "Identifier") {
                const name = path.node.callee.name;
                if (name.startsWith("use")) {
                    hooks.push({ name, loc: path.node.loc });
                    // writeLog(`[findHooks] Detected hook: ${name} at ${JSON.stringify(path.node.loc)}`, 'analyze-ast-helper.log');
                }
            }
        }
    });

    return hooks;
}///end findHooks

// Sub-funtion: JSX elements used
function findJSXElements(ast) {
    const elements = [];
    traverse(ast, {
        JSXOpeningElement(path) {
            const name = getJSXElementName({ type: "JSXElement", openingElement: path.node });
            if (name) {
                elements.push({ name, loc: path.node.loc });
            }
        }
    });

    return elements;
}///end findJSXElements

// Sub-function: variables declared
function findVariables(ast) {
    const vars = [];
    traverse(ast, {
        VariableDeclarator(path) {
            vars.push({ name: path.node.id.name, loc: path.node.loc });
        }
    });
// writeLog(true, `[findVariables] Detected variables: ${JSON.stringify(vars)}`, 'analyze-ast-helper.log');
    return vars;
}///end findVariables

// Sub-function: internal functions declared
function findInternalFunctions(ast) {
    const funcs = [];
    traverse(ast, {
        FunctionDeclaration(path) {
            if (path.node.id) {
                funcs.push({ name: path.node.id.name, loc: path.node.loc });
            }
        }
    });

    return funcs;
}///end findInternalFunctions

/**
 * Sub-function: Detect expensive calculations in JSX/render (map/filter/reduce, operaciones complejas)
 * Devuelve array de { loc, type, code }
 */
function findExpensiveCalculationsInJSX(ast) {
    const expensiveCalcs = [];
    traverse(ast, {
        JSXExpressionContainer(path) {
            const expr = path.node.expression;
            // Detecta llamadas a métodos de array y operaciones matemáticas
            if (expr) {
                switch (expr.type) {
                    case "BinaryExpression":
                        // Operaciones matemáticas complejas
                        expensiveCalcs.push({
                            loc: path.node.loc,
                            type: expr.type,
                            code: `<binary: ${expr.left.name || expr.left.value || "?"} ${expr.operator} ${expr.right.name || expr.right.value || "?"}>`
                        });
                        break;
                    case "CallExpression":
                        // Llamadas a funciones pesadas (heurística: nombre contiene "calculate", "compute", "process")
                        const callee = expr.callee;
                        if (
                            callee.type === "Identifier" &&
                            /calculate|compute|process/i.test(callee.name)
                        ) {
                            expensiveCalcs.push({
                                loc: path.node.loc,
                                type: expr.type,
                                code: `${callee.name}(...)`
                            });
                        }

                        // Métodos de array comunes
                        const arrayMethods = ["map", "filter", "reduce", "sort", "flatMap", "forEach"];
                        if (
                            callee.type === "MemberExpression" &&
                            arrayMethods.includes(callee.property.name)
                        ) {
                            expensiveCalcs.push({
                                loc: path.node.loc,
                                type: expr.type,
                                code: `${callee.object.name || "<expr>"}.${callee.property.name}(...)`
                            });
                        }
                        break;
                    default:
                        break;
                }
            }
        }
    });

    return expensiveCalcs;
}


/**
 * Sub-function: Detect inline functions (arrow/anon) passed as props/event handlers in JSX
 * Devuelve array de { name, loc, type }
 */
function findInlineFunctionsInJSX(ast) {
    const inlineFns = [];
    traverse(ast, {
        JSXAttribute(path) {
            const attrName = path.node.name.name;
            const value = path.node.value;
            // Detect ArrowFunctionExpression o FunctionExpression como valor
            if (value && value.expression) {
                const expr = value.expression;
                if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
                    inlineFns.push({
                        name: attrName,
                        loc: path.node.loc,
                        type: expr.type
                    });
                }
            }
        }
    });
    return inlineFns;
}///end findInlineFunctionsInJSX

/**
 * Sub-function: Extract all variables used within an AST function
 */
export function getUsedVariablesInFunction(fnNode) {
    const usedVars = new Set();
    if (!fnNode || !fnNode.body) return [];

    // Recorrer el cuerpo de la función
    traverse(
        { type: "File", program: { type: "Program", body: [fnNode] } },
        {

            Identifier(path) {
                // avoid adding declaration nodes
                if (!isDeclarationNode(path.parent.type)) {
                    usedVars.push({ name: path.node.name, loc: path.node.loc });
                }
            },

            MemberExpression(path) {
                // Collect expressions like obj.prop
                if (path.node.object && path.node.property) {
                    let objName = path.node.object.name || (path.node.object.type === "ThisExpression" ? "this" : undefined);
                    let propName = path.node.property.name;
                    if (objName && propName) {
                        usedVars.push({ name: `${objName}.${propName}`, loc: path.node.loc });
                    }
                }
            }
        }
    );

    return Array.from(usedVars);
}///end getUsedVariablesInFunction

/**
 * Sub-function: Compare used variables vs declared dependencies in hooks like useEffect
 * Returns a report with missing, unnecessary, and mutable dependencies
 */
function compareHookDependencies(usedVars, declaredDeps) {
    // names
    const usedNames = new Set(usedVars.map(v => v.name));
    const declaredNames = new Set(declaredDeps.map(d => d.name));

    // missing: use but not declared
    const missingDeps = Array.from(usedNames).filter(name => !declaredNames.has(name));
    // unnecessary: declared but not used
    const unusedDeps = Array.from(declaredNames).filter(name => !usedNames.has(name));
    // mutable: simple heuristic, if the name includes [] or {} or is a complex expression
    const mutableDeps = declaredDeps.filter(dep => {
        // Detect inline arrays/objects, member expressions, etc.
        return (
            dep.name.includes("[") ||
            dep.name.includes("{") ||
            dep.name.includes("(") ||
            dep.name.includes(".") // member expressions can be mutable
        );
    }).map(dep => dep.name);

    return {
        missingDeps,
        unusedDeps,
        mutableDeps
    };
}///end compareHookDependencies

/**
 * Finds all keys accessed on the variable resulting from useParams
 * Example: params["asset-class"], params.organization
 * Returns an array of strings with the accessed keys
 * Only requires the AST, automatically detects the 'params' variable if it exists.
 */
function findParamsKeys(ast) {
    // Detect if there is a variable named 'params' and if the useParams hook is present
    const variables = findVariables(ast);
    const hooks = findHooks(ast);
    const hasParamsVar = variables.some(v => v.name === 'params');
    const hasUseParams = hooks.some(h => h.name === 'useParams');
    if (!hasParamsVar || !hasUseParams) {
        // writeLog(`[findParamsKeys] No 'params' variable or 'useParams' hook found`, 'analyze-ast-helper.log');
        return [];
    }
    const keys = new Set();
    traverse(ast, {
        MemberExpression(path) {
            // params["asset-class"] or params.assetClass
            if (
                path.node.object &&
                path.node.object.type === "Identifier" &&
                path.node.object.name === 'params'
            ) {
                if (path.node.computed && path.node.property.type === "StringLiteral") {
                    keys.add(path.node.property.value);
                } else if (!path.node.computed && path.node.property.type === "Identifier") {
                    keys.add(path.node.property.name);
                }
            }
        }
    });
    // writeLog(`[findParamsKeys] keys accessed for 'params': ${JSON.stringify(Array.from(keys))}`, 'analyze-ast-helper.log');
    return Array.from(keys);
}
