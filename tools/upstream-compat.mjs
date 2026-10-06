import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const upstream = process.argv[2];
if (!upstream) throw new Error('Usage: node tools/upstream-compat.mjs /path/to/project-igi-converter');
const build = resolve('build-compat');
mkdirSync(build, { recursive: true });
function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${command} failed: ${r.stderr || r.stdout}`);
}
const source = resolve(upstream, 'source');
const parsers = resolve(source, 'parsers');
const exe = resolve(build, 'upstream-native');
run(process.env.CXX || 'c++', ['-std=c++20', '-O2', '-I', source, '-I', parsers,
  'tools/upstream-native.cpp', ...['qsc_lexer', 'qsc_parser', 'qvm_compiler', 'qvm_parser', 'qvm_decompiler'].map(n => resolve(parsers, `${n}.cpp`)), '-o', exe]);
const fixture = resolve('tests/fixtures/objects.qsc');
const original = resolve(build, 'original.qvm');
const current = resolve(build, 'current.qvm');
run(exe, ['compile', fixture, original]);
run(resolve(process.env.QVM_NATIVE || 'build/native/qvm_native'), ['compile', fixture, current]);
assert.deepEqual(readFileSync(current), readFileSync(original), 'IGI 1 compiler output must match authoritative desktop converter byte-for-byte');
run(exe, ['decompile', current, resolve(build, 'desktop.qsc')]);
assert.ok(readFileSync(resolve(build, 'desktop.qsc')).length, 'Desktop converter must decompile the generated binary');
console.log('PASS: native compiler output equals original converter; original converter parses and decompiles generated QVM');
