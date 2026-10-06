import {useCallback,useEffect,useRef,useState} from 'react';
import type {Operation,Result} from './types';
export function useEngine(){
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
  const [error,setError]=useState('');
  const worker=useRef<Worker|null>(null);
  const nextId=useRef(0);
  const pending=useRef(new Map<number,{resolve:(result:Result)=>void;timer:ReturnType<typeof setTimeout>}>());
  const fail=useCallback((message:string)=>{worker.current?.terminate();worker.current=null;for(const p of pending.current.values()){clearTimeout(p.timer);p.resolve({ok:false,error:message});}pending.current.clear();setState('error');setError(message);},[]);
  const request=useCallback((operation:Operation|'init',payload:Record<string,unknown>={})=>new Promise<Result>(resolve=>{
    if(!worker.current){resolve({ok:false,error:'The QVM engine is unavailable. Please retry loading it.'});return;}
    const id=++nextId.current;
    const timer=setTimeout(()=>fail('The QVM engine timed out. Retry loading the engine before trying again.'),45000);
    pending.current.set(id,{resolve,timer});worker.current.postMessage({id,operation,...payload});
  }),[fail]);
  const retry=useCallback(()=>{
    worker.current?.terminate();
    for(const p of pending.current.values()){clearTimeout(p.timer);p.resolve({ok:false,error:'Engine restarted.'});}pending.current.clear();
    setState('loading');setError('');
    try{
      worker.current=new Worker(new URL('./qvm.worker.ts',import.meta.url),{type:'module'});
      worker.current.onerror=()=>fail('Unable to run the QVM engine. Check your connection and retry.');
      worker.current.onmessage=({data}:{data:{id:number;result:Result;fatal?:boolean}})=>{
        const p=pending.current.get(data.id);if(p){clearTimeout(p.timer);pending.current.delete(data.id);p.resolve(data.result);}if(data.fatal)fail(data.result.error||'QVM runtime failure.');
      };
      void request('init').then(result=>{if(result.ok)setState('ready');else fail(result.error||'Failed to load the QVM engine.');});
    }catch(e){fail(String(e));}
  },[fail,request]);
  useEffect(()=>{retry();return()=>{worker.current?.terminate();for(const p of pending.current.values())clearTimeout(p.timer);pending.current.clear();};},[retry]);
  return {state,error,retry,request};
}
