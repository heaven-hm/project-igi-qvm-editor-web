# Project context

This is a static browser QSC/QVM IDE for Project IGI 1 and 2. Its only conversion
implementation is the extracted C++ core. Browser UI code does not interpret
bytecode or execute game scripts. Native tools exist for verification, not as an
additional end-user product.

Public test boundaries: C++ memory API, narrow WASM API, real browser actions and
downloads, and the deployed static site's assets. Test inputs are untrusted.
Private corpus directories are supplied at invocation time and are never bundled.

Read docs/UPSTREAM.md for provenance; tests/FEATURE-COVERAGE.md for requirement
traceability; docs/VALIDATION.md for completed verification evidence.

Use small commits after relevant checks. Preserve source-format knowledge and
verify native/WASM parity after C++ edits. UI tests must use matching browser/device
profiles, retain console failures, and verify saved bytes and semantic round trips.
