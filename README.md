# Project IGI QVM Editor Online

A focused browser editor, compiler and decompiler for Project IGI 1 and 2.
Open `.qsc` source or `.qvm` bytecode, edit QSC in Monaco, choose a target game,
and download the result. No account, database, conversion server or game runtime.

**Files are processed locally in your browser. They are not uploaded to a server.**
The application executes the compiler and decompiler, never the game scripts.

## Features

- QSC → QVM compilation and QVM → QSC decompilation.
- Automatic binary detection: IGI 1 `LOOP 8.5`, IGI 2 `LOOP 8.7`.
- Selectable compile target, with the loaded game's version selected automatically.
- Monaco syntax highlighting, error markers, find, word wrap, undo and redo.
- Dark, Light and Midnight themes; theme preference stays in local browser storage.
- File picker, drag/drop, QSC save and QVM download with base filenames retained.
- Detailed lexer/parser diagnostics and QVM instruction/table metadata.
- Responsive desktop workspace and mobile layout.
- Native C++ compiled to WebAssembly in a Web Worker, keeping the editor responsive.
- Bounds checks, size/recursion/work limits, recoverable runtime errors and retry.
- Before returning decompiled source, recompilation verifies the instruction values,
  symbols and control-flow edges. Unsupported structures produce an error rather
  than a silently changed script.

Keyboard shortcuts: **Ctrl/Cmd + O** opens a file, **Ctrl/Cmd + S** saves QSC,
and **Ctrl/Cmd + Enter** compiles. Monaco also provides its usual editing shortcuts.

## Architecture and provenance

```text
React / TypeScript / Monaco
          ↓ messages
      Web Worker
          ↓ in-memory API
     C++ WebAssembly core
       ├─ QSC lexer → parser → QVM compiler → bytes
       └─ QVM memory parser → decompiler → QSC
          ↓
     browser downloads
```

`core/` is the single compiler/decompiler implementation. Both the native
verification executable and WASM module link it. It is extracted from
[heaven-hm/project-igi-converter](https://github.com/heaven-hm/project-igi-converter),
`develop` commit `0ad7cef11fc5e2c91f42db9f7f8cc731428b41b2`. The compiler is not
rewritten in JavaScript. The archived
[QVM Editor](https://github.com/heaven-hm/project-igi-qvm-editor) informed the
workflow only. See [the source audit](docs/UPSTREAM.md) for changes and credits.

```text
core/       Shared C++ QVM/QSC implementation, no Qt dependencies
wasm/       Narrow Embind bridge and Emscripten target
web/        React, TypeScript, Vite and locally bundled Monaco
tests/      Native regressions, semantic corpus checks and Playwright E2E
tools/      Build, parity, coverage and static deployment utilities
```

## Build and local development

Requirements: Node.js 22.12+ or 24, npm, CMake 3.20+, a C++20 compiler, Python 3,
and Emscripten **4.0.23**. The one-time SDK installation needs adequate disk space.

```sh
npm ci
npm --prefix web ci
npm run toolchain
npm run build:wasm
npm run dev
```

If Emscripten is already installed, activate its environment or set `EMSDK` to
its directory. No machine-specific game or workspace path is embedded in the app.
For the production static site:

```sh
npm run build
npm --prefix web run preview
```

The deployable output is `web/dist/`, including `wasm/qvm.mjs` and `qvm.wasm`.
Monaco and WASM assets are served locally; there are no required CDN dependencies.
For hosting under a subdirectory, set `QVM_BASE=/your-path/` while building.

## Verification

```sh
npm run test:native
npm run test:wasm
npm run test:parity
npx playwright install chromium webkit
npm run test:e2e
```

These test compilation and decompilation for both targets, native/WASM byte and
text parity, control-flow and expression semantics, invalid source/binaries,
download/reopen, editing, themes, diagnostics, file limits, race handling and
engine failure/retry. See [the feature matrix](tests/FEATURE-COVERAGE.md).

Optional tests read your own game installation without copying or publishing it:

```sh
IGI_GAME_PATH=/path/to/your/game npm run test:corpus
IGI_GAME_PATH=/path/to/your/game npm run test:e2e
build/native/qvm_corpus_semantics /path/to/your/game /path/to/additional/fixtures
```

Verify compatibility against a local converter checkout:

```sh
node tools/upstream-compat.mjs /path/to/project-igi-converter
```

Measure coverage rather than equating passing tests with full coverage:

```sh
LLVM_BIN=/path/to/llvm/bin npm run test:coverage:native -- /path/to/your/game
npm run test:coverage:web
```

LLVM reports native source line/branch coverage. Browser coverage reports V8
executed JavaScript ranges; it is not a TypeScript branch-coverage metric.
Test results and private corpus paths stay out of the published source.

## Deployment

The site can be hosted on Vercel, GitHub Pages, Cloudflare Pages, Netlify or any
static host that serves `.wasm` as `application/wasm`. There is no backend to deploy.
For Vercel, use a current CLI (47.2.2 or later):

```sh
npm run build
vercel link --yes --project project-igi-qvm-editor-online
npm run deploy:prepare
vercel deploy --prebuilt --prod
E2E_BASE_URL=https://your-production-url npm run test:e2e
```

Only the generated static output is deployed. Authentication stays in your CLI
login or environment; credentials must never be placed in source files or assets.

## Limits

- QSC input/output: 4 MiB; QVM input: 8 MiB; WASM memory ceiling: 256 MiB.
- Bounded nesting, 4,096 calls, 65,536 arguments/table entries, 500,000 instructions.
- Supports the existing QSC language: calls, expressions, assignment, `if`/`else`,
  `while`, strings, integer/hex/float literals and `TRUE`/`FALSE`.
- QSC is not JavaScript or C++; unsupported syntax and bytecode produce diagnostics.
- QVM 8.7 optional trailing metadata is inspected, but newly compiled scripts use
  the reference compiler's empty metadata output. The tested 8.7 samples have none.
- Testing validates binary and script semantics; it does not execute the game or
  prove behavior for every native function in every game release.

## Credits and license

MIT, © Heaven-HM. This project builds on the Project IGI reverse-engineering work
in Project IGI Converter and its contributors. The original archived editor credits
Artiom for compiler/tools and Dark for UI/design. Game assets are not redistributed.
