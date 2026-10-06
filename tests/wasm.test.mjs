import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import createQVM from '../web/public/wasm/qvm.mjs';
const core = await createQVM();
const objects = await readFile(new URL('fixtures/objects.qsc', import.meta.url), 'utf8');

for (const minor of [5, 7]) {
  test(`QVM 8.${minor}: actual object script compiles, detects and preserves its output`, () => {
    const compiled = core.compile(objects, minor);
    assert.equal(compiled.ok, true, compiled.error);
    assert.equal(Buffer.from(compiled.binary).subarray(0, 4).toString(), 'LOOP');
    const info = core.inspect(compiled.binary);
    assert.equal(info.ok, true, info.error);
    assert.equal(info.metadata.version, `8.${minor}`);
    assert.equal(info.metadata.game, minor === 5 ? 'IGI 1' : 'IGI 2');
    assert.ok(info.metadata.instructions > 100);
    const decoded = core.decompile(compiled.binary);
    assert.equal(decoded.ok, true, decoded.error);
    assert.equal(core.validate(decoded.source).ok, true);
    const rebuilt = core.compile(decoded.source, minor);
    assert.deepEqual(Buffer.from(rebuilt.binary), Buffer.from(compiled.binary));
  });
  test(`QVM 8.${minor}: rejects invalid instructions and stays available`, () => {
    const original = Buffer.from(core.compile('Foo(1); Bar(2);', minor).binary);
    const code = original.readUInt32LE(44);
    const unknown = Buffer.from(original); unknown[code] = 255;
    assert.equal(core.inspect(unknown).ok, false);
    const wrap = Buffer.from(original); wrap.writeUInt32LE(0xfffffff0, 16); wrap.writeUInt32LE(256, 24);
    assert.equal(core.inspect(wrap).ok, false);
    const callOverflow = Buffer.from(original); callOverflow.writeUInt32LE(0xffffffff, code + 3);
    assert.equal(core.decompile(callOverflow).ok, false);
    for (let size = 0; size < original.length; ++size) {
      const result = core.inspect(original.subarray(0, size));
      assert.equal(result.ok, false, `truncation ${size}`);
      assert.ok(result.error);
    }
    let seed = 764533;
    for (let i = 0; i < 200; ++i) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const mutated = Buffer.from(original);
      mutated[seed % mutated.length] ^= (seed >>> 24) || 1;
      const result = core.decompile(mutated);
      assert.equal(typeof result.ok, 'boolean');
      if (!result.ok) assert.ok(result.error);
      assert.equal(core.validate('Foo(1);').ok, true);
    }
  });
}
test('structured lexer/parser diagnostics and numeric limits survive the WASM boundary', () => {
  for (const source of ['function(', 'Foo("bad);', 'Foo(0x);', 'Foo(1e+);', 'Foo(4294967296);', 'Foo(1e999);', '/* open', 'if (a) {', 'Foo(1 % 2);', '\0']) {
    const result = core.compile(source, 5);
    assert.equal(result.ok, false, source);
    assert.match(result.error, /(?:lex|parse) error at \d+:\d+:/);
  }
  const error = core.validate('Foo(1);\nBar(@);');
  assert.match(error.error, /at 2:5:/);
  assert.equal(core.validate('Foo(2147483648, 0xffffffff, 1e-30);').ok, true);
});
test('empty, random and oversized binaries return errors without aborting the runtime', () => {
  for (const bytes of [new Uint8Array(), Uint8Array.from([11, 42, 0, 91]), new Uint8Array(8 * 1024 * 1024 + 1)]) {
    const result = core.decompile(bytes);
    assert.equal(result.ok, false);
    assert.ok(result.error);
  }
  assert.equal(core.compile('Foo(1);', 5).ok, true);
});
test('WASM binary results own their data across later memory allocations', () => {
  const first = core.compile('Foo("keep this result", 15);', 7);
  const snapshot = Buffer.from(first.binary);
  for (let i = 0; i < 20; ++i) assert.equal(core.compile(objects, 5).ok, true);
  assert.deepEqual(Buffer.from(first.binary), snapshot);
  assert.equal(core.decompile(first.binary).ok, true);
});
