import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
// V8 byte-range coverage measures executable JS bytes, not TS source lines or branches.
const directory=process.argv[2]||'test-results/coverage-local';
const scripts=new Map();
for(const name of await readdir(directory))if(name.endsWith('.json')&&name!=='summary.json')for(const item of JSON.parse(await readFile(join(directory,name),'utf8'))){
  if(!/\/src\/|\/assets\/index-/.test(item.url)||!item.source)continue;
  const key=item.url.replace(/^https?:\/\/[^/]+/,'');
  const stored=scripts.get(key)||{source:item.source,executed:new Uint8Array(item.source.length)};
  const current=new Uint8Array(item.source.length);
  const ranges=item.functions.flatMap(f=>f.ranges).sort((a,b)=>(b.endOffset-b.startOffset)-(a.endOffset-a.startOffset));
  for(const r of ranges)current.fill(r.count>0?1:0,r.startOffset,r.endOffset);
  for(let i=0;i<current.length;i++)if(current[i])stored.executed[i]=1;
  scripts.set(key,stored);
}
const report=[];let total=0,covered=0;
for(const [url,{source,executed}] of scripts){
  const bytes=executed.reduce((sum,value)=>sum+value,0);total+=source.length;covered+=bytes;
  report.push({url,totalBytes:source.length,coveredBytes:bytes,percent:Number((100*bytes/source.length).toFixed(2))});
}
const output={metric:'V8 executed JS byte ranges (bundled dependencies included for production)',totalBytes:total,coveredBytes:covered,percent:total?Number((100*covered/total).toFixed(2)):0,scripts:report};
await writeFile(join(directory,'summary.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
