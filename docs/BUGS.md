# Regression record

The copied AGENTS instructions request persistent bug records. No mem0 tool was
available in this session, so this repository keeps the actionable records here.

- Binary table order: read offsets rather than assuming pool order; reject invalid
  offsets and bound alias expansion. Native regressions cover both formats.
- Decompiled control flow: preserve branch and CALL targets; reject unsupported
  structures through semantic recompilation instead of silently changing scripts.
- Integer portability: explicitly constrain 32-bit literals for native/WASM parity.
- Unicode diagnostics: translate UTF-8 byte columns to Monaco UTF-16 positions.
- Document line endings: initialize Monaco with the imported LF/CRLF convention.
- Stale asynchronous operations: revision guards protect newer edits during reads
  and compilation; transport timeouts terminate the worker and permit retry.
- Mobile testing: use matching browser/device profiles, including genuine WebKit
  for iPhone Safari rather than spoofing Safari in Chromium.
- Opening QVM previously only inspected its header, leaving the source editor
  empty. The default import option now decompiles it into the editor; users can
  disable that option for manual inspection.
- Saving updated QVM now compiles the current source and selected target before
  downloading. Revision guards prevent downloading a result for superseded edits.
