import Editor from '@monaco-editor/react';
import type {editor} from 'monaco-editor';
import {useEffect,useRef} from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
export function CodeEditor({source,onChange,theme,wrap,error,onEditor}:{source:string;onChange:(s:string)=>void;theme:string;wrap:boolean;error:string;onEditor:(e:editor.IStandaloneCodeEditor)=>void}){
  const ref=useRef<editor.IStandaloneCodeEditor|null>(null);
  useEffect(()=>{
    const model=ref.current?.getModel();if(!model)return;
    const match=error.match(/\b(?:at\s*|line\s*)(\d+)\s*(?::|,\s*(?:column\s*)?)(\d+)/i) || error.match(/\bline\s+(\d+)/i);
    monaco.editor.setModelMarkers(model,'qvm',error?[{severity:monaco.MarkerSeverity.Error,message:error,startLineNumber:Number(match?.[1]||1),endLineNumber:Number(match?.[1]||1),startColumn:Number(match?.[2]||1),endColumn:Number(match?.[2]||1)+1}]:[]);
  },[error]);
  return <Editor height="100%" language="qsc" value={source} theme={theme==='light'?'vs':'vs-dark'} onChange={value=>onChange(value||'')} loading={<div className="editor-loading">Loading source editor…</div>} onMount={instance=>{ref.current=instance;onEditor(instance);}} options={{ariaLabel:'QSC source editor',automaticLayout:true,minimap:{enabled:false},fontSize:14,lineHeight:23,fontFamily:'"SFMono-Regular", Consolas, "Liberation Mono", monospace',padding:{top:20,bottom:20},scrollBeyondLastLine:false,wordWrap:wrap?'on':'off',tabSize:4,renderLineHighlight:'line',bracketPairColorization:{enabled:true}}}/>;
}
