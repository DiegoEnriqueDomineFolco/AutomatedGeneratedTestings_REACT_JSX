# Automated Generated Testing

This section documents the automated test generation system for React/JSX codebases in this repository.

## Overview

**Purpose:**  
Automatically generate enriched Jest test files for React/JSX source files.

**How:**
- Analyzes React/JSX source files using Babel.
- Extracts relevant information (functions, props, hooks, etc.) and suggests automatic test blocks.
- Can be extended to generate complete tests.

**Key Libraries:**
- `@babel/parser` (official Babel library)
- `@babel/traverse` (official Babel library)
- `jest-test-gen` (community-maintained, generates test skeletons)

**Output:**  
Final test files ready to complete and run with Jest.

## Objectives

- Read a React/JSX source file.
- Parse with Babel to obtain the AST.
- Traverse the AST to extract functions, props, hooks, etc.
- Suggest test blocks based on internal logic.
- Auto write base & enriched testing files.

## Steps

1. Parse the source file with Babel.
2. Traverse the AST and extract relevant information.
3. Generate suggestions for test blocks.
4. Generate a basic test skeleton (`jest-test-gen`).
5. Integrate the suggested blocks into the test file.
6. Final file ready to run with Jest.

## Extensibility

- Modular and flexible configuration.
- Easy to extend for new rules, blocks, or formats.

## Main Files

- `scripts/gen-test-babel.mjs` (main process)
- `scripts/analyze-ast-helper.mjs` (AST analysis)
- `scripts/ast-helpers.mjs` (AST helpers)
- `scripts/suggest-test-blocks.mjs` (test block generator)
- `scripts/suggest-test-blocks-helpers.mjs` (helpers for suggestions)
- `scripts/jest-test-gen-helpers.mjs` (test skeleton generator and integrator)
- `scripts/config.mjs` (configuration)
- `generate/utils.mjs` (general utilities)
