# Verification traceability

The role-separated tester army uses independent native, browser, corpus and deployment lanes. No third-party package named “tester army” was found locally; this document does not claim integration with an unavailable framework. The tests exercise public C++/WASM interfaces and actual browser actions without production test backdoors.

| Requirement | Evidence command / test |
| --- | --- |
| IGI 1 QVM 8.5 / IGI 2 QVM 8.7 compilation and detection | `npm run test:native`; browser target roundtrips |
| Native/WASM identical compiled bytes and decoded text | `npm run test:parity` |
| Original local game semantics preserved | `build/native/qvm_corpus_semantics "$IGI_GAME_PATH" [additional-paths]` compares opcode values, identifiers, strings, branch edges and CALL targets |
| Local game browser-WASM roundtrip stability | `IGI_GAME_PATH=/path/to/owned/game npm run test:corpus` |
| QSC import, editing, validation, save and QVM download/reopen | `edit, validate, compile, download and reopen` browser test, both games |
| Updated source saved as QSC and freshly compiled QVM | `save updated editor as QSC and QVM` browser tests, both games; saved binary reopened and edits checked |
| Optional automatic QVM decompilation on import | `automatic QVM decompilation can be disabled and enabled` browser test |
| Invalid QSC numeric/lexical/syntax errors and excessive nesting | Native tests; browser diagnostics test |
| Invalid QVM offsets, truncation, opcodes, CALL sizes, references and branches | Native tests and 500 deterministic mutations; browser malformed file test |
| Themes and persistence, find, word wrap, new document, responsive layout | Browser theme test, desktop and mobile projects |
| Drag and drop; unsupported and oversized file handling | Browser file-limit test |
| Edits and target changes invalidate compiled output | Browser target invalidation test |
| Dirty discard cancellation, exact saved bytes, undo/redo and keyboard shortcuts | Browser exact-save test |
| LF and CRLF line endings remain intact | Browser exact-save and CRLF document tests |
| UTF-8 native diagnostics align with Unicode text in Monaco | Browser Unicode underline DOM-position test |
| Asynchronous file read cannot overwrite newer edits | Browser delayed File API race test |
| Source edits during compilation discard stale output | Browser delayed Worker API transport test |
| Engine failure and retry recovery | Browser aborted WASM resource test |
| Multi-file drop rejection and theme colors | Browser multi-file / actual colors test |
| No game data uploads / uncaught page errors | Every browser test checks modifying network requests and page errors |
| Real local game import, automatic type detection, decompile and compile | `IGI_GAME_PATH=/path npm run test:e2e` real-game browser test |
| Production browser verification | `E2E_BASE_URL=https://deployment IGI_GAME_PATH=/path npm run test:e2e` |

The browser matrix uses matching engine/device profiles: desktop Chromium, desktop WebKit, Pixel 7 Chromium, and iPhone 13 WebKit. Every selected project executes the same feature cases and checks for uncaught page errors. Keyboard modifiers follow the emulated operating system rather than the host running Playwright.

Passing feature scenarios is feature evidence, not a claim of 100% line or branch coverage. Compiler instrumentation reports must be measured separately. Corpus files are read from configurable private paths and are never committed or deployed. Native semantic normalization permits instruction width changes and zero-distance BRA guard insertion/removal, while preserving all other opcodes/operands and every nontrivial control-flow edge.

Measured native coverage: `LLVM_BIN=/path/to/llvm/bin node tools/e2e-native-coverage.mjs [game-directories...]` writes LLVM line/branch/function summaries and annotated HTML under `build/coverage/`. Browser Chromium runs record V8 executed byte ranges. `node tools/e2e-coverage.mjs test-results/coverage-local` (or `coverage-production`) aggregates them and reports an explicitly different metric; it does not equate generated JS bytes with TypeScript source branch coverage.
