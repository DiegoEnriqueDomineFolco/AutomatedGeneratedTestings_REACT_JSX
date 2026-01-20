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

# Files · Install · Config · Run

## Files

- `scripts/gen-test-babel.mjs` (main process)
- `scripts/analyze-ast-helper.mjs` (AST analysis)
- `scripts/ast-helpers.mjs` (AST helper functions)
- `scripts/suggest-test-blocks.mjs` (test block suggestion generator)
- `scripts/suggest-test-blocks-helpers.mjs` (test block suggestion helpers)
- `scripts/jest-test-gen-helpers.mjs` (test skeleton generator and integrator)
- `generate/utils.mjs` (utilities for file reading, parsing, etc.)
- `generate/config.mjs` (configuration)

## Installation and Configuration

### 1. Install

- Copy the files into your repository (e.g., `./scripts/` or any folder you prefer).
- Install dependencies:
  ```bash
  npm install @babel/parser @babel/traverse
  npm install jest-test-gen

# Expectations · More Info

## What to Expect from the System

- Test files are automatically generated in the `__tests__` folder next to each source file.
- The tests include imports, mocks, and suggested blocks based on source code analysis.
- The generated files are valid to complete and run with Jest.

## Example of a Generated File

```js
// Example: DataExportContext.test.jsx
jest.mock("@/utils/supabase/client");
jest.mock("next/navigation");
jest.mock("react-hot-toast");
const mockDataExportContextValue = 'example';

// ...headers and imports

describe('DataExportProvider props', () => {
    it("handles prop 'children' correctly (Source line: 185)", () => {
        render(<DataExportProvider children={<span data-testid=\"test-child\">Test</span>} />);
        expect(screen.getByTestId('test-child')).toBeInTheDocument();
    });
});

// Example: OfferingCreate.test.jsx
jest.mock("@/actions/global");
jest.mock("@/context/appContext");
// ...more mocks

describe('OfferingCreate', () => {
    it("renders main elements", () => {
        // ...test implementation
    });
});

describe('OfferingCreate props', () => {
    it("handles prop 'assetClasses' correctly (Source line: 32)", () => {
        // ...test implementation
    });
    // ...more prop tests
});
```

## Customization and Extensibility

- You can modify the configuration in `generate/config.mjs` to adjust paths, exclusions, and valid extensions.
- The system is modular: you can add new rules, helpers, or custom test blocks.

## Important Notes

- Generated test blocks may be overwritten in future script runs.
- You can edit or add tests manually outside the generated blocks, but if you modify the auto-generated blocks, those changes will be lost when regenerating! **Save your files!**

---

**Questions?**  
Check the comments in each file or review the source code to understand the flow and logic.
