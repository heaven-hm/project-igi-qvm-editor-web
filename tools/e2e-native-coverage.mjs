import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {writeFile} from 'node:fs/promises';
// LLVM_BIN permits Homebrew, Linux and custom LLVM installations without source edits.
const llvm=process.env.LLVM_BIN||'';
const executable=name=>llvm?join(llvm,name):name;
const build=resolve('build/coverage');
function run(command,args,extra={}){
  const {quiet,...options}=extra;
  const result=spawnSync(command,args,{encoding:'utf8',stdio:'pipe',...options});
  if(result.stdout&&!quiet)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
  if(result.status!==0)throw new Error(`${command} exited ${result.status}: ${result.error||''}`);
  return result.stdout;
}
run('cmake',['-S','.','-B',build,'-DBUILD_TESTING=ON',`-DCMAKE_CXX_COMPILER=${executable('clang++')}`,'-DCMAKE_CXX_FLAGS=-fprofile-instr-generate -fcoverage-mapping','-DCMAKE_EXE_LINKER_FLAGS=-fprofile-instr-generate']);
run('cmake',['--build',build,'-j','4']);
const profiles=[join(build,'unit.profraw')];
run(join(build,'qvm_core_tests'),[],{env:{...process.env,LLVM_PROFILE_FILE:profiles[0]}});
const corpusPaths=process.argv.slice(2);
if(corpusPaths.length){profiles.push(join(build,'corpus.profraw'));run(join(build,'qvm_corpus_semantics'),corpusPaths,{env:{...process.env,LLVM_PROFILE_FILE:profiles[1]}});}
const profile=join(build,'core.profdata');
run(executable('llvm-profdata'),['merge','-sparse',...profiles,'-o',profile]);
const objects=[join(build,'qvm_core_tests'),'-object',join(build,'qvm_corpus_semantics'),`-instr-profile=${profile}`];
const report=run(executable('llvm-cov'),['report',...objects,'core']);
await writeFile(join(build,'coverage.txt'),report);
const json=run(executable('llvm-cov'),['export',...objects,'-summary-only','core'],{quiet:true});
await writeFile(join(build,'coverage.json'),json);
run(executable('llvm-cov'),['show',...objects,'-format=html',`-output-dir=${join(build,'html')}`,'core']);
