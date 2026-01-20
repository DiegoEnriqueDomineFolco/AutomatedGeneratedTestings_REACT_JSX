// scripts/generate/jest-test-gen-helpers.mjs
// 
// ================================================================

//imports
import path from "path";
import fs, { write } from "fs";
import { execSync } from 'child_process';

import { cleanBasicTest } from './clean-final-test.mjs';
import { group } from "console";

import { writeLog } from './generate/utils.mjs'; // General utilitys

/* ================================================================
  MAIN HANDLERS EXPORT: createBasicTestSkeleton, createIntegratedTestFile
--------------------------------------------------------------- */

// Integrating suggested test blocks into the generated test file
// Appends suggested test blocks at the end of the generated test file
export function createIntegratedTestFile(generatedTestPath, suggestedTestBlocks, importLinesSet, mockLinesSet) {
  console.log(`Integrating file...: ${generatedTestPath} ...`);


  // insert everything at the end of the file
  try {
    let content = fs.readFileSync(generatedTestPath, 'utf-8');

    content = content.trimEnd();

    let newContent = '';

    // For now, sacamos duplicados en meta. y meta.contextsHelpers[importLine] & [mockLine] & [mockVarName]
//  writeLog(true, `[createIntegratedTestFile] Suggested Test Blocks BEFORE cleaning: ${JSON.stringify(suggestedTestBlocks, null, 2)}`, 'gen-test-babel.log');
    const cleanedSuggestedTestBlocks = cleanSuggestedTestBlocks(suggestedTestBlocks);
//  writeLog(true, `[createIntegratedTestFile] Suggested Test Blocks AFTER cleaning: ${JSON.stringify(cleanedSuggestedTestBlocks, null, 2)}`, 'gen-test-babel.log');    

    let linesAdded = {
      importedLines: new Set(),
      mockedLines: new Set(),
      testingLibraryLines: new Set(),
      globalMockLines: new Set()
    };

    // 1. Add grouped imports
    const importLines = allImportLines(cleanedSuggestedTestBlocks);
    // newContent += importLines;
    importLines.split('\n').forEach(line => {
      if (line.trim()) linesAdded.importedLines.add(line.trim());
    });
    // console.log('IMPORT LINES ADDED createIntegratedTestFile>>:', linesAdded.importedLines);

    // 2. Add grouped mocks
    const mockLines = allMockLines(cleanedSuggestedTestBlocks);
    // newContent += mockLines;
    mockLines.split('\n').forEach(line => {
      if (line.trim()) linesAdded.mockedLines.add(line.trim());
    });
    // console.log('ALLMOCKLINES from SUGGstns createIntegratedTestFile>>:', linesAdded.mockedLines);

    // 3. Add imports/mocks of Testing Library if applicable
    const libraryLines = allLibraryLines(cleanedSuggestedTestBlocks);
    libraryLines.split('\n').forEach(line => {
      if (line.trim()) linesAdded.testingLibraryLines.add(line.trim());
    });
    // console.log('TESTING LIBRARY LINES ADDED createIntegratedTestFile>>:', linesAdded.testingLibraryLines);

    // NEW: Add global mocks (like useParamsMock) before suggested blocks
    const globalMockLines = allGlobalMockLines(cleanedSuggestedTestBlocks);
    linesAdded.globalMockLines.add(globalMockLines);
    // console.log('GLOBALMOCKLINES >>:', linesAdded.globalMockLines);

    let allLinesSoFar = '';
    allLinesSoFar = mergeLines(importLinesSet, mockLinesSet, linesAdded, content);
    
    // console.log('ALL ADDED LINES MERGED & GROUPED & NORMALIZED createIntegratedTestFile>>:', allLinesSoFar);
    // console.log('CONTENT BEFORE ANYTHING createIntegratedTestFile>>:\n', content);
    
    newContent = allLinesSoFar;

    ///just testing debug
    newContent += '\n// --------------------HEADERS merged --------------------\n';

    newContent += '\n\n' + suggestedTestBlocksHeader;

    // 4. Insert suggested code blocks
    newContent += allBlockLines(cleanedSuggestedTestBlocks);
    // writeLog(false, `Inserted suggested test blocks into ${generatedTestPath}:\n${allBlockLines(cleanedSuggestedTestBlocks)}`, 'gen-test-babel.log');

    // ADD label '.complete' at the end of the file name to indicate it's integrated with suggestions
    generatedTestPath = generatedTestPath + '.complete';

    fs.writeFileSync(generatedTestPath, newContent, 'utf-8');
    console.log(`Integrated final file created ::==>> ${generatedTestPath}`);
    // writeLog(false, `Integrated final file created ::==>> ${generatedTestPath}`);
  } catch (err) {
    console.error(`Error integrating test blocks in ${generatedTestPath}:`, err.message);
  }
}///end createIntegratedTestFile

// Generating basic test skeleton using jest-test-gen library
// Output placed in __tests__ folder alongside source file, with .test suffix
export function createBasicTestSkeleton(filePath) {
  console.log(`Generating skeleton test from ::==>> ${filePath}`);
  // writeLog(false, `Generating skeleton test from ::==>> ${filePath}`);

  try {
    // Generate destination path and final name
    const dirName = path.dirname(filePath);
    const baseName = path.basename(filePath);
    const extName = path.extname(baseName);
    const nameWithoutExt = baseName.replace(extName, '');
    
    // absolute path to __tests__ folder
    const testDir = path.resolve(dirName, '__tests__');


    // creating __tests__ folder if not exists
    fs.mkdirSync(testDir, { recursive: true });

    // executing jest-test-gen command with options
    execSync(`npx jest-test-gen "${filePath}" --outputDir "${testDir}" --fileSuffix .test`, { stdio: 'inherit' });
    const testFileNameSkeleton = `${nameWithoutExt}.test${extName}`; // basic file generated by jest-test-gen
    const generatedTestPath = path.join(testDir, testFileNameSkeleton);

    const testFileNameBasic = `${nameWithoutExt}.test${extName}`; // ordered/cleaned basic test file
    const generatedTestPathBasic = path.join(testDir, testFileNameBasic);
    //cleaning basic test file to remove all lines except imports and mocks
    cleanBasicTest(generatedTestPath);

    // Normalizing generated test file,
    // fixing paths for imports & jest.mocks, jest-test-gen does not adjust paths when outputDir is used (it keeps ./ relative paths so we just adapt to ../)
    // normalizes quotes to double quotes, jest-test-gen uses quotes depending on how is declared in source file
    const { importLines, mockLines } = normalizeSkeleton(generatedTestPath, generatedTestPathBasic);
    //  console.log("Normalized import lines:", importLines);
    //  console.log("Normalized mock lines:", mockLines);

    console.log(`Generated test: ${generatedTestPath}`);

    // Retornar path y sets de imports/mocks normalizados para el pipeline
    return {
      generatedTestPathBasic,
      importLines,
      mockLines
    };

  } catch (err) {
    console.error(`Error generating tests for ${filePath}:`, err.message);
  }
}///end createBasicTestSkeleton

/* ================================================================
  HELPERS & CONSTS
--------------------------------------------------------------- */


const suggestedTestBlocksHeader = `\n/**
 * Suggested Test Blocks - Generated Automatically
 * -----------------------------------------------
 * This section contains suggested test blocks based on static analysis.
 * Please review and inform any necessary adjustments.
 * -----------------------------------------------
 */\n`;

// Helper: concatenate all unique mock lines from blocks' meta
function allMockLines(blocks) {
  let allLines = '';
  const mockLinesSet = new Set();
  blocks.forEach(block => {
    if (block.meta && Array.isArray(block.meta.contextsHelpers)) {
      block.meta.contextsHelpers.forEach(helper => {
        const mockLine = helper?.contextMeta?.mockLine;
        if (mockLine && !mockLinesSet.has(mockLine)) {
          allLines += `\n${mockLine}`;
          mockLinesSet.add(mockLine);
          // console.log('MOCK LINE:', mockLine);
        }
      });
    }
  });
  return allLines;
}///end allMockLines

// Helper: concatenate all global mocks (like useParamsMock) from the meta of suggested blocks
function allGlobalMockLines(blocks) {
  // Map to prioritize extended mocks by module
  const globalMocksByModule = {};
  blocks.forEach((block, idx) => {
    // writeLog(true, `[allGlobalMockLines] Processing block #${idx}: ${JSON.stringify(block.meta, null, 2)}`);
    if (block.meta && block.meta.useParamsMockObj) {
      const obj = block.meta.useParamsMockObj;
      // console.log(`[allGlobalMockLines] Block #${idx} useParamsMockObj:`, obj);
      if (obj && obj.type) {
        // If there is already a mock for this module, prioritize the extended one
        if (!globalMocksByModule[obj.type] || (obj.extended && !globalMocksByModule[obj.type].extended)) {
          globalMocksByModule[obj.type] = obj;
          // console.log(`[allGlobalMockLines] Set mock for module '${obj.type}':`, obj);
        }
      }
    }
    // Here you can add other global mocks in the future (useRouterMock, etc.)
  });
  // Returns all complete blocks, separated by double line breaks
  const mocks = Object.values(globalMocksByModule)
    .filter(obj => obj && obj.code)
    .map(obj => obj.code.trim());
  // console.log('[allGlobalMockLines] Final global mocks:', mocks);
  
  // writeLog(false, `[allGlobalMockLines] globalMocksByModule: ${JSON.stringify(globalMocksByModule, null, 2)}`);
  // writeLog(false, `[allGlobalMockLines] Final global mocks: ${JSON.stringify(mocks, null, 2)}`);
  
  if (mocks.length > 0) {
    return mocks.join('\n\n') + '\n';
  }
  return '';
}///end allGlobalMockLines

// Helper: concatenate all block.code with new lines
function allBlockLines(blocks) {
  let allLines = '';
  blocks.forEach(block => {
    allLines += `\n${block.code}\n`;
  });
  return allLines;;
}///end allBlockLines

// Helper: concatenate all unique import lines from blocks' meta
function allImportLines(blocks) {
  let allLines = '';
  // 1. Agrupar contextsHelpers por contextPath para generar imports agrupados
  const contextImportsMap = {};
  blocks.forEach(block => {
    if (block.meta && Array.isArray(block.meta.contextsHelpers)) {
      block.meta.contextsHelpers.forEach(helper => {
        const contextName = helper?.context?.contextName;
        const contextPath = helper?.context?.contextPath;
        if (contextName && contextPath) {
          if (!contextImportsMap[contextPath]) contextImportsMap[contextPath] = new Set();
          contextImportsMap[contextPath].add(contextName);
        }
      });
    }
  });

  // 2. Print and save grouped imports
  Object.entries(contextImportsMap).forEach(([contextPath, namesSet]) => {
    const namesArr = Array.from(namesSet).sort();
    const importLine = `import { ${namesArr.join(', ')} } from "${contextPath}";`;
    allLines += `\n${importLine}`;
  });
  return allLines;
}

// Helper: add imports and mocks of Testing Library if any block requires it
function allLibraryLines(blocks) {
  let allLines = '';
  let needsTestingLibrary = false;
  // Detect if any block requires Testing Library
  blocks.forEach(block => {
    if (block.meta && block.meta.usesTestingLibrary) {
      needsTestingLibrary = true;
    }
  });
  if (needsTestingLibrary) {
    // You can adjust these imports/mocks according to the project's stack
    allLines += '\nimport { render, screen } from "@testing-library/react";';
    // If you need additional mocks, add them here
  }
  return allLines;
}

// adapting import lines in auto test jest-test-gen, library doesn't change the paths when outputDir option is used
// import line `import XXX from './YYY.ZZ';` & `import { X, X, X } from './YYY.ZZ';` ? replacing `./` with `../` to match the __tests__ folder location
// mock line `jest.mock("./YYY.ZZ")`? same as import line
// also normalizes quotes to double quotes
// Normalizes imports and mocks, grouping multiline blocks as atomic units
function normalizeSkeleton(generatedTestPath, generatedTestPathBasic) {
  // Reads the raw file generated by jest-test-gen
  let content = fs.readFileSync(generatedTestPath, 'utf-8');

  // Normalization of paths and quotes
  let updatedContent = content
    .replace(/(import\s+.*\s+from\s+['"])(\.\/)/g, '$1../')
    .replace(/(jest\.mock\(\s*['"])(\.\/)/g, '$1../')
    .replace(/import\s+(.*)\s+from\s+['"](.*)['"]/g, (match, p1, p2) => {
      return `import ${p1} from "${p2}"`;
    })
    .replace(/jest\.mock\(\s*['"](.*)['"]\s*\)/g, (match, p1) => {
      return `jest.mock("${p1}")`;
    });

  // Grouping multiline blocks of imports and mocks
  const importBlocks = [];
  const mockBlocks = [];
  const lines = updatedContent.split('\n');
  let currentBlock = [];
  let inImport = false;
  let inMock = false;

  // Helper to clean up trailing commas in import blocks
  function cleanImportBlock(block) {
    // console.log('CLEANING IMPORT BLOCK:', block);
    let joined = block.join('\n');
    // Solo procesa si es un import con llaves
    if (/import\s*\{/.test(joined)) {
      joined = joined.replace(/\{([^}]*)\}/, (match, inner) => {
        // Split por coma o espacio, filtra vacíos y une con coma+espacio
        let cleaned = inner
          .split(/[\s,]+/)
          .map(s => s.trim())
          .filter(Boolean)
          .join(', ');
        return `{ ${cleaned} }`;
      });
    }
    joined = joined.replace(/\{\s*,/g, '{').replace(/,\s*\}/g, ' }');
    // console.log('CLEANED IMPORT BLOCK:', joined);
    return joined;
  }

  for (let line of lines) {
    const trimmed = line.trim();
    // Detect start of import block (supports multiline)
    if (trimmed.startsWith('import ')) {
      if (currentBlock.length) {
        if (inImport) importBlocks.push(cleanImportBlock(currentBlock));
        if (inMock) mockBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inImport = false;
        inMock = false;
      }
      currentBlock.push(line);
      inImport = true;
    } else if (inImport && (trimmed.endsWith(';') || trimmed.endsWith("'") || trimmed.endsWith('"'))) {
      currentBlock.push(line);
      importBlocks.push(cleanImportBlock(currentBlock));
      currentBlock = [];
      inImport = false;
    } else if (inImport) {
      currentBlock.push(line);
    }
    // Detect start of mock block (supports multiline)
    else if (trimmed.startsWith('jest.mock(')) {
      if (currentBlock.length) {
        if (inImport) importBlocks.push(cleanImportBlock(currentBlock));
        if (inMock) mockBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inImport = false;
        inMock = false;
      }
      currentBlock.push(line);
      inMock = true;
      if (trimmed.endsWith(');')) {
        mockBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
        inMock = false;
      }
    } else if (inMock && trimmed.endsWith(');')) {
      currentBlock.push(line);
      mockBlocks.push(currentBlock.join('\n'));
      currentBlock = [];
      inMock = false;
    } else if (inMock) {
      currentBlock.push(line);
    }
  }
  // Add any pending blocks
  if (currentBlock.length) {
    if (inImport) importBlocks.push(cleanImportBlock(currentBlock));
    if (inMock) mockBlocks.push(currentBlock.join('\n'));
  }
  // writeLog(true, `[normalizeSkeleton] Normalized importBlocks: ${JSON.stringify(importBlocks, null, 2)}`, 'gen-test-babel.log');
  // writeLog(true, `[normalizeSkeleton] Normalized mockBlocks: ${JSON.stringify(mockBlocks, null, 2)}`, 'gen-test-babel.log');

  // Write the clean and ordered file to the specified path
  const cleanSkeletonContent = [
    ...importBlocks,
    ...mockBlocks
  ].join('\n\n') + '\n';
  fs.writeFileSync(generatedTestPathBasic, cleanSkeletonContent, 'utf-8');
  // writeLog(true, `[normalizeSkeleton] Clean skeleton written to: ${generatedTestPathBasic}`, 'gen-test-babel.log');

  // Returns Sets to facilitate later deduplication
  return {
    importLines: new Set(importBlocks),
    mockLines: new Set(mockBlocks),
    cleanSkeletonPath: generatedTestPathBasic,
    cleanSkeletonContent
  };
}
// end normalizeSkeleton

// Cleaning suggested test blocks: removing duplicates based on meta data
// Now supports deduplication considering mocksObjs, contextHelpers, and other enriched fields
function cleanSuggestedTestBlocks(suggestedTestBlocks) {
  const seen = new Set();
  const cleanedBlocks = [];
  suggestedTestBlocks.forEach(block => {
    // If the block is empty or has no meta, we pass it through (no deduplication)
    if (!block || !block.meta) {
      cleanedBlocks.push(block);
      return;
    }

    // If it has contextsHelpers, deduplicate by importLine (as before)
    if (Array.isArray(block.meta.contextsHelpers)) {
      const uniqueHelpers = block.meta.contextsHelpers.filter((h, i, arr) => {
        const key = h.contextMeta?.importLine || '';
        return arr.findIndex(x => x.contextMeta?.importLine === key) === i;
      });
      block.meta.contextsHelpers = uniqueHelpers;
      const uniqueKey = uniqueHelpers.map(h =>
        `${h.contextMeta?.importLine}|${h.contextMeta?.mockLine}|${h.contextMeta?.mockVarName}`
      ).join('||') + `|usesTestingLibrary:${block.meta.usesTestingLibrary}|type:${block.type}|code:${(block.code||'').slice(0,40)}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        cleanedBlocks.push(block);
      }
      return;
    }

    // If it has mocksObjs, deduplicate by the stringified mocks and block type
    if (Array.isArray(block.meta.mocksObjs)) {
      const mocksKey = JSON.stringify(block.meta.mocksObjs);
      const uniqueKey = `mocksObjs:${mocksKey}|usesTestingLibrary:${block.meta.usesTestingLibrary}|type:${block.type}|code:${(block.code||'').slice(0,40)}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        cleanedBlocks.push(block);
      }
      return;
    }

    // If there are no helpers or mocksObjs, deduplicate by type and code hash/slice
    const codeHash = (block.code || '').slice(0, 40);
    const uniqueKey = `noHelpers|usesTestingLibrary:${block.meta?.usesTestingLibrary}|type:${block.type}|code:${codeHash}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      cleanedBlocks.push(block);
    }
  });

  return cleanedBlocks;
}//end cleanSuggestedTestBlocks

// Merging lines from sets into a single string with new lines
// Groups imports, then mocks, then others (linesAdded), all deduplicated and sorted
function mergeLines(importLinesSet, mockLinesSet, linesAdded, content) {

// writeLog(true, `======================================================================`, 'gen-test-babel.log');
// writeLog(true, `[mergeLines] Received importLinesSet: ${JSON.stringify(Array.from(importLinesSet), null, 2)}`, 'gen-test-babel.log');
// writeLog(true, `[mergeLines] Received mockLinesSet: ${JSON.stringify(Array.from(mockLinesSet), null, 2)}`, 'gen-test-babel.log');
// writeLog(true, `[mergeLines] Received linesAdded: ${JSON.stringify(linesAdded, null, 2)}`, 'gen-test-babel.log');
// writeLog(true, `======================================================================`, 'gen-test-babel.log');

  // Usar helper de agrupación
  let mergedLines = groupHelper(importLinesSet, mockLinesSet, linesAdded);

  // console.log('ORIGINAL CONTENT BEFORE MERGE mergeLines>>:\n', content); //original content from skeelton
  // console.log('MERGED LINES from mergeLines calling groupHelper>>:\n', mergedLines); //final merged lines from suggestions

  // Additional processing
  mergedLines = mergeLinesHelper(content, mergedLines);
  // console.log('MERGED LINES FINAL from mergeLines calling mergeLinesHelper>>:\n', mergedLines);

  return mergedLines;
}

// Additional processing on merged lines if needed
function mergeLinesHelper(originalContent, mergedLines) {
  // console.log('mergeLinesHelper called...', {
  //   originalContent,
  //   mergedLines
  // });

  // 1. Split lines and clean
  const origLines = originalContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const mergedLinesArr = mergedLines.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // writeLog(true, `mergeLinesHelper - Original Lines:\n${origLines.join('\n')}`, 'gen-test-babel.log');
  // writeLog(true, `mergeLinesHelper - Merged Lines:\n${mergedLinesArr.join('\n')}`, 'gen-test-babel.log');

  // 2. Create sets for deduplication
  const origSet = new Set(origLines);

  // 3. Filter mergedLines removing those already in originalContent
  const dedupedMerged = mergedLinesArr.filter(line => !origSet.has(line));
  // writeLog(true, `mergeLinesHelper - Deduped Merged Lines:\n${dedupedMerged.join('\n')}`, 'gen-test-babel.log');

  // 4. Assemble complete blocks (imports, multiline mocks, simple mocks, others)
  const allLines = [...origLines, ...dedupedMerged];
  // writeLog(true, `mergeLinesHelper - All Lines Before Grouping:\n${allLines.join('\n')}`, 'gen-test-babel.log');

  // a) Group and deduplicate imports by path
  const importByPath = {};
  allLines.forEach(line => {
    if (line.startsWith('import ')) {
      // Extract import path
      const match = line.match(/from\s+["'](.+)["']/);
      const path = match ? match[1] : null;
      if (path) {
        if (!importByPath[path]) importByPath[path] = new Set();
        // Extract imported names
        const namesMatch = line.match(/import\s+\{([^}]+)\}/);
        if (namesMatch) {
          namesMatch[1].split(',').map(n => n.trim()).forEach(n => importByPath[path].add(n));
        } else {
          // Default or namespace import
          const defMatch = line.match(/import\s+([^\s\{]+)\s+from/);
          if (defMatch) importByPath[path].add(defMatch[1]);
        }
      }
    }
  });

  // writeLog(true, `mergeLinesHelper - Import By Path:\n${JSON.stringify(importByPath, null, 2)}`, 'gen-test-babel.log');
  // Rebuild grouped and sorted imports
  const imports = Object.entries(importByPath).map(([path, namesSet]) => {
    const namesArr = Array.from(namesSet).sort();
    if (namesArr.length === 1 && !namesArr[0].includes('*')) {
      // Import default
      return `import ${namesArr[0]} from "${path}";`;
    } else if (namesArr.some(n => n.includes('*'))) {
      // Namespace import
      return `import ${namesArr.join(', ')} from "${path}";`;
    } else {
      return `import { ${namesArr.join(', ')} } from "${path}";`;
    }
  }).sort();

  // writeLog(true, `mergeLinesHelper - Grouped Imports:\n${imports.join('\n')}`, 'gen-test-babel.log');
  // b) Group mocks by module, prioritizing extended mocks
  const mockByModule = {};
  const consumedMockLineIdxs = new Set();
  let i = 0;
  while (i < allLines.length) {
    let line = allLines[i];
    if (line.startsWith('jest.mock(')) {
      // Extract module
      const modMatch = line.match(/jest\.mock\(["'](.+)["']/);
      const mod = modMatch ? modMatch[1] : null;
      let block = [line];
      let blockIdxs = [i];
      let isExtended = false;
      if (line.includes('=> ({')) {
        // Multiline (extended mock)
        i++;
        while (i < allLines.length && !allLines[i].trim().endsWith('}));')) {
          block.push(allLines[i]);
          blockIdxs.push(i);
          i++;
        }
        if (i < allLines.length) {
          block.push(allLines[i]);
          blockIdxs.push(i);
        }
        isExtended = true;
      }
      const blockStr = block.join('\n');
      if (mod) {
        // Prioritize extended mocks
        if (!mockByModule[mod] || (isExtended && !mockByModule[mod].isExtended)) {
          mockByModule[mod] = { code: blockStr, isExtended };
        }
      }
      // Mark consumed indices
      blockIdxs.forEach(idx => consumedMockLineIdxs.add(idx));
    }
    i++;
  }
  // writeLog(true, `mergeLinesHelper - Mock By Module:\n${JSON.stringify(mockByModule, null, 2)}`, 'gen-test-babel.log');
  // Sort mocks by module name
  const mocks = Object.values(mockByModule)
    .map(obj => obj.code)
    .sort((a, b) => a.localeCompare(b));
  // writeLog(true, `mergeLinesHelper - Grouped Mocks:\n${mocks.join('\n')}`, 'gen-test-babel.log');
  
  // c) Other blocks (helpers, constants, etc), unique and in order of appearance
  const otherSet = new Set();
  const others = [];
  allLines.forEach((line, idx) => {
    if (!line.startsWith('import ') && !line.startsWith('jest.mock(') && !consumedMockLineIdxs.has(idx)) {
      if (!otherSet.has(line)) {
        otherSet.add(line);
        others.push(line);
      }
    }
  });

  // writeLog(true, `mergeLinesHelper - Other Lines:\n${others.join('\n')}`, 'gen-test-babel.log');
  // 5. Join everything: imports + mocks + others
  const finalLines = [...imports, ...mocks, ...others];
  // writeLog(true, `mergeLinesHelper - Final Lines:\n${finalLines.join('\n')}`, 'gen-test-babel.log');
  // 6. Return the final result
  return finalLines.join('\n') + '\n';

}

/**
 * Groups and normalizes import, mock, and testing library lines for Jest test generation.
 *
 * This function merges sets of import and mock lines, deduplicates, sorts, and formats them,
 * and returns a single string with all grouped lines. It also normalizes relative import paths.
 *
 * @param {Set<string>} importLinesSet - Set of import statement lines to include.
 * @param {Set<string>} mockLinesSet - Set of mock statement lines to include.
 * @param {Object} linesAdded - Object containing additional lines to merge:
 *   @param {Set<string>} [linesAdded.importedLines] - Additional import lines.
 *   @param {Set<string>} [linesAdded.mockedLines] - Additional mock lines.
 *   @param {Set<string>} [linesAdded.testingLibraryLines] - Additional testing library lines.
 *   @param {Set<string>} [linesAdded.globalMockLines] - Additional global mock lines.
 * @returns {string} The grouped, deduplicated, and formatted lines as a single string.
 */
function groupHelper(importLinesSet, mockLinesSet, linesAdded) {

  // console.log('GROUP HELPER RECEIVED:', {
  //   importLinesSet,
  //   mockLinesSet,
  //   linesAdded
  // });

  let allLines = '';

  // 1. Gather and normalize all imports (from sets and linesAdded)
  // Merge all import lines from sets, flatten and deduplicate
  const allImports = Array.from(
    new Set([
      ...(importLinesSet || []),
      ...((linesAdded && linesAdded.importedLines) || [])
    ])
  );
  // writeLog(true, `[groupHelper] allImports: ${JSON.stringify(allImports, null, 2)}`);

  // Group and deduplicate imports
  if (allImports.length > 0) {
    const groupedImports = groupImports(allImports);
    // writeLog(true, `[groupHelper] groupedImports: ${JSON.stringify(groupedImports, null, 2)}`);
    allLines += groupedImports.join('\n') + '\n';
  }

  // 2. Mocks grouped and deduplicated by module, prioritizing extended mocks
  const allMocks = Array.from(
    new Set([
      ...(mockLinesSet || []),
      ...((linesAdded && linesAdded.mockedLines) || []),
      ...((linesAdded && linesAdded.globalMockLines) || [])
    ])
  );
  // writeLog(true, `[groupHelper] allMocks: ${JSON.stringify(allMocks, null, 2)}`);
  const groupedMocks = groupMocks(allMocks);
  // writeLog(true, `[groupHelper] groupedMocks: ${JSON.stringify(groupedMocks, null, 2)}`);
  if (groupedMocks.length > 0) {
    allLines += groupedMocks.join('\n') + '\n';
  }

  // 3. Other (testingLibraryLines)
  const testingLibraryLines = Array.from(
    new Set([
      ...((linesAdded && linesAdded.testingLibraryLines) || [])
    ])
  );
  // writeLog(true, `[groupHelper] testingLibraryLines: ${JSON.stringify(testingLibraryLines, null, 2)}`);
  if (testingLibraryLines.length > 0) {
    const sortedTestingLibs = testingLibraryLines.sort();
    allLines += sortedTestingLibs.join('\n') + '\n';
  }

  // Final cleanup: remove repeated empty lines and trim
  allLines = allLines
    .split('\n')
    .map(line => line.trim())
    .filter((line, idx, arr) => line && arr.indexOf(line) === idx)
    .join('\n') + '\n';

  // writeLog(true, `[groupHelper] FINAL allLines: ${allLines}`);
  return allLines;
}

// Helper internal function to group and deduplicate mocks by module, prioritizing extended mocks
function groupMocks(allMocks) {

  // console.log('Grouping mock lines...', allMocks);

  // Group by module using regex on the first jest.mock("module"...)
  const mockByModule = {};
  allMocks.forEach(mockBlock => {
    if (!mockBlock || typeof mockBlock !== 'string') return;
    const match = mockBlock.match(/jest\.mock\((['\"])([^'\"]+)\1\s*(,|\))/);
    if (match) {
      const moduleName = match[2];
      if (!mockByModule[moduleName]) {
        mockByModule[moduleName] = mockBlock;
      } else {
        
        // If the new mock has a factory (has ", () =>" or ",function"), we prefer it
        const isFactory = /,\s*(\(\s*\)|\(.*?\))\s*=>|,\s*function/.test(mockBlock);
        const prevIsFactory = /,\s*(\(\s*\)|\(.*?\))\s*=>|,\s*function/.test(mockByModule[moduleName]);
        if (isFactory && !prevIsFactory) {
          mockByModule[moduleName] = mockBlock;
        }
      }
    } else {
      // If it's not a recognizable jest.mock, we add it as "special"
      mockByModule['others'] = mockBlock;
    }
  });
  // console.log('Grouped mock by module:', Object.values(mockByModule));

  return Object.values(mockByModule);
}

// Helper to group imports by path
function groupImports(importLinesArr) {
  // writeLog(true, `[groupImports] input importLinesArr: ${JSON.stringify(importLinesArr, null, 2)}`);
  // First, normalize all ./ relative paths to ../
  importLinesArr = importLinesArr.map(line => {
    return line.replace(/(import\s+.*\s+from\s+['"])(\.\/)/g, '$1../');
  });
  // writeLog(true, `[groupImports] normalized importLinesArr: ${JSON.stringify(importLinesArr, null, 2)}`);

  // Refactor: Groups all imports (default, named, star, special) without losing any,
  // and ensures that default-only imports are never discarded.
  const importMap = {};
  const defaultImports = {};
  importLinesArr.forEach(line => {
    // 1. import { A, B } from "...";
    let match = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const names = match[1].split(',').map(s => s.trim());
      const path = match[2];
      if (!importMap[path]) importMap[path] = new Set();
      names.forEach(n => importMap[path].add(n));
      return;
    }

    // 2. import X from "...";
    match = line.match(/^import\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const defName = match[1];
      const path = match[2];
      // Ensure the path is in both maps
      if (!importMap[path]) importMap[path] = new Set();
      if (!defaultImports[path]) defaultImports[path] = new Set();
      defaultImports[path].add(defName);
      return;
    }

    // 3. import * as X from "...";
    match = line.match(/^import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const path = match[2];
      if (!importMap[path]) importMap[path] = new Set();
      importMap[path].add(`* as ${match[1]}`);
      return;
    }

    // 4. Other imports (special, side-effects, etc): keep as is
    importMap[line] = importMap[line] || new Set();
  });

  // writeLog(true, `[groupImports] importMap: ${JSON.stringify(importMap, null, 2)}`);
  // writeLog(true, `[groupImports] defaultImports: ${JSON.stringify(defaultImports, null, 2)}`);

  // Merge all paths from importMap and defaultImports to avoid losing any
  const allPaths = Array.from(new Set([
    ...Object.keys(importMap),
    ...Object.keys(defaultImports)
  ])).sort();
  const grouped = [];
  
  allPaths.forEach(path => {
    // If it's a special import (e.g., side-effect, import "foo"), keep as is
    if (path.startsWith('import')) {
      grouped.push(path);
      return;
    }
    const names = importMap[path] ? Array.from(importMap[path]).filter(n => !n.startsWith('* as ')) : [];
    const stars = importMap[path] ? Array.from(importMap[path]).filter(n => n.startsWith('* as ')) : [];
    const hasDefault = defaultImports[path] && defaultImports[path].size > 0;
    const hasNamed = names.length > 0;
    // Generate the line according to the cases
    if (hasDefault && hasNamed) {
      grouped.push(`import ${Array.from(defaultImports[path]).join(', ')}{ ${names.sort().join(', ')} } from "${path}";`);
    } else if (hasDefault) {
      grouped.push(`import ${Array.from(defaultImports[path]).join(', ')} from "${path}";`);
    } else if (hasNamed) {
      grouped.push(`import { ${names.sort().join(', ')} } from "${path}";`);
    }
    // Add star imports if they exist
    stars.forEach(star => grouped.push(`import ${star} from "${path}";`));
  });
  // writeLog(true, `[groupImports] grouped: ${JSON.stringify(grouped, null, 2)}`);
  return grouped;
}