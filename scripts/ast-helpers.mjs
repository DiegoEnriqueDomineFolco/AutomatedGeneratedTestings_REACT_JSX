// scripts/ast-helpers.mjs
// Central AST helpers for pattern detection and extraction
// Modularized for DRY and reusability

/**
 * Helpers for pattern detection and extraction in AST
 */

// // // CONSTANTS AND PATTERNS

// Core patterns
export const CORE_HOOKS = new Set([
  "useState", "useEffect", "useMemo", "useCallback", "useContext", "useReducer", "useRef", "useImperativeHandle", "useLayoutEffect", "useDebugValue"
]);
export const EVENT_HANDLER_REGEX = /^on[A-Z]/;
export const API_CALLS = new Set(["fetch", "axios", "createClient"]);
export const SUPABASE_METHODS = new Set(["from", "auth", "channel", "removeChannel", "signOut"]);
export const MEMOIZATION = new Set(["useMemo", "useCallback", "React.memo"]);
export const ERROR_HANDLING = new Set(["try/catch", "throw"]);
export const CONDITIONAL_RENDERING = new Set(["LogicalExpression", "ConditionalExpression"]);
// const BRANCHING_STATEMENTS = new Set(["IfStatement", "SwitchStatement", "ForStatement", "WhileStatement", "DoWhileStatement"]);
const DECLARATION_TYPES = new Set(["VariableDeclarator", "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectProperty", "ClassDeclaration"]);


// // // HELPERS AND EXTRACTORS

// Helper: Get the main exported component name
export function getMainComponentName(ast) {
  return ast.exportDefault?.name || ast.exportDefault?.wrappedComponent || "Component";
}

// Helper: Extract props from destructured parameters
export function extractPropsFromParams(params) {
  const props = [];
  params.forEach(param => {
    if (param.type === "ObjectPattern") {
      param.properties.forEach(prop => {
        if (prop.key && prop.key.name) props.push(prop.key.name);
      });
    }
  });
  return props;
}

// Helper: Extract component name from JSXElement
export function getJSXElementName(node) {
  if (!node) return null;
  if (node.type === "JSXElement") {
    return node.openingElement.name.name;
  }
  if (node.type === "JSXFragment") {
    return "Fragment";
  }
  return null;
}

// Helper: Detect if a name corresponds to a custom hook
export function isCustomHook(name) {
  return name.startsWith("use") && !CORE_HOOKS.has(name);
}

// Helper: Detect if a name corresponds to an event handler
export function isEventHandler(name) {
  return EVENT_HANDLER_REGEX.test(name);
}

// Helper: Detect if a name corresponds to an API call
export function isApiCall(name) {
  return API_CALLS.has(name);
}

// Helper: Detect if a name corresponds to memoization
export function isMemoization(name) {
  return MEMOIZATION.has(name);
}

// Helper: Detect if a type corresponds to conditional rendering
export function isConditionalRendering(type) {
  return CONDITIONAL_RENDERING.has(type);
}

// Helper: Detect if a name corresponds to error handling
export function isErrorHandling(type) {
  return ERROR_HANDLING.has(type);
}

// Helper: Detect if a node is a declaration (variable, function, class, etc.)
export function isDeclarationNode(type) {
  return DECLARATION_TYPES.has(type);
}