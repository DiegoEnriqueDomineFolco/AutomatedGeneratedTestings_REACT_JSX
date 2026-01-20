// scripts/gen-test-babel.mjs

/**
 * Script to auto generate enriched Jest test files for React/JSX source files
 * Analyze React/JSX source files with Babel,
 * extract relevant information and suggest automatic test blocks.
 * Can be extended to generate complete tests.
 * Uses @babel/parser to parse the source code. (official Babel library)
 * Uses @babel/traverse to walk the AST and extract info. (official Babel library)
 * Uses jest-test-gen to auto-create test skeletons, generating and detecting imports, mocks, and basic structure.
 * (Library included in the awesome-jest package list maintained by the Jest community (jest-community))
 * 
 * Requires prior installation of dependencies:
 * npm install @babel/parser @babel/traverse
 * npm install jest-test-gen
 * 
 * 
 * Objectives:
 * - Read a React/JSX source file
 * - Parse with Babel to obtain the AST
 * - Traverse the AST to extract functions, props, hooks, etc.
 * - Suggest test blocks based on internal logic
 * - Write or enrich an existing test file
 * 
 * 
 * Steps...
 * 2. Parse source file with Babel (@babel/parser)
 * 3. Traverse AST and extract relevant info (@babel/traverse)
 * 4. Generate suggestions for test blocks <<<--- up to here (having refactored and modularized AST, analysis, suggestions, etc.)
 * 5. Analyze source file and generate basic skeleton file (jest-test-gen)
 * 6. Analyze generated test file (@babel/parser + traverse)
 * 7. Interpret both results and enrich test file
 * 8. Write/enrich test file
 * ===>>> Final file ready to run with Jest!
 * 
 * Extras:
 * 9. Extensibility: configuration, logging, etc.
 * 10. ????
 * 
 * FILES:
 * - ./scripts/gen-test-babel.mjs (this file, main process)
 * - ./scripts/analyze-ast-helper.mjs (Babel traverse main fns for AST analysis)
 * - ./scripts/ast-helpers.mjs (AST analysis helpers functions)
 * - ./scripts/suggest-test-blocks.mjs (Test block suggestion generator)
 * - ./scripts/suggest-test-blocks-helpers.mjs (Test block suggestion helper functions)
 * - ./scripts/jest-test-gen-helpers.mjs (Jest test skeleton generator and integrator)
 * - ./scripts/utils.mjs (General utilities for file reading, parsing, etc.)
 * - ./generate/config.mjs (Configuration file for paths, options, etc.)
 * 
 */

// jest → the main testing engine.
// @testing-library/react → for testing React components.
// @testing-library/jest-dom → adds useful matchers like toBeInTheDocument().
// babel-jest → allows using ESModules (import/export) with Jest.
// identity-obj-proxy → mocks CSS/style file imports to avoid errors in tests.
// jest-environment-jsdom → no longer included by default with Jest since version 28. Your Jest config requires it to run tests in a simulated browser environment.


/**************************/
// IMPORTS
/**************************/
import fs from "fs"; // File system module
import path from "path"; // Path module
import { getAllFiles, getParsedSource } from './generate/utils.mjs'; // General utilitys

import { analyzeASTHelper } from './analyze-ast-helper.mjs'; // AST analysis helper
import { suggestTestBlocks } from './suggest-test-blocks.mjs'; // Test block suggestion generator
import { createBasicTestSkeleton, createIntegratedTestFile } from './jest-test-gen-helpers.mjs'; // Jest test skeleton generator

/* ================================================================
CONFIGURATION, redefine to override config.mjs values
--------------------------------------------------------------- */

//importing config
import config from "./config.mjs";
const { baseDir, excludeFolders, validExtensions, dividerLine } = config;

/* ================================================================
BEGINNING MAIN PROCESS
--------------------------------------------------------------- */

function runThis() {
    console.log("Starting AST analysis and automatic test suggestion...");

    // Set global log filename for this execution (timestamped)
    const now = new Date();
    const iso = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, ''); // e.g. 20251215T153000
    globalThis.ISO_EXEC_TIMESTAMP = iso;
    const logNameDefault = `debug_${iso}.log`;
    // const logNameLive = `debug_live_${iso}.log`;
    // globalThis.DEFAULT_LOG_FILENAME = logNameDefault;
    // globalThis.LIVE_LOG_FILENAME = logNameLive;
    console.log(`Log file path for this execution: ${path.join(process.cwd(), logNameDefault)}`);
    console.log(`LogLive file path for this execution: ${path.join(process.cwd(), `debug_live_${iso}.log`)}`);

    // getting all the files to process (conditions configured in config.mjs)
    const allFiles = getAllFiles(baseDir, excludeFolders, validExtensions);
    // console.log(`RAW results found:\n${JSON.stringify(allFiles, null, 2)}`);

    // process files - one by one
    // - decoding (babel/parser), 
    // - interpreting (analyze/traverse),
    // - creating basic test skeleton (jest-test-gen)
    // - suggesting test blocks (suggest-test-blocks)
    // - merge results
    // - write/enrich test file
    // - enjoy! :)
    processFiles(allFiles);
}


/* ================================================================
    EXECUTION
    --------------------------------------------------------------- */
runThis();
/* ================================================================ */

/* ================================================================
    MAIN PROCESSING FUNCTIONS
    --------------------------------------------------------------- */

/**
 * Processing files one by one
 */
function processFiles(files) {

    let codeSource = "";

    // 1. Reading source files
    files.forEach(file => {
        console.log(`\n\n=== Processing file: ${file} ===`);

        // reading source code
        codeSource = fs.readFileSync(file, "utf8");

        // getting extension to decide parsing plugins
        const fileExtension = path.extname(file);

        // 2. parsing with @babel/parser, adapted to extension
        const astSource = getParsedSource(codeSource, fileExtension);
        // writeLog(`AST parsed for file ${file}: ${JSON.stringify(astSource, null, 2)}`, 'gen-test-babel.log');


        // 3. Interpreting & Decoding AST(Abstract Syntax Tree) and extracting functions, parameters, etc. 
        // const interpretedSource = interpretAST(astSource); // @babel/traverse 
        const interpretedSource = analyzeASTHelper(astSource); // @babel/traverse 
        // writeLog(`AST interpreted for file ${file}: ${JSON.stringify(interpretedSource, null, 2)}`, 'gen-test-babel.log');

        // test block suggestion generation
        const suggestedTestBlocks = suggestTestBlocks(interpretedSource);
        // writeLog(`Test blocks suggested for file ${file}: ${JSON.stringify(suggestedTestBlocks, null, 2)}`, 'gen-test-babel.log');

        // console.log("\n=== Test block suggestions generated: ===\n");
        // console.log(JSON.stringify(suggestedTestBlocks, null, 2));
        // console.log("\n=== End of suggestions ===\n");

        // 4. Generate basic test skeleton (jest-test-gen), configured to output in __tests__ folder with .test suffix
        const skeletonResult = createBasicTestSkeleton(file);
        // writeLog(`Basic test skeleton created for file ${file}: ${JSON.stringify(skeletonResult, null, 2)}`, 'gen-test-babel.log');

        // 5. Integrate suggested test blocks into generated test file
        if (skeletonResult && skeletonResult.generatedTestPathBasic) {
            //if the files is created and integrated successfully, the process continues with cleaning
            createIntegratedTestFile(
                skeletonResult.generatedTestPathBasic,
                suggestedTestBlocks,
                skeletonResult.importLines,
                skeletonResult.mockLines
            );
        }

    });
}
/* ================================================================ */