// scripts/suggest-helpers.mjs
// Helpers for suggested test blocks based on AST analysis
// Modularized for DRY and reuse

//writeLog from utils
import { writeLog } from './generate/utils.mjs';

// Indicators of Testing Library usage in test blocks
const TESTING_LIBRARY_INDICATORS = [
    'render(',
    'screen.',
    'fireEvent.',
    'waitFor(',
    'waitForElementToBeRemoved(',
    'within(',
    'userEvent.',
    'act(',
    'findBy',
    'getBy',
    'queryBy',
    'findAllBy',
    'getAllBy',
    'queryAllBy',
    '@testing-library/react',
];

// Name patterns for heuristics by name
const NAME_STRING = ['name', 'label', 'text', 'title'];
const NAME_NUMBER = ['count', 'age', 'total', 'amount', 'id'];
const NAME_BOOLEAN = ['is', 'has', 'enabled', 'active'];
const NAME_ARRAY = ['list', 'items', 'values'];
const NAME_OBJECT = ['data', 'info', 'meta'];

// Basic reusable types for heuristics (arrays of synonyms)
const TYPE_STRING = ['string'];
const TYPE_NUMBER = ['number', 'int', 'float', 'double'];
const TYPE_BOOLEAN = ['boolean', 'bool'];
const TYPE_ARRAY = ['array'];
const TYPE_OBJECT = ['object'];

// Additional types for handlers
const TYPE_FUNCTION = ['function', 'func', 'handler', 'callback'];

// MModules to exclude from automatic mocks
const EXCLUDE_AUTOMOCKS = [
    'react', 'react-dom', '@testing-library/react', 'classnames', 'next/navigation', 'react-hot-toast', 'react-spinners'
    // Add here other modules that should never be mocked
];


/**
 * generateUseRouterMock
 * Devuelve el string de mock de useRouter si corresponde, o null si no aplica.
 * @param {object} ast - Resultado del análisis AST (de analyzeASTHelper)
 * @returns {object|null} Código de mock o null
 */
export function generateUseRouterMock(ast) {
    const hasUseRouterImport = Array.isArray(ast.imports) && ast.imports.some(imp => imp.source === 'next/navigation' && imp.specifiers.includes('useRouter'));
    const hasUseRouterCall = Array.isArray(ast.hooks) && ast.hooks.some(h => h.name === 'useRouter');
    if (hasUseRouterImport && hasUseRouterCall) {
        const code = [
            `jest.mock("next/navigation", () => ({`,
            `  ...jest.requireActual("next/navigation"),`,
            `  useRouter: jest.fn(() => ({`,
            `    push: jest.fn(),`,
            `    replace: jest.fn(),`,
            `    prefetch: jest.fn(),`,
            `    back: jest.fn(),`,
            `    forward: jest.fn(),`,
            `    refresh: jest.fn(),`,
            `    pathname: "/mock-path",`,
            `    query: {},`,
            `    asPath: "/mock-path"`,
            `  }))`,
            `}));`
        ].join('\n');
        return {
            code,
            type: "next/navigation",
            extended: true
        };
    }
    return null;
}

/**
 * isBlockUsingTestingLibrary
 * Determines if a code block uses Testing Library
 * @param {string[]|string} codeLines - Array of code lines or full string
 * @returns {boolean}
 */
export function isBlockUsingTestingLibrary(codeLines) {
    if (!codeLines) return false;
    const lines = Array.isArray(codeLines) ? codeLines : String(codeLines).split('\n');
    return lines.some(line =>
        TESTING_LIBRARY_INDICATORS.some(indicator => line.includes(indicator))
    );
}

/**
 * generateUseMocks
 * Centralizes the generation of navigation/context mocks (useParams, useRouter, useSearchParams, etc.)
 * @param {object} ast - Result of AST analysis
 * @returns {Array<object>} Array of mock objects
 */
export function generateUseMocks(ast) {
    const mocks = [];
    const useParams = generateUseParamsMock(ast);
    if (useParams) mocks.push(useParams);
    const useRouter = generateUseRouterMock(ast);
    if (useRouter) mocks.push(useRouter);
    // Here you can add more helpers like generateUseSearchParamsMock, etc.
    return mocks;
}

/**
 * getExampleValue
 * Centralized heuristic to obtain an example value for a prop, state, context, handler, etc.
 * - Receives a definition object (prop, state, etc.) and a usage type ("prop", "state", ...)
 * - Returns an appropriate example value based on type, name, constraints, etc.
 * - Designed to be easily extended with more heuristics and types.
 *
 * @param {object} def - Definition object (prop, state, etc.)
 * @param {string} [usageType="prop"] - Usage type ("prop", "state", "context", "handler", ...)
 * @returns {any} Suggested example value
 */
export function getExampleValue(def, usageType = "prop") {
    if (!def || typeof def !== 'object') return undefined;
    const typeRaw = def.type || def.valueType || def.tsType || '';
    const type = String(typeRaw).toLowerCase();
    const name = def.name || def.key || '';
    const nameLower = String(name).toLowerCase();

    // 1. Prioritize hints extracted from the AST
    if (def.exampleArray) return def.exampleArray;
    if (def.possibleValues && Array.isArray(def.possibleValues) && def.possibleValues.length)
        return JSON.stringify(def.possibleValues[0]);
    if (def.defaultValue !== undefined)
        return JSON.stringify(def.defaultValue);

    // 2. Classic constraints (enum, default)
    if (def.enum && Array.isArray(def.enum) && def.enum.length) return JSON.stringify(def.enum[0]);
    if (def.default !== undefined) return JSON.stringify(def.default);

    // 4. Heuristic by type/usage
    switch (usageType) {
        case 'render':
            return getRenderExample(type, nameLower);
        case 'handler':
            return getHandlerExample(type, nameLower);
        case 'state':
        case 'context':
        case 'prop':
        default:
            return getGeneralExample(type, nameLower);
    }
}

/**
 * getRenderExample specific for render props
 * @param {string} type - Type string
 * @param {string} nameLower - Lowercase name string
 * @returns {any} Suggested example value
 */
function getRenderExample(type, nameLower) {
    
    // 3. Special heuristic for children
    if (nameLower === 'children') {
        // Returns a JSX fragment with data-testid
        return '<span data-testid="test-child">Test</span>';
    }
    // Then, use general heuristic
    return getGeneralExample(type, nameLower);
}

/**
 * getHandlerExample specific for handlers/event props
 */
function getHandlerExample(type, nameLower) {
    if (TYPE_FUNCTION.some(t => type.includes(t))) return 'jest.fn()';
    if (nameLower.includes('handler') || nameLower.includes('callback') || nameLower.startsWith('on')) return 'jest.fn()';
    return 'jest.fn()';
}

/**
 * getGeneralExample for props, state, context, etc.
 */
function getGeneralExample(type, nameLower) {
    if (TYPE_STRING.some(t => type.includes(t))) return '"example"';
    if (TYPE_NUMBER.some(t => type.includes(t))) return 42;
    if (TYPE_BOOLEAN.some(t => type.includes(t))) return true;
    if (TYPE_ARRAY.some(t => type.includes(t))) return '[1, 2, 3]';
    if (TYPE_OBJECT.some(t => type.includes(t))) return '{ foo: "bar" }';

    if (NAME_STRING.some(pat => nameLower.includes(pat))) return '"example"';
    if (NAME_NUMBER.some(pat => nameLower.includes(pat))) return 42;
    if (NAME_BOOLEAN.some(pat => nameLower.startsWith(pat))) return true;
    if (NAME_ARRAY.some(pat => nameLower.includes(pat))) return '[1, 2, 3]';
    if (NAME_OBJECT.some(pat => nameLower.includes(pat))) return '{ foo: "bar" }';

    return 'null';
}

/* ================================================================ */
// HELPERS AND UTILITIES
/**
 * handlerContextsMockAndImport
 * Generate the import, the mock, and the provider wrapper for a detected context.
 * @param {object} contextInfo - { contextName, contextPath, valueShape }
 * @returns {object} { context: {...}, contextMeta: {...} }
 */
export function handlerContextsMockAndImport(contextInfo) {
    if (!contextInfo || typeof contextInfo !== 'object') return {};
    let { contextName, contextPath, valueShape, type, ...rest } = contextInfo;
    if (!contextName) return {};

    // If no contextPath (local context), use a relative/local path
    if (!contextPath || typeof contextPath !== 'string' || !contextPath.length) {
        // By convention, you could use './' + contextName or a special marker
        contextPath = `./${contextName}`;
    }

    // Enriched example value
    const exampleValue = typeof getExampleValue === 'function'
        ? getExampleValue(contextInfo, 'context')
        : undefined;

    // Mock value (shape can be object, array, primitive, etc.)
    let mockValue = '{}';
    if (valueShape && typeof valueShape === 'object') {
        try {
            mockValue = JSON.stringify(valueShape, null, 2);
        } catch {
            mockValue = '{}';
        }
    } else if (typeof valueShape === 'string') {
        const cleanStr = valueShape.replace(/^['"]|['"]$/g, '');
        mockValue = `'${cleanStr}'`;
    } else if (typeof valueShape === 'number' || typeof valueShape === 'boolean') {
        mockValue = String(valueShape);
    }

    // Import and mock lines
    const importLine = `import { ${contextName} } from "${contextPath}";`;
    const mockVarName = `mock${contextName}Value`;
    const mockLine = `const ${mockVarName} = ${mockValue};`;

    // Provider wrapper (to use in render)
    const providerWrapper = (children = '...') =>
        `<${contextName}.Provider value={${mockVarName}}>${children}</${contextName}.Provider>`;

    // Enriched object
    return {
        context: {
            contextName,
            contextPath,
            type,
            ...rest
        },
        contextMeta: {
            importLine,
            mockLine,
            providerWrapper,
            mockVarName,
            mockValue,
            exampleValue
        }
    };
}

// Helper to structure suggested test blocks
export function blockHelper({ type, title, description, code, meta = {} }) {
    return {
        type,
        title,
        description,
        code,
        meta,
    };
}

// Helper to generate a comment with AST info for a single object
export function formatAstInfoComment(obj) {
    if (!obj || typeof obj !== 'object') return '';
    // Avoid serializing full loc (can be very large)
    const { loc, ...rest } = obj;
    const locShort = loc && loc.start && typeof loc.start.line === 'number' ? `line: ${loc.start.line}` : undefined;
    const info = { ...rest };
    if (locShort) info.loc = locShort;
    const str = JSON.stringify(info);
    return Object.keys(info).length ? `// AST info: ${str}` : '';
}

// Helper to generate a source line comment for a single AST object
// Returns string like '// Source line: 259' or ''
export function formatSourceLineComment(obj) {
    const line = obj?.loc?.start?.line;
    return typeof line === 'number' ? ` (Source line: ${line})` : '';
}

/**
 * Robustly serializes AST node names or values for test descriptions.
 * Handles strings, numbers, arrays, objects with .name, .id, .key, etc. Falls back to JSON or string conversion if needed.
 */
export function astNameToString(node) {
    if (node == null) return '';
    switch (typeof node) {
        case 'string':
        case 'number':
            return String(node);
        case 'object':
            if (Array.isArray(node)) {
                // Map each element recursively and join non-empty results
                return node.map(astNameToString).filter(Boolean).join(', ');
            }
            // Try common AST node properties for a readable name
            const candidates = [
                node.name,
                node.id && node.id.name,
                node.key && node.key.name,
                node.property && node.property.name,
                node.callee && node.callee.name,
                node.type && typeof node.type === 'string' && node.type !== 'Identifier' ? node.type : undefined
            ];
            for (const candidate of candidates) {
                if (candidate) return astNameToString(candidate);
            }
            // Fallback: try toString or JSON
            if (typeof node.toString === 'function' && node.toString !== Object.prototype.toString) {
                return node.toString();
            }
            try {
                // Map object keys for a more readable string if possible
                const mapped = Object.entries(node)
                    .filter(([k, v]) => typeof v === 'string' || typeof v === 'number')
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ');
                if (mapped) return `{ ${mapped} }`;
                return JSON.stringify(node);
            } catch {
                return '[Unknown AST Node]';
            }
        default:
            return String(node);
    }
}///end astNameToString

/**
 * Helper: Automatically gets relevant mocks from AST imports.
 * Excludes only known core and testing modules.
 *
 * getAutoMocks(imports, usedNames)
 * - imports: array of imports extracted from the AST
 * - usedNames: array/set of relevant names used in the block (optional)
 * If usedNames is present, only returns mocks for imports whose specifiers match any used name.
 * Returns a comment string with suggested mocks, deduplicated.
 */
export function getAutoMocks(imports, usedNames = null) {

    if (!Array.isArray(imports)) return '';
    let results = [];
    if (!usedNames || (!Array.isArray(usedNames) && !(usedNames instanceof Set))) {
        results = imports
            .filter(imp => imp.source && !EXCLUDE_AUTOMOCKS.some(ex => imp.source === ex))
            .map(imp => imp.source);
    } else {
        const usedSet = new Set(Array.isArray(usedNames) ? usedNames : usedNames);
        results = imports
            .filter(imp => {
                if (!imp.source || EXCLUDE_AUTOMOCKS.some(ex => imp.source === ex)) return false;
                if (Array.isArray(imp.specifiers)) {
                    return imp.specifiers.some(spec => {
                        if (usedSet.has(spec)) return true;
                        for (const name of usedSet) {
                            if (typeof name === 'string' && name.includes('.') && spec === name.split('.')[0]) return true;
                        }
                        return false;
                    });
                }
                return false;
            })
            .map(imp => imp.source);
    }
    const uniqueResults = Array.from(new Set(results));
    const mockLines = uniqueResults.length
        ? `// Uses mock(s): ${uniqueResults.map(m => `'${m}'`).join(', ')} (customize if needed)`
        : '';
    return mockLines.trimEnd();
}

/**
 * getTestBlockImportsAndMocks
 * Centralizes the deduplication and generation of imports, mocks, and helpers for suggested test blocks.
 * Receives imports, mocks, context helpers, etc. and returns a structured object to integrate into meta and/or code.
 *
 * @param {object} params - { imports, mocks, contextsHelpers, ... }
 * @returns {object} { importLines, mockLines, contextsHelpers, ... }
 */
export function getTestBlockImportsAndMocks(params) {
    // TODO: Implement deduplication and structuring logic
    // Receives arrays/objects of imports, mocks, helpers, etc. and returns lines ready to integrate
}

/**
 * generateUseParamsMock
 * Returns the mock string for useParams if applicable, or '' if not.
 * @param {object} ast - Result of AST analysis (from analyzeASTHelper)
 * @returns {string} Mock code or ''
 */
export function generateUseParamsMock(ast) {
    const hasUseParamsImport = Array.isArray(ast.imports) && ast.imports.some(imp => imp.source === 'next/navigation' && imp.specifiers.includes('useParams'));
    const hasUseParamsCall = Array.isArray(ast.hooks) && ast.hooks.some(h => h.name === 'useParams');
    const paramsKeys = Array.isArray(ast.paramsKeys) ? ast.paramsKeys : [];
    if (hasUseParamsImport && hasUseParamsCall && paramsKeys.length > 0) {
        const paramsObj = paramsKeys.map(k => `  "${k}": "mocked_${k}"`).join(',\n');
        const code = [
            `jest.mock("next/navigation", () => ({`,
            `  ...jest.requireActual("next/navigation"),`,
            `  useParams: jest.fn(() => ({\n${paramsObj}\n  }))`,
            `}));`
        ].join('\n');
        return {
            code,
            type: "next/navigation",
            extended: true
        };
    }
    return null;
}