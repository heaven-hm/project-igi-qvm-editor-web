# Core provenance and format audit

The sole QVM compiler implementation is the C++ core in `core/`. It was extracted
from `heaven-hm/project-igi-converter`, branch `develop`, commit
`0ad7cef11fc5e2c91f42db9f7f8cc731428b41b2` (MIT, Heaven-HM).
The source commit was checked against GitHub when this project was created.

Audited in full: `qvm_compiler.{cpp,h}`, `qvm_parser.{cpp,h}`,
`qvm_decompiler.{cpp,h}`, `qsc_lexer.{cpp,h}`, `qsc_parser.{cpp,h}`,
the CLI `cmd_qsc.cpp`, `cmd_qvm.cpp`, root CMake configuration, Logger declarations
and CLI support, and QSC/corpus test fixtures. The only non-standard-library
dependency was desktop logging in the decompiler; the standalone core returns
errors directly and has no Qt, renderer, converter, or filesystem dependency
in the browser conversion path.

The native test tool and browser WebAssembly target both link `igi_qvm_core`.
There is no JavaScript compiler, decompiler, binary parser, or alternate format
implementation. Existing CALL argument programs, BRK termination, relative
branches, intern pools, float encoding and PUSH opcode selection are reused.

Focused changes to the extracted source:

- File parsing delegates to `QVM_ParseMemory`; header, sections, tables,
  instructions, indices and branch addresses are checked without integer wrapping.
- Source diagnostics retain the original line/column messages. Numeric conversion
  uses explicit 32-bit ranges for native/WASM parity; unterminated comments and NUL
  bytes are rejected. Recursion, file, table and instruction limits bound input work.
- Decompilation reports errors instead of silently returning empty source. Its file
  wrapper delegates to the same string conversion. Traversal has depth/work limits.
- Signed byte/word literals are sign-extended; escaped backslashes are preserved;
  binary expression parentheses retain the original tree during recompilation.
  These correctness changes are covered by semantic round-trip tests.
- The same core supports the evidenced IGI 2 8.7 header and opcode mapping, with
  format selection at compilation and detection at parsing.

The archived C# `project-igi-qvm-editor` was consulted only for workflow, naming,
file loading, theme and text-editor behavior. Its broad model/level features are
outside this project's scope. IGI 2 format differences are checked against local
format definitions and the user's privately installed game corpus.

Game data stays outside the repository. The committed objects QSC fixture comes
from MIT-licensed converter tests, rather than redistributing game assets.
