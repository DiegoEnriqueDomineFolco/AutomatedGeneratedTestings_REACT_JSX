// scripts/generate/jest-test-gen-helpers.mjs
// 
// ================================================================

//imports
import fs from 'fs';
import path from 'path';
import { getParsedSource, writeLog } from './generate/utils.mjs'; // General utilitys


/* ================================================================
 cleanFinalTest
 for now just deduplicates IDENTICAL import and mock lines

 @param {string} testFilePath - path to the generated test file to clean
 @param {object} linesAdded - { 
   Set(` import { useAppContext } from "@/context/appContext";`,...),
   Set(` const mockuseAppContextValue = 'example';`,...),
  } - sets of lines added during to check for duplicated lines added from jest-test-gen when basic skeleton was created
--------------------------------------------------------------- */

export function cleanFinalTest(testFilePath, linesAdded) {
  // console.log(`Cleaning final test file: ${testFilePath} ... recibido linesAdded:`, linesAdded);

  try {
    let content = fs.readFileSync(testFilePath, 'utf-8');
    const lines = content.split('\n');

    // Normalizar y deduplicar imports, mocks y testing library lines usando los sets
    const importLines = Array.from(linesAdded.importedLines);
    const mockLines = Array.from(linesAdded.mockedLines);
    const testingLibraryLines = Array.from(linesAdded.testingLibraryLines);

    // 1. Insertar los imports/mocks de Testing Library al inicio, deduplicados
    const headerLines = [];
    const headerSeen = new Set();
    testingLibraryLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !headerSeen.has(trimmed)) {
        headerLines.push(trimmed);
        headerSeen.add(trimmed);
      }
    });

    // 2. Procesar el resto del archivo como antes
    const seen = new Set(headerSeen); // ya no duplicar los del header
    const cleanedLines = [...headerLines];

    lines.forEach(line => {
      const trimmed = line.trim();
      // Si es un import o mock generado por nosotros y ya lo vimos, marcamos la duplicada
      if (
        importLines.some(l => l === trimmed) ||
        mockLines.some(l => l === trimmed) ||
        testingLibraryLines.some(l => l === trimmed)
      ) {
        if (seen.has(trimmed)) {
          cleanedLines.push(`//cleanFinal A BORRAR! ${line}`);
          return;
        }
        seen.add(trimmed);
      }
      cleanedLines.push(line);
    });

    fs.writeFileSync(testFilePath, cleanedLines.join('\n'), 'utf-8');

    // mergeImports(testFilePath);

    console.log('Final test file cleaned and deduplicated.');
  } catch (err) {
    console.error('Error cleaning final test file:', err.message);
  }

}

/**
 * This fn will remove all lines except imports and mocks from a basic generated test file.
 * Has to support import and mocks multiline statments like:
 * import {
 *   something,
 *   another
 * } from 'module';
 * Mocks too:
 * jest.mock('module', () => ({
 *   something: jest.fn(),
 *   another: jest.fn()
 * }));
 * just matching if line start with import or jest.mock will NOT work.
 * @param {string} testFilePath 
 */

export function cleanBasicTest(testFilePath) {
  try {
    const content = fs.readFileSync(testFilePath, 'utf-8');
    const lines = content.split('\n');
    const headerLines = [];
    let found = false;

    for (const line of lines) {
      if (line.includes('const renderTree = tree => renderer.create(tree);')) {
        found = true;
        break;
      }
      headerLines.push(line);
    }

    if (!found) {
      console.warn(
        '[cleanBasicTest] Warning: renderTree marker not found, file left unchanged.'
      );
      return;
    }

    fs.writeFileSync(testFilePath, headerLines.join('\n'), 'utf-8');
    console.log('Basic test file cleaned: only imports and mocks retained.');
  } catch (err) {
    console.error('Error cleaning basic test file:', err.message);
  }
}

/* ================================================================
  HELPERS & CONSTS
--------------------------------------------------------------- */


/**
 * Merges import statements at the top of the file using Babel parser/traverse.
 * Agrupa y deduplica todos los imports (default, named, mixtos, alias, side-effect, multilínea).
 * @param {string} filePath - Path to the test file.
 */

import generate from "@babel/generator";
import { findImports } from "./analyze-ast-helper.mjs";


function mergeImports(filePath) {
  const code = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath);
  // const ast = getParsedSource(code, ext);

  // try {
  //   // Usar findImports para extraer todos los imports
  //   const imports = findImports(ast);
  //   console.log(`Found imports for merging:`, imports);

  //   // Agrupar y deduplicar imports por source
  //   const importMap = new Map(); // { source: Set(specifiers) }
  //   imports.forEach(imp => {
  //     if (!importMap.has(imp.source)) {
  //       importMap.set(imp.source, new Set());
  //     }
  //     imp.specifiers.forEach(spec => importMap.get(imp.source).add(spec));
  //   });

  //   // Reconstruir los import statements agrupados y ordenados
  //   let importsBlock = '';
  //   Array.from(importMap.keys()).sort().forEach(source => {
  //     const specifiers = Array.from(importMap.get(source));
  //     if specifiers.length === 0) {
  //       // Side-effect import
  //       importsBlock += `import "${source}";\n`;
  //     } else {
  //       // Default y/o named imports
  //       // Separar default de named
  //       const defaultSpec = specifiers.find(s => s === 'default');
  //       const namedSpecs = specifiers.filter(s => s !== 'default');
  //       let line = 'import ';
  //       if (defaultSpec) line += defaultSpec;
  //       if (namedSpecs.length) {
  //         if (defaultSpec) line += ', ';
  //         line += `{ ${namedSpecs.sort().join(', ')} }`;
  //       }
  //       line += ` from "${source}";`;
  //       importsBlock += line + '\n';
  //     }
  //   });

  //   // Eliminar todos los ImportDeclaration del AST para obtener el resto del código
  //   const restNodes = ast.program.body.filter(node => node.type !== 'ImportDeclaration');
  //   const restCode = restNodes.map(node => generate(node).code).join("\n\n");

  //   console.log(`Merged imports block:\n${importsBlock}`);
  //   console.log(`Rest of code:\n${restCode}`);

  //   // Escribir el archivo final: imports + resto
  //   // fs.writeFileSync(filePath, importsBlock.trim() + "\n\n" + restCode.trim() + "\n", "utf-8");

  //   // escribir en un archivo nuevo diferente -testing
  //   fs.writeFileSync(filePath.replace('.test.', '.cleaned.test.'), importsBlock.trim() + "\n\n" + restCode.trim() + "\n", "utf-8");

  //   console.log('Imports merged successfully.');

  // } catch (err) {
  //   console.error('Error merging imports:', err.message);
  // }
}