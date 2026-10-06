// Local licensed game files are read for verification only; never copied into the project.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import createModule from '../web/public/wasm/qvm.mjs';

if(!process.env.IGI_GAME_PATH)throw new Error('Set IGI_GAME_PATH to the local directory containing your owned IGI game files.');
const root = resolve(process.env.IGI_GAME_PATH);
const module = await createModule();
async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.qvm$/i.test(entry.name)) yield path;
  }
}
const report = { suite: 'local-game-corpus', total: 0, versions: {}, inspected: 0, decompiled: 0, recompiled: 0, stable: 0, failures: [] };
for await (const path of files(root)) {
  report.total++;
  const bytes = await readFile(path);
  const minor = bytes.length >= 12 ? bytes.readUInt32LE(8) : 0;
  report.versions[`8.${minor}`] = (report.versions[`8.${minor}`] || 0) + 1;
  const record = (stage, error) => report.failures.push({ file: relative(root, path), stage, error });
  const inspected = module.inspect(bytes);
  if (!inspected.ok) { record('inspect', inspected.error); continue; } report.inspected++;
  const decoded = module.decompile(bytes);
  if (!decoded.ok) { record('decompile', decoded.error); continue; } report.decompiled++;
  const compiled = module.compile(decoded.source, minor);
  if (!compiled.ok) { record('compile', compiled.error); continue; } report.recompiled++;
  const decodedAgain = module.decompile(compiled.binary);
  if (!decodedAgain.ok) { record('second decompile', decodedAgain.error); continue; }
  const compiledAgain = module.compile(decodedAgain.source, minor);
  if (!compiledAgain.ok || Buffer.compare(Buffer.from(compiled.binary), Buffer.from(compiledAgain.binary))) { record('canonical stability', compiledAgain.error || 'binary changed'); continue; }
  report.stable++;
}
if (!report.total) throw new Error('No QVM files found in local corpus');
const json = JSON.stringify(report, null, 2);
console.log(json);
if (process.env.CORPUS_REPORT) await writeFile(process.env.CORPUS_REPORT, json + '\n');
if (report.failures.length) process.exitCode = 1;
