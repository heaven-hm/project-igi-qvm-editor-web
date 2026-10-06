# Release verification

Verification date: 2026-10-06. These are measured results, not a claim that every
possible game program or every source branch has been exercised.

## Engine and private corpus

- Native public API: **733 checks passed**, including both QVM versions,
  malformed binaries, deterministic mutations and alias-allocation limits.
- Browser engine boundary: **7 WASM tests passed**.
- Native/WASM parity: **2,014 checks passed** across the public source cases and
  **1,001 private QVM files**, comparing decoded source bytes and compiled bytes.
- Native semantic corpus checks: **1,001 files passed**, comparing instruction
  values, resolved symbols, branch targets and CALL targets after recompilation.
- WASM inspect/decompile/recompile/canonical stability: all private files passed.
- Original converter compatibility: the committed objects fixture compiles to
  identical bytes, and the original implementation reads the generated result.

Private provenance: 997 files from the owned game installation were QVM 8.5;
four additional local research fixtures included three authentic QVM 8.7 files
and one QVM 8.5 file. No private files or machine-specific paths are published.
No game execution test was performed; QVM 8.7 optional trailing metadata was
absent in the authentic samples.

## Coverage

LLVM instrumentation measured **85.12% line**, **80.03% branch** and **90.52%
function** coverage of the extracted native core after unit and corpus checks.
Reports are generated under `build/coverage/` and remain local. This is below
100%; passing every feature scenario does not change that measurement.

Browser results and their separate V8 byte-range metric are recorded after the
final local-static and deployed-site runs. See the feature traceability matrix.

## Independent review

A separate read-only reviewer reproduced the 733 native checks and seven WASM
tests. It checked untrusted binary bounds, semantic preservation, browser state
handling, portable paths, secret exclusions and deployment artifacts. It found
no additional code blockers. Source, built-site and prepared-deployment WASM
hashes matched. The static output contains application assets only.

The copied repository AGENTS rules and Matt Pocock TDD/code-review plus Heaven
source-driven-development/verification-before-completion guidance informed the
public-boundary regression tests and independent review. No installed third-party
package named “tester army” was found; the feature matrix describes the separate
test/review lanes without claiming an unavailable framework integration.
