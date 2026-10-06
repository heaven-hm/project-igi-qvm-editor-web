import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import createModule from '../web/public/wasm/qvm.mjs';

const module = await createModule();
const native = resolve(process.env.QVM_NATIVE || 'build/native/qvm_native');
const dir = await mkdtemp(join(tmpdir(), 'qvm-parity-'));
let checks = 0;
try {
  const sources = [await readFile('tests/fixtures/objects.qsc', 'utf8'), 'a = 1 + 2 * 3; Foo(-1, "test", FALSE);', 'if (a) { Foo(1); } else { Foo(2); } while (a < 4) { a = a + 1; }'];
  for (const minor of [5, 7]) for (const [i, source] of sources.entries()) {
    const input = join(dir, `input-${i}.qsc`), binaryPath = join(dir, `native-${i}-${minor}.qvm`), sourcePath = join(dir, 'decoded.qsc');
    await writeFile(input, source);
    const compiled = spawnSync(native, ['compile', input, binaryPath, String(minor)], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr);
    const wasm = module.compile(source, minor);
    assert.equal(wasm.ok, true, wasm.error);
    const nativeBytes = await readFile(binaryPath);
    assert.deepEqual(Buffer.from(wasm.binary), nativeBytes, `exact compile parity target 8.${minor}`); checks++;
    const decoded = spawnSync(native, ['decompile', binaryPath, sourcePath], { encoding: 'utf8' });
    assert.equal(decoded.status, 0, decoded.stderr);
    const wasmSource = module.decompile(nativeBytes);
    assert.equal(wasmSource.ok, true, wasmSource.error);
    assert.equal(wasmSource.source, await readFile(sourcePath, 'utf8'), 'exact decompile parity'); checks++;
  }
  async function* corpus(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) yield* corpus(file);
      else if (/\.qvm$/i.test(entry.name)) yield file;
    }
  }
  let files = 0;
  for (const root of process.argv.slice(2)) for await (const file of corpus(root)) {
    const bytes = await readFile(file);
    const decodedPath = join(dir, 'corpus.qsc');
    const decoded = spawnSync(native, ['decompile', file, decodedPath], { encoding: 'utf8' });
    assert.equal(decoded.status, 0, decoded.stderr);
    const wasm = module.decompile(bytes);
    assert.equal(wasm.ok, true, wasm.error);
    const nativeSource = await readFile(decodedPath);
    assert.deepEqual(Buffer.from(wasm.source, 'utf8'), nativeSource, 'full corpus source bytes match native output');
    const minor = bytes.readUInt32LE(8);
    const nativeBinary = join(dir, 'corpus.qvm');
    const compiled = spawnSync(native, ['compile', decodedPath, nativeBinary, String(minor)], { encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.stderr);
    const wasmCompiled = module.compile(wasm.source, minor);
    assert.equal(wasmCompiled.ok, true, wasmCompiled.error);
    assert.deepEqual(Buffer.from(wasmCompiled.binary), await readFile(nativeBinary), 'full corpus compile bytes match native output');
    files++; checks += 2;
  }
  console.log(JSON.stringify({ suite: 'native-wasm-parity', checks, corpusFiles: files, passed: true }));
} finally { await rm(dir, { recursive: true, force: true }); }
