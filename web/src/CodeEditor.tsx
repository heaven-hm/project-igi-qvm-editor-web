import Editor from '@monaco-editor/react';
import type {editor} from 'monaco-editor';
import {useEffect,useRef} from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
export function CodeEditor({source,onChange,theme,wrap,error,onEditor}:{source:string;onChange:(s:string)=>void;theme:string;wrap:boolean;error:string;onEditor:(e:editor.IStandaloneCodeEditor)=>void}){
  const ref=useRef<editor.IStandaloneCodeEditor|null>(null);
  const changingEol=useRef(false);
  function preserveEol(instance:editor.IStandaloneCodeEditor){
    const model=instance.getModel();
    const wanted=source.includes('\r\n')?'\r\n':'\n';
    if(model&&model.getEOL()!==wanted){changingEol.current=true;try{model.setEOL(wanted==='\r\n'?monaco.editor.EndOfLineSequence.CRLF:monaco.editor.EndOfLineSequence.LF);}finally{changingEol.current=false;}}
  }
  useEffect(()=>{if(ref.current)preserveEol(ref.current);},[source]);
  useEffect(()=>{
    const model=ref.current?.getModel();if(!model)return;
    const match=error.match(/\b(?:at\s*|line\s*)(\d+)\s*(?::|,\s*(?:column\s*)?)(\d+)/i) || error.match(/\bline\s+(\d+)/i);
    const line=Math.max(1,Math.min(Number(match?.[1]||1),model.getLineCount()));
    const byteOffset=Number(match?.[2]||1)-1;
    let bytes=0,column=1;
    // The native lexer counts UTF-8 bytes; Monaco columns count UTF-16 code units.
    for(const character of model.getLineContent(line)){
      const code=character.codePointAt(0)!;
      const width=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;
      if(bytes+width>byteOffset)break;
      bytes+=width;column+=character.length;
    }
    monaco.editor.setModelMarkers(model,'qvm',error?[{severity:monaco.MarkerSeverity.Error,message:error,startLineNumber:line,endLineNumber:line,startColumn:column,endColumn:column+1}]:[]);
  },[error]);
  return <Editor height="100%" language="qsc" value={source} theme={theme==='light'?'vs':theme==='midnight'?'igi-midnight':'vs-dark'} onChange={value=>{if(!changingEol.current)onChange(value||'');}} loading={<div className="editor-loading">Loading source editor…</div>} onMount={instance=>{ref.current=instance;preserveEol(instance);onEditor(instance);}} options={{ariaLabel:'QSC source editor',automaticLayout:true,minimap:{enabled:false},fontSize:14,lineHeight:23,fontFamily:'"SFMono-Regular", Consolas, "Liberation Mono", monospace',padding:{top:20,bottom:20},scrollBeyondLastLine:false,wordWrap:wrap?'on':'off',tabSize:4,renderLineHighlight:'line',bracketPairColorization:{enabled:true}}}/>;
}
