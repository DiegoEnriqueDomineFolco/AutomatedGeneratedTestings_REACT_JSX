// scripts/config.js

//  **** Features Checklist and Real Examples
// Basic render + Conditionals + Props + Event Handlers + State + API Calls + useEffect + Error Handling + Complex Branches
// ./src/components/dashboard/entities/entity/OfferingCreate.jsx
// Custom Hooks and Memoization (useMemo, useCallback)
//     src\hooks\useDataExportLogic.js
// Internal Helpers
//     src\helpers\createInitialAssetObject.js
// PropTypes (NOT FOUND DIRECTLY) GENERATED TO TEST FUNCTIONALITY
//    ./scripts/ExampleComponentWithPropTypes.js
// Context (useContext, createContext)
//     src\contexts\DataExportContext.jsx, 
//     src\context\appContext.js
// HOC (Higher-Order Components)
//     src\app\dashboard\[organization]\(offerings)\page.jsx
//     src\app\dashboard\[organization]\docs\page.jsx
//     src\app\dashboard\[organization]\users\page.jsx

/* ================================================================
 CONFIGURATION - auto test generation (babel & jest-test-gen)
  --------------------------------------------------------------- */

// Array of paths or single path (string) to process
const whereToLook = [
  // "./src/components/dashboard/entities/entity/OfferingCreate.jsx",
  // "./src/hooks/useDataExportLogic.js",
  // "./src/helpers/createInitialAssetObject.js",
  // "./scripts/ExampleComponentWithPropTypes.js",
  "./src/contexts/DataExportContext.jsx",
  // "./src/context/appContext.js",
  // "./src/app/dashboard/[organization]/(offerings)/page.jsx",
  // "./src/app/dashboard/[organization]/docs/page.jsx",
  // "./src/app/dashboard/[organization]/users/page.jsx",
];

export default {
  // baseDir: array of paths or single path (string) to process
  baseDir: whereToLook,
  
  // array of folder names to ignore
  excludeFolders: ["__tests__", "BASE__tests__", "node_modules", ".next", "tailwind.config.js"], 
  
  // array of valid extensions to process
  validExtensions: [".js", ".jsx", ".ts", ".tsx", ".mjs"],
  
  // dryRun = false to actually write changes; dryRun = true to only simulate and show diff in logs
  // (only for comment generation processes)
  dryRun: false,
  
  // flag string to identify generated code blocks & file header block
  // used to detect and remove previously generated comments; generation & degeneration processes
  // IMPORTANT: keep this string in sync with the one used in generate-comments-jsdoc.mjs, otherwise if there are
  // blocks generated with a different flag they will not be detected for removal or re-running the generator!!!
  flagCodeBlocks: "Automated Testing Block - Do Not Change",

  dividerLine: "================================================",
  
  // Add other configuration options as needed
};
