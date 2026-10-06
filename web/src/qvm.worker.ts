import type {Operation, Result} from './types';
interface Engine {compile(source:string,minor:number):Result;validate(source:string):Result;inspect(bytes:Uint8Array):Result;decompile(bytes:Uint8Array):Result}
let engine:Engine;
async function initialize(){
  const base = new URL(import.meta.env.BASE_URL+'wasm/',self.location.origin).href;
  const module = await import(/* @vite-ignore */base+'qvm.mjs');
  engine = await module.default({locateFile:(file:string)=>base+file});
}
self.onmessage=async(event:MessageEvent<{id:number;operation:Operation|'init';source?:string;minor?:number;bytes?:Uint8Array}>)=>{
  const {id,operation,source='',minor=5,bytes}=event.data;
  try {
    if(operation==='init'){await initialize();self.postMessage({id,result:{ok:true}});return;}
    if(!engine)throw new Error('The QVM engine is not ready.');
    const result=operation==='compile'?engine.compile(source,minor):operation==='validate'?engine.validate(source):engine[operation](bytes!);
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,result:{ok:false,error:error instanceof Error?error.message:String(error)},fatal:true});}
};
