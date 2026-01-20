// scripts/generate/suggest-test-blocks.mjs
// Algorithms to suggest test blocks based on AST analysis

// IMPORTS
import { 
    blockHelper, // Helper to create skeleton block objects
    formatAstInfoComment, // Formats AST info as a comment
    formatSourceLineComment, // Formats source line info as a comment
    astNameToString, // Converts AST node name to string
    getAutoMocks, // Generates mock import comments for dependencies
    getExampleValue, // Provides example values for props/state/etc.
    handlerContextsMockAndImport, // Generates context mocks and import helpers
    isBlockUsingTestingLibrary, // Checks if block uses React Testing Library
    generateUseParamsMock, // Generates useParams mock helper
    generateUseMocks, // Generates useNavigation/useRouter/useContext mocks (new helper)
} from './suggest-helpers.mjs';

//writeLog from utils
import { writeLog } from './generate/utils.mjs';
import { write } from 'fs';

/* ================================================================
    MAIN HANDLER EXPORT: suggestTestBlocks
    context may include: ast, workspace, dependencies, examples, etc.
    ----------------------------------------------- */
export function suggestTestBlocks(context) {
    // context is the result of the AST analysis
    const results = context;
    let suggestions = [];

    //writeLog context received
    // writeLog(`Suggesting test blocks based on AST receiving: ${JSON.stringify(results)}`, 'suggest-test-blocks.log');

    blockAlgorithms.forEach(({ type, condition, fn }) => {
        if (condition(results)) {
            //write in the log the function that will be executed
            // writeLog(true, `Suggesting block of type: ${type}`, 'suggest-test-blocks.log');
            const block = fn(results);
            //log block
            // writeLog(true, `Suggested block:\nType: ${block.type}\nTitle: ${block.title}\nMeta: ${JSON.stringify(block.meta, null, 2)}\nCode:\n${block.code}`, 'suggest-test-blocks.log');
            suggestions.push(block);
        }
    });

    // Deduplication by type and code
    const seen = new Set();
    suggestions = suggestions.filter(block => {
        const key = `${block.type}|${block.code}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // writeLog(`Suggested ${suggestions.length} test block(s): ${suggestions.map(b => b.type).join(', ')}`, 'suggest-test-blocks.log');
    return suggestions;
}///end suggestTestBlocks


/* ================================================================ */
/**
 * BLOCK ALGORITHMS SUGGESTION FNs
 */

// Props test algorithm (receives props and uses them in render, etc., )
// Reason: Verifies that the component is wrapped by a Higher-Order Component (HOC) and that the integration and behavior of the HOC work correctly.
function suggestHOCBlock(ast) {
    const hocName = ast.mainComponent?.hocName || ast.mainComponent?.name || "HOC";
    const wrappedComponent = ast.mainComponent?.wrappedComponent || "Component";

    // use relevant names for from HOC and wrapped component
    const usedNames = [hocName, wrappedComponent];
    const mocks = getAutoMocks(ast.imports, usedNames); // deduplicated mocks string, only for meta

    const codeLines = [
        `// HOC integration test for ${wrappedComponent} (via ${hocName})`,
        `describe('${hocName}(${wrappedComponent})', () => {\n`,
        `  ${formatAstInfoComment(ast.exportDefault)}`,
        `  it("renders the wrapped component with HOC logic${formatSourceLineComment(ast.exportDefault)}", () => {`,
        `    // TODO: Mock HOC logic if needed`,
        `    // TODO: Render the wrapped component via the HOC`,
        `    // TODO: Assert HOC-specific behavior (e.g., permissions, context, props)`,
        `    // expect(...).toBeInTheDocument();`,
        `  });\n`,
        `});`
    ];
    
    // Build and return the suggested test block for HOC integration
    return blockHelper({
        type: 'hoc',
        title: `HOC integration test for ${wrappedComponent} (via ${hocName})`,
        description: `Verifies that the component ${wrappedComponent} is correctly wrapped by the HOC ${hocName} and that the integration works as expected.`,
        code: codeLines.join('\n'),
        meta: { 
            hocName, // Name of the HOC
            wrappedComponent, // Name of the wrapped component
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines) // Whether React Testing Library is used
        }
    });
}///end suggestHOCBlock


// Context test algorithm (React Context usage, useContext, createContext, etc., )
// Reason: Tests that the component correctly consumes React Context values and responds to context changes, ensuring integration and decoupling.
function suggestContextBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    // Filter only real contexts (isProvider: true)
    const contexts = Array.isArray(ast.contexts) ? ast.contexts.filter(ctx => ctx.isProvider) : [];
    const contextDefaultValues = ast.contextDefaultValues || {};

    // Relevant names for mocks
    const usedNames = contexts.map(ctx => ctx.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames);

    // Enrich contexts with their real default value if it exists in contextDefaultValues
    const enrichedContexts = contexts.map(ctx => {
        // If the context was created here and has a default value in contextDefaultValues, use it
        const enrichedValueShape =
            (ctx.created && contextDefaultValues[ctx.name] !== undefined)
                ? contextDefaultValues[ctx.name]
                : (ctx.valueShape || ctx.defaultValue || getExampleValue(ctx, 'context'));
        return {
            ...ctx,
            valueShape: enrichedValueShape
        };
    });

    // Process export and warnings
    const contextWarnings = [];
    const enrichedWithExport = enrichedContexts.map(ctx => {
        let warning = null;
        if (ctx.isExported === false) {
            warning = `// ⚠️ WARNING: Context '${ctx.name}' is not exported as a named export.\n// This may cause test failures. Consider exporting it: 'export const ${ctx.name} = ...'`;
            contextWarnings.push({
                name: ctx.name,
                warning,
                isExported: false
            });
        }
        return {
            ...ctx,
            warning,
            isExported: ctx.isExported
        };
    });

    // 1. Enrich all detected contexts (without filtering)
    const contextsHelpersRaw = enrichedWithExport.map(ctx => handlerContextsMockAndImport({
        contextName: ctx.name,
        contextPath: ctx.path || ctx.importPath || '',
        valueShape: ctx.valueShape,
        type: ctx.type
    }));

    // 2. Filter those with valid contextMeta and importLine (for printing imports/mocks)
    let contextsHelpers = contextsHelpersRaw.filter(h => h && h.contextMeta && typeof h.contextMeta.importLine === 'string' && h.contextMeta.importLine.length > 0);

    // 3. Deduplicate contextsHelpers by importLine
    contextsHelpers = contextsHelpers.filter((h, i, arr) =>
        arr.findIndex(x => x.contextMeta.importLine === h.contextMeta.importLine) === i
    );

    // Generate warning lines if applicable
    const warningLines = contextWarnings.length
        ? contextWarnings.map(w => w.warning).join('\n') + '\n'
        : '';

    // If there are non-exported contexts, add a safe fallback definition

    let fallbackLines = '';
    let useSafeContext = false;
    if (contextWarnings.length) {
        // For each non-exported context, define a safe local mock with an alias
        fallbackLines = contextWarnings.map(w => `// Fallback: define mock context if not exported\nconst ${w.name}Safe = typeof ${w.name} !== 'undefined' ? ${w.name} : require('react').createContext(null);`).join('\n') + '\n';
        useSafeContext = true;
    }

    const codeLines = [
        `// Context usage test for ${mainComponent}`,
        warningLines,
        fallbackLines,
        `describe('${mainComponent} context', () => {\n`,
        ...contextsHelpers.map(({ context, contextMeta }) => [
            `  ${formatAstInfoComment(context)}`,
            context.warning ? `  ${context.warning}` : '',
            `  it("responds to context ${astNameToString(context)} changes${formatSourceLineComment(context)}", () => {`,
            `    // Example value: ${contextMeta.exampleValue}`,
            contextMeta && contextMeta.providerWrapper
                ? `    // Render with context provider:\n    render(${contextMeta.providerWrapper(`<${mainComponent} />`)});`
                : (
                    useSafeContext
                        ? `    // Render with context provider (safe fallback):\n    render(<${context.name}Safe.Provider value={mockDataExportContextValue}><${mainComponent} /></${context.name}Safe.Provider>);`
                        : `    // Render with context provider:\n    render(<${context.name}.Provider value={mockDataExportContextValue}><${mainComponent} /></${context.name}.Provider>);`
                  ),
            `    // TODO: Simulate context value changes`,
            `    // TODO: Assert expected UI/logic for each context value`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];

    // Build and return the suggested test block for context usage
    return blockHelper({
        type: 'context',
        title: `Context usage test for ${mainComponent}`,
        description: 'Verifies that the component correctly consumes React Context values and responds to context changes.',
        code: codeLines.join('\n'),
        meta: {
            contextsHelpers, // Valid helpers for import/mocks printing
            contextsHelpersRaw, // All detected context helpers, unfiltered
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            contextWarnings, // List of warnings and export status
            contexts: enrichedWithExport // Contexts enriched with isExported and warning
        }
    });
}///end suggestContextBlock

// Basic render test algorithm (rendering main elements, etc., )
// Reason: Verifies that the component and its main elements render correctly, ensuring visual and functional integrity.
function suggestRenderBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const mainElements = ast.returnedJSX.length ? ast.returnedJSX : ast.jsxElements;

    // Use relevant names for rendered elements
    const usedNames = mainElements.map(el => el.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // Use the centralized helper for navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// Render test for ${mainComponent}`,
        `describe('${mainComponent}', () => {\n`,
        `  ${formatAstInfoComment(ast.exportDefault)}`,
        `  it("renders main elements${formatSourceLineComment(ast.exportDefault)}", () => {`,
        `    // Render the component`,
        `    // TODO: Use proper props`,
        `    render(<${mainComponent} />);`,
        ...mainElements.map(el => [
            `    ${formatAstInfoComment(el)}`,
            `    expect(screen.getByRole('${astNameToString(el)}', { hidden: true })).toBeInTheDocument();`
        ].join('\n')),
        `  });\n`,
        `});`
    ];
    // writeLog(`Render block code lines:\n${codeLines.join('\n')}`, 'suggest-test-blocks.log');
    // Build and return the suggested test block for rendering main elements
    return blockHelper({
        type: 'render',
        title: `Render test for ${mainComponent}`,
        description: 'Verifies that the component and its main elements render correctly, ensuring visual and functional integrity.',
        code: codeLines.join('\n'),
        meta: { 
            elements: mainElements, // List of main JSX elements rendered
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // Array of navigation/context mocks
        }
    });
}///end suggestRenderBlock

// Conditional render test algorithm (conditional rendering, if, ternaries, etc., )
// Reason: Tests that conditional elements appear/disappear based on state or props, covering alternative paths and UI logic.
function suggestConditionalBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";

    // use relevant names for condicionales
    const usedNames = ast.conditionalRendering.map(cond => cond.type).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // Enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// Conditional rendering test for ${mainComponent}`,
        `describe('${mainComponent}', () => {\n`,
        `  ${formatAstInfoComment(ast.exportDefault)}`,
        `  it("renders conditionally based on state/props${formatSourceLineComment(ast.exportDefault)}", () => {`,
        `    // Render the component`,
        `    // TODO: Simulate state/props changes`,
        `    // TODO: Check conditional elements`,
        ...ast.conditionalRendering.flatMap(cond => [
            `    ${formatAstInfoComment(cond)}`,
            `    // Expect element rendered by ${astNameToString(cond)}`,
            `    // expect(...).toBeInTheDocument();`
        ]),
        `  });\n`,
        `});`
    ];

    // Build and return the suggested test block for conditional rendering
    return blockHelper({
        type: 'conditional',
        title: `Conditional rendering test for ${mainComponent}`,
        description: 'Verifies that conditional elements render/disappear correctly based on state or props.',
        code: codeLines.join('\n'),
        meta: { 
            conditionals: ast.conditionalRendering, // List of conditional rendering cases detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // Enrichment: navigation/context mocks
        }
    });
}///end suggestConditionalBlock


// PropTypes test algorithm (PropTypes definitions, restrictions, etc., not TypeScript, etc., )
// Reason: PropTypes help prevent type errors and document the component's API. Testing them ensures that received props meet the constraints and that the component responds correctly to invalid values.
function suggestPropTypesBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const propTypes = Array.isArray(ast.propTypes) ? ast.propTypes : [];

    // use relevant names for propTypes
    const usedNames = propTypes.flatMap(type => Object.keys(type.props || {}));
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`
    const codeLines = [
        `// PropTypes test for ${mainComponent}`,
        `describe('${mainComponent} propTypes', () => {\n`,
        ...propTypes.map(type => [
            `  ${formatAstInfoComment(type)}`,
            `  it("validates propType '${astNameToString(type)}'${formatSourceLineComment(type)}", () => {`,
            `    // TODO: Render with propType '${astNameToString(type)}' set to valid and invalid values`,
            `    // TODO: Assert expected warnings/errors and UI behavior`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];

    // Build and return the suggested test block for PropTypes validation
    return blockHelper({
        type: 'propTypes',
        title: `PropTypes test for ${mainComponent}`,
        description: 'Validates that props comply with defined types and restrictions, and that the component responds correctly to invalid values.',
        code: codeLines.join('\n'),
        meta: { 
            propTypes, // List of PropTypes definitions detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines) // Whether React Testing Library is used
        }
    });
}///end suggestPropTypesBlock

// Testing of internal helper functions algorithm (internal functions, not hooks, etc., )
// Reason: Validates that internal helper functions work correctly and integrate well with the component, covering key logic.
function suggestInternalFunctionsBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const internalFunctions = Array.isArray(ast.internalFunctions) ? ast.internalFunctions : [];
    
    // use relevant names for internal functions
    const usedNames = internalFunctions.map(fn => fn.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    const codeLines = [
        `// Internal functions test for ${mainComponent}`,
        `describe('${mainComponent} internal functions', () => {\n`,
        ...internalFunctions.map(fn => [
            `  ${formatAstInfoComment(fn)}`,
            `  it("executes '${astNameToString(fn)}' correctly${formatSourceLineComment(fn)}", () => {`,
            `    // TODO: Test ${astNameToString(fn)} in isolation if possible`,
            `    // TODO: Provide example inputs/outputs for ${astNameToString(fn)}`,
            `    // TODO: Assert expected behavior and integration`,
            `    // expect(...).toBeDefined();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];

    // Build and return the suggested test block for internal helper functions
    return blockHelper({
        type: 'internalFunctions',
        title: `Internal functions test for ${mainComponent}`,
        description: 'Verifies that internal helper functions work correctly and integrate well with the component.',
        code: codeLines.join('\n'),
        meta: { 
            internalFunctions, // List of internal helper functions detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines) // Whether React Testing Library is used
        }
    });
}///end suggestInternalFunctionsBlock

// Memoization test algorithm (memoization, useMemo, useCallback, React.memo, etc., )
// Reason: Tests that memoized values update correctly and optimize performance, avoiding unnecessary calculations/re-renders.
function suggestMemoizationBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const memoization = Array.isArray(ast.memoization) ? ast.memoization : [];

    // use relevant names for hooks de memoización
    const usedNames = memoization.map(memo => memo.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`
    const codeLines = [
        `// Memoization test for ${mainComponent}`,
        `describe('${mainComponent} memoization', () => {\n`,
        ...memoization.map(memo => [
            `  ${formatAstInfoComment(memo)}`,
            `  it("handles memoization hook '${astNameToString(memo)}' correctly${formatSourceLineComment(memo)}", () => {`,
            `    // TODO: Simulate changes in dependencies for '${astNameToString(memo)}'`,
            `    // TODO: Render the component`,
            `    // TODO: Assert memoized value updates only when dependencies change`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];
    
    // Build and return the suggested test block for memoization hooks
    return blockHelper({
        type: 'memoization',
        title: `Memoization test for ${mainComponent}`,
        description: 'Verifies that memoized values update correctly and optimize performance.',
        code: codeLines.join('\n'),
        meta: { 
            memoization, // List of memoization hooks detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines) // Whether React Testing Library is used
        }
    });
}///end suggestMemoizationBlock

// Custom hooks test algorithm (custom hooks, not core hooks, etc., )
// Reason: Verifies that the component integrates and responds correctly to the custom hooks used, ensuring context and shared logic.
function suggestCustomHooksBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const customHooks = Array.isArray(ast.customHooks) ? ast.customHooks : [];

    // use relevant names for custom hooks
    const usedNames = customHooks.map(hook => hook.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// Custom hooks test for ${mainComponent}`,
        `describe('${mainComponent} custom hooks', () => {\n`,
        ...customHooks.map(hook => [
            `  ${formatAstInfoComment(hook)}`,
            `  it("integrates '${astNameToString(hook)}' correctly${formatSourceLineComment(hook)}", () => {`,
            `    // TODO: Mock context/provider for '${astNameToString(hook)}' if needed`,
            `    // TODO: Render the component`,
            `    // TODO: Simulate changes in hook context/values`,
            `    // TODO: Assert expected UI/logic after hook change`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];

    // Build and return the suggested test block for custom hooks
    return blockHelper({
        type: 'customHooks',
        title: `Custom hooks test for ${mainComponent}`,
        description: 'Verifies that the component integrates and responds correctly to the custom hooks used.',
        code: codeLines.join('\n'),
        meta: { 
            customHooks, // List of custom hooks detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // enrichment: navigation/context mocks
        }
    });
}///end suggestCustomHooksBlock

// Branches test algorithm (if, switch, etc., )
// Reason: Tests that the component responds correctly to different control branches (if, switch, etc.), covering alternative logic.
function suggestBranchesBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const branches = Array.isArray(ast.branches) ? ast.branches : [];

    // use relevant names for branches
    const usedNames = branches.map(branch => branch.type).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// Branches test for ${mainComponent}`,
        `describe('${mainComponent} branches', () => {\n`,
        ...branches.map(branch => [
            `  ${formatAstInfoComment(branch)}`,
            `  it("handles branch '${astNameToString(branch)}' correctly${formatSourceLineComment(branch)}", () => {`,
            `    // TODO: Simulate condition for branch (${astNameToString(branch)})`,
            `    // TODO: Render the component`,
            `    // TODO: Assert expected UI/logic for this branch`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];

    // Build and return the suggested test block for branches
    return blockHelper({
        type: 'branches',
        title: `Branches test for ${mainComponent}`,
        description: 'Verifies that the component responds correctly to different control branches (if, switch, etc.).',
        code: codeLines.join('\n'),
        meta: { 
            branches, // List of branch cases detected (if, switch, etc.)
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // enrichment: navigation/context mocks
        }
    });
}///end suggestBranchesBlock

// Error handling test algorithm (try/catch, throw, etc.)
// Reason: Validates that the component handles errors correctly and displays appropriate responses, improving robustness and UX.
function suggestErrorHandlingBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const errorHandling = Array.isArray(ast.errorHandling) ? ast.errorHandling : [];

    // use relevant names for errores
    const usedNames = errorHandling.map(err => err.type).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// Error handling test for ${mainComponent}`,
        `describe('${mainComponent} error handling', () => {\n`,
        ...errorHandling.map(err => [
            `  ${formatAstInfoComment(err)}`,
            `  it("handles '${astNameToString(err)}' correctly${formatSourceLineComment(err)}", async () => {`,
            `    // TODO: Simulate error (${astNameToString(err)}) in logic/API`,
            `    // TODO: Render the component`,
            `    // TODO: Trigger error scenario`,
            `    // TODO: Assert error message/UI/logic`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];
    
    // Build and return the suggested test block for error handling
    return blockHelper({
        type: 'errorHandling',
        title: `Error handling test for ${mainComponent}`,
        description: 'Verifies that the component handles errors correctly and displays appropriate responses.',
        code: codeLines.join('\n'),
        meta: { 
            errorHandling, // List of error handling cases detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // enrichment: navigation/context mocks
        }
    });
}///end suggestErrorHandlingBlock

// Effects test algorithm (useEffect, side effects, etc., )
// Reason: Tests that side effects (useEffect) are triggered correctly upon changes in their dependencies, covering side effects.
function suggestEffectsBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const effectDeps = Array.isArray(ast.effectDeps) ? ast.effectDeps : [];
    
    // use relevant names for effect dependencies
    const usedNames = effectDeps.map(dep => dep.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// Effects (useEffect) test for ${mainComponent}`,
        `describe('${mainComponent} effects', () => {\n`,
        ...effectDeps.map(dep => [
            `  ${formatAstInfoComment(dep)}`,
            `  it("runs effect when '${astNameToString(dep)}' changes${formatSourceLineComment(dep)}", () => {`,
            `    // TODO: Render the component`,
            `    // TODO: Simulate change in '${astNameToString(dep)}'`,
            `    // TODO: Assert effect side effects/UI changes`,
            `    // act(() => { 'update ${astNameToString(dep)}' });`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];
    
    // Build and return the suggested test block for effects (useEffect)
    return blockHelper({
        type: 'effects',
        title: `Effects (useEffect) test for ${mainComponent}`,
        description: 'Verifies that side effects (useEffect) are triggered correctly upon changes in their dependencies.',
        code: codeLines.join('\n'),
        meta: { 
            effectDeps, // List of effect dependencies detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // enrichment: navigation/context mocks
        }
    });
}///end suggestEffectsBlock

// API calls test algorithm (fetch, axios, etc., )
// Reason: Verifies that external API calls are made correctly and handles results and errors, ensuring integration.
function suggestApiCallsBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const apiCalls = Array.isArray(ast.apiCalls) ? ast.apiCalls : [];
    
    // use relevant names for API calls
    const usedApiImports = new Set();
    if (Array.isArray(ast.imports)) {
        apiCalls.forEach(api => {
            // api.name puede ser 'createClient', 'fetch', 'axios', 'supabase.from', etc.
            ast.imports.forEach(imp => {
                
                // If the import has a specifier that matches the API call name
                if (imp.specifiers && imp.specifiers.includes(api.name)) {
                    usedApiImports.add(imp.source);
                }

                // For cases like supabase.from, look for the prefix
                if (api.name && api.name.includes('.') && imp.specifiers && imp.specifiers.includes(api.name.split('.')[0])) {
                    usedApiImports.add(imp.source);
                }
            });
        });
    }
    
    // Filtrar con getAutoMocks para excluir core/testing
    const mocks = getAutoMocks(
        ast.imports.filter(imp => usedApiImports.has(imp.source))
    ); // will return '' or `// Uses mock(s): ...`

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// API calls test for ${mainComponent}`,
        `describe('${mainComponent} API calls', () => {\n`,
        ...apiCalls.map(api => [
            `  ${formatAstInfoComment(api)}`,
            `  it("calls '${astNameToString(api)}' and handles response${formatSourceLineComment(api)}", async () => {`,
            `    // TODO: Mock '${astNameToString(api)}'`,
            `    // TODO: Render the component`,
            `    // TODO: Trigger API call (user action or effect)`,
            `    // TODO: Assert expected UI/logic after API response`,
            `    // expect(...).toBeInTheDocument();`,
            `  });\n`
        ].join('\n')),
        `});`
    ];
    
    // Build and return the suggested test block for API calls
    return blockHelper({
        type: 'apiCalls',
        title: `API calls test for ${mainComponent}`,
        description: 'Verifies that external API calls are made correctly and handles results and errors.',
        code: codeLines.join('\n'),
        meta: { 
            apiCalls, // List of API calls detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // enrichment: navigation/context mocks
        }
    });
}///end suggestApiCallsBlock

// State variables test algorithm (state variables, useState, etc., )
// Reason: Tests that state changes produce the expected effects in the UI and internal logic, preventing inconsistencies.
function suggestStateBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const stateVars = Array.isArray(ast.stateVars) ? ast.stateVars : [];
    
    // use relevant names for state variables
    const usedNames = stateVars.map(state => state.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// State variables test for ${mainComponent}`,
        `describe('${mainComponent} state', () => {\n`,
        ...stateVars.map(state => {
            const exampleValue = getExampleValue(state, state.type);
            return [
                `  ${formatAstInfoComment(state)}`,
                `  it("updates state variable '${astNameToString(state)}' correctly${formatSourceLineComment(state)}", () => {`,
                `    // Example value: ${exampleValue}`,
                `    // TODO: Render the component`,
                `    // TODO: Simulate state change for '${astNameToString(state)}'`,
                `    // TODO: Assert expected UI/logic after state change`,
                `    // act(() => { /* set ${astNameToString(state)} to ${exampleValue} */ });`,
                `    // expect(...).toBeInTheDocument();`,
                `  });\n`
            ].join('\n');
        }),
        `});`
    ];
    // Build and return the suggested test block for state variables
    return blockHelper({
        type: 'state',
        title: `State variables test for ${mainComponent}`,
        description: 'Tests that state changes produce the expected effects in the UI and internal logic, preventing inconsistencies.',
        code: codeLines.join('\n'),
        meta: { 
            stateVars, // List of state variables detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // enrichment: navigation/context mocks
        }
    });
}///end suggestStateBlock

// Event handlers test algorithm (event handlers, onClick, onChange, etc., )
// Reason: Ensures that event handlers trigger the expected logic upon user interactions, improving experience and robustness.
function suggestEventHandlersBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const handlers = Array.isArray(ast.eventHandlers) ? ast.eventHandlers : [];

    // use relevant names for handlers
    const usedNames = handlers.map(handler => handler.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // will return '' or `// Uses mock(s): ...`

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast);

    const codeLines = [
        `// Event handlers test for ${mainComponent}`,
        `describe('${mainComponent} event handlers', () => {\n`,
        ...handlers.map(handler => {
            const exampleValue = getExampleValue(handler, 'handler');
            return [
                `  ${formatAstInfoComment(handler)}`,
                `  it("triggers '${astNameToString(handler.name)}' correctly${formatSourceLineComment(handler)}", () => {`,
                `    // Example handler: ${exampleValue}`,
                `    // TODO: Render the component with handler prop set to mock`,
                `    // TODO: Simulate user interaction for '${astNameToString(handler.name)}'`,
                `    // TODO: Assert expected side effects/UI changes`,
                `    // fireEvent.${astNameToString(handler.name).replace('on', '').toLowerCase()}(element);`,
                `    // expect(...).toBeInTheDocument();`,
                `  });\n`
            ].join('\n');
        }),
        `});`
    ];
    
    // Build and return the suggested test block for event handlers
    return blockHelper({
        type: 'eventHandlers',
        title: `Event handlers test for ${mainComponent}`,
        description: 'Verifies that event handlers trigger the expected logic upon user interactions.',
        code: codeLines.join('\n'),
        meta: { 
            handlers, // List of event handlers detected
            mocks, // Any required mocks for dependencies
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines), // Whether React Testing Library is used
            mocksObjs // enrichment: navigation/context mocks
        }
    });
}///end suggestEventHandlersBlock

// Props test algorithm (props, component props, etc., )
// Reason: Validates that the component responds correctly to different prop values, preventing bugs and improving the public API.
function suggestPropsBlock(ast) {
    const mainComponent = ast.mainComponent?.name || "Component";
    const props = Array.isArray(ast.props) ? ast.props : [];

    // use relevant names for props
    const usedNames = props.map(prop => prop.name).filter(Boolean);
    const mocks = getAutoMocks(ast.imports, usedNames); // legacy string for comments

    // enrichment: navigation/context mocks
    const mocksObjs = generateUseMocks(ast, { usedNames });

    const codeLines = [
        `// Props test for ${mainComponent}`,
        `describe('${mainComponent} props', () => {\n`,
        ...props.map(prop => {
            const exampleValue = getExampleValue(prop, 'render');
            let expectLine = 'expect(...).toBeInTheDocument();';
            // Si es children y usamos el fragmento JSX, sugerir el expect adecuado
            if (prop.name && prop.name.toLowerCase() === 'children' && typeof exampleValue === 'string' && exampleValue.includes('data-testid="test-child"')) {
                expectLine = "expect(screen.getByTestId('test-child')).toBeInTheDocument();";
            }
            return [
                `  ${formatAstInfoComment(prop)}`,
                `  it(\"handles prop '${astNameToString(prop)}' correctly${formatSourceLineComment(prop)}\", () => {`,
                `    // Example value: ${exampleValue}`,
                `    // TODO: Render with prop '${astNameToString(prop)}' set to a test value`,
                `    // TODO: Assert expected behavior/UI change`,
                `    render(<${mainComponent} ${astNameToString(prop)}={${exampleValue}} />);`,
                `    ${expectLine}`,
                `  });\n`
            ].join('\n');
        }),
        `});`
    ];
    // writeLog(`Props block code lines:\n${codeLines.join('\n')}`, 'suggest-test-blocks.log');
    // Build and return the suggested test block for props
    return blockHelper({
        type: 'props',
        title: `Props test for ${mainComponent}`,
        description: 'Verifies that the component responds correctly to different prop values.',
        code: codeLines.join('\n'),
        meta: {
            props, // List of props detected
            mocks, // Legacy string for comments
            mocksObjs, // enrichment: navigation/context mocks
            usesTestingLibrary: isBlockUsingTestingLibrary(codeLines),
        }
    });
}///end suggestPropsBlock

/**
 * Helper: generate performance suggestions from analysis results
 * - Missing hook dependencies
 * - Unused hook dependencies
 * - Mutable hook dependencies
 * - Inline
 */
function generatePerformanceSuggestions(resultados) {
    const suggestions = [];

    // Hook dependencies
    const { missingDeps, unusedDeps, mutableDeps } = resultados.hooksDependences || {};
    if (missingDeps && missingDeps.length) {
        suggestions.push({
            type: "performance",
            title: "Missing hook dependencies",
            description: `Variables used in useEffect/useMemo/useCallback but not declared as dependencies: ${missingDeps.join(", ")}`,
            code: `// ⚠️ Performance: Missing hook dependencies: ${missingDeps.join(", ")}`,
            meta: { missingDeps }
        });
    }
    if (unusedDeps && unusedDeps.length) {
        suggestions.push({
            type: "performance",
            title: "Unused hook dependencies",
            description: `Variables declared as dependencies but not used: ${unusedDeps.join(", ")}`,
            code: `// ⚠️ Performance: Unused hook dependencies: ${unusedDeps.join(", ")}`,
            meta: { unusedDeps }
        });
    }
    if (mutableDeps && mutableDeps.length) {
        suggestions.push({
            type: "performance",
            title: "Mutable hook dependencies",
            description: `Mutable dependencies detected (may cause unnecessary renders): ${mutableDeps.join(", ")}`,
            code: `// ⚠️ Performance: Mutable hook dependencies: ${mutableDeps.join(", ")}`,
            meta: { mutableDeps }
        });
    }

    // Inline functions in JSX
    (resultados.inlineFunctionsInJSX || []).forEach(fn => {
        suggestions.push({
            type: "performance",
            title: "Inline function in JSX",
            description: `Inline ${fn.type} passed as prop/event handler '${fn.name}' at line ${fn.loc?.start?.line}`,
            code: `// ⚠️ Performance: Inline ${fn.type} in prop '${fn.name}' at line ${fn.loc?.start?.line}`,
            meta: fn
        });
    });

    // Expensive calculations in JSX/render
    (resultados.expensiveCalculationsInJSX || []).forEach(calc => {
        suggestions.push({
            type: "performance",
            title: "Expensive calculation in JSX",
            description: `Expensive calculation detected in JSX at line ${calc.loc?.start?.line}: ${calc.code}`,
            code: `// ⚠️ Performance: Expensive calculation in JSX at line ${calc.loc?.start?.line}: ${calc.code}`,
            meta: calc
        });
    });

    return suggestions;
}

/* ================================================================ */
// Registry of algorithms: each with type, condition, and function
const blockAlgorithms = [
    // Reason: Verifies that the component and its main elements render correctly, ensuring visual and functional integrity.
    {
        type: 'render',
        condition: results => results.returnedJSX.length || results.jsxElements.length,
        fn: suggestRenderBlock
        // [ENRICH] Here you can enrich with examples of props, dependency mocks, workspace info
    },
    // Reason: Tests that conditional elements appear/disappear based on state or props, covering alternative paths and UI logic.
    {
        type: 'conditional',
        condition: results => results.conditionalRendering.length,
        fn: suggestConditionalBlock
        // [ENRICH] Suggest examples of state/prop changes, data mocks, workspace info
    },
    // Reason: Validates that the component responds correctly to different prop values, preventing bugs and improving the public API.
    {
        type: 'props',
        condition: results => Array.isArray(results.props) && results.props.length,
        fn: suggestPropsBlock
        // [ENRICH] Provide examples of values for each prop, edge cases
    },
    // Reason: Ensures that event handlers trigger the expected logic upon user interactions, improving experience and robustness.
    {
        type: 'eventHandlers',
        condition: results => Array.isArray(results.eventHandlers) && results.eventHandlers.length,
        fn: suggestEventHandlersBlock
        // [ENRICH] Suggest event mocks, interaction examples, workspace info
    },
    // Reason: Tests that state changes produce the expected effects in the UI and internal logic, preventing inconsistencias.
    {
        type: 'state',
        condition: results => Array.isArray(results.stateVars) && results.stateVars.length,
        fn: suggestStateBlock
        // [ENRICH] Provide examples of state changes, initial and alternative values
    },
    // Reason: Verifies that external API calls are made correctly and handles results and errors, ensuring integration.
    {
        type: 'apiCalls',
        condition: results => Array.isArray(results.apiCalls) && results.apiCalls.length,
        fn: suggestApiCallsBlock
        // [ENRICH] Suggest API mocks, response examples, errors
    },
    // Reason: Tests that side effects (useEffect) are triggered correctly upon changes in their dependencies, covering side effects.
    {
        type: 'effects',
        condition: results => Array.isArray(results.effectDeps) && results.effectDeps.length,
        fn: suggestEffectsBlock
        // [ENRICH] Provide examples of dependency changes, side effect mocks
    },
    // Reason: Validates that the component handles errors correctly and displays appropriate responses, improving robustness and UX.
    {
        type: 'errorHandling',
        condition: results => Array.isArray(results.errorHandling) && results.errorHandling.length,
        fn: suggestErrorHandlingBlock
        // [ENRICH] Suggest examples of errors, throw mocks, edge cases
    },
    // Reason: Tests that the component responds correctly to different control branches (if, switch, etc.), covering alternative logic.
    {
        type: 'branches',
        condition: results => Array.isArray(results.branches) && results.branches.length,
        fn: suggestBranchesBlock
        // [ENRICH] Provide examples of conditions, alternative values, workspace info
    },
    // Reason: Verifies that the component integrates and responds correctly to the custom hooks used, ensuring context and shared logic.
    {
        type: 'customHooks',
        condition: results => Array.isArray(results.customHooks) && results.customHooks.length,
        fn: suggestCustomHooksBlock
        // [ENRICH] Suggest mocks/contexts for hooks, integration examples
    },
    // Reason: Tests that memoized values update correctly and optimize performance, avoiding unnecessary calculations/re-renders.
    {
        type: 'memoization',
        condition: results => Array.isArray(results.memoization) && results.memoization.length,
        fn: suggestMemoizationBlock
        // [ENRICH] Suggest examples of dependency changes, re-render edge cases
    },
    // Reason: Validates that internal helper functions work correctly and integrate well with the component, covering key logic.
    {
        type: 'internalFunctions',
        condition: results => Array.isArray(results.internalFunctions) && results.internalFunctions.length,
        fn: suggestInternalFunctionsBlock
        // [ENRICH] Suggest examples of inputs/outputs, edge cases, integration with the component
    },
    // Reason: PropTypes help prevent type errors and document the component's API. Testing them ensures that received props meet constraints and the component responds correctly to invalid values.
    {
        type: 'propTypes',
        condition: results => Array.isArray(results.propTypes) && results.propTypes.length,
        fn: suggestPropTypesBlock
        // [ENRICH] Suggest examples of valid and invalid values, asserts of warnings/errors
    },
    // Reason: Tests that the component correctly consumes React Context values and responds to context changes, ensuring integration and decoupling.
    {
        type: 'context',
        condition: results => Array.isArray(results.contexts) && results.contexts.length,
        fn: suggestContextBlock
        // [ENRICH] Suggest mocks/providers of contexts, examples of values
    },
    // Reason: Verifies that the component is wrapped by a Higher-Order Component (HOC) and that the integration and behavior of the HOC work correctly.
    {
        type: 'hoc',
        condition: results => results.exportDefault && results.exportDefault.isHOC,
        fn: suggestHOCBlock
        // [ENRICH] Suggest mocks of the HOC, integration asserts, examples of props/context
    },
    {
        type: 'performance',
        condition: results => {
            const perf = results.performance || {};
            return (perf.missingDeps && perf.missingDeps.length) ||
                (perf.unusedDeps && perf.unusedDeps.length) ||
                (perf.mutableDeps && perf.mutableDeps.length) ||
                (perf.inlineFunctionsInJSX && perf.inlineFunctionsInJSX.length) ||
                (perf.expensiveCalculationsInJSX && perf.expensiveCalculationsInJSX.length);
        },
        fn: generatePerformanceSuggestions
        // [ENRICH] Suggest optimizations, refactoring examples, performance best practices
    },
];///end registry block algorithms