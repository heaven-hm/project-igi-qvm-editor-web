import type {editor} from 'monaco-editor';
import {useEffect,useRef} from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
export function CodeEditor({documentId,openIds,source,onChange,theme,wrap,error,onEditor}:{documentId:string;openIds:string[];source:string;onChange:(s:string)=>void;theme:string;wrap:boolean;error:string;onEditor:(e:editor.IStandaloneCodeEditor)=>void}){
  const container=useRef<HTMLDivElement>(null),ref=useRef<editor.IStandaloneCodeEditor|null>(null);
  const models=useRef(new Map<string,editor.ITextModel>()),views=useRef(new Map<string,editor.ICodeEditorViewState>());
  const current=useRef(''),changing=useRef(false),latest=useRef({source,onChange,onEditor});
  latest.current={source,onChange,onEditor};
  useEffect(()=>{
    const instance=monaco.editor.create(container.current!,{ariaLabel:'QSC source editor',automaticLayout:true,minimap:{enabled:false},occurrencesHighlight:'off',fontSize:14,lineHeight:23,fontFamily:'"SFMono-Regular", Consolas, "Liberation Mono", monospace',padding:{top:20,bottom:20},scrollBeyondLastLine:false,tabSize:4,renderLineHighlight:'line',bracketPairColorization:{enabled:true}});
    ref.current=instance;
    const listener=instance.onDidChangeModelContent(()=>{if(!changing.current)latest.current.onChange(instance.getValue());});
    latest.current.onEditor(instance);
    return()=>{listener.dispose();instance.dispose();for(const model of models.current.values())model.dispose();models.current.clear();views.current.clear();current.current='';};
  },[]);
  useEffect(()=>{
    const instance=ref.current;if(!instance)return;
    changing.current=true;
    try{
      if(current.current!==documentId){
        const view=instance.saveViewState();if(view)views.current.set(current.current,view);
        let model=models.current.get(documentId);
        if(!model){model=monaco.editor.createModel(source,'qsc',monaco.Uri.parse('igi-qsc://workspace/'+documentId+'.qsc'));models.current.set(documentId,model);}
        instance.setModel(model);current.current=documentId;
        const saved=views.current.get(documentId);if(saved)instance.restoreViewState(saved);
      }
      const model=instance.getModel()!;
      if(model.getValue()!==source)model.setValue(source);
      const eol=source.includes('\r\n')?'\r\n':'\n';
      if(model.getEOL()!==eol)model.setEOL(eol==='\r\n'?monaco.editor.EndOfLineSequence.CRLF:monaco.editor.EndOfLineSequence.LF);
      for(const [id,closed] of models.current)if(!openIds.includes(id)){closed.dispose();models.current.delete(id);views.current.delete(id);}
    }finally{changing.current=false;}
  },[documentId,source,openIds.join(',')]);
  useEffect(()=>{monaco.editor.setTheme(theme==='light'?'vs':theme==='midnight'?'igi-midnight':'vs-dark');ref.current?.updateOptions({wordWrap:wrap?'on':'off'});},[theme,wrap]);
  useEffect(()=>{
    const model=ref.current?.getModel();if(!model)return;
    const match=error.match(/\b(?:at\s*|line\s*)(\d+)\s*(?::|,\s*(?:column\s*)?)(\d+)/i)||error.match(/\bline\s+(\d+)/i);
    const line=Math.max(1,Math.min(Number(match?.[1]||1),model.getLineCount())),byteOffset=Number(match?.[2]||1)-1;
    let bytes=0,column=1;
    for(const character of model.getLineContent(line)){
      const code=character.codePointAt(0)!,width=code<=0x7f?1:code<=0x7ff?2:code<=0xffff?3:4;
      if(bytes+width>byteOffset)break;bytes+=width;column+=character.length;
    }
    monaco.editor.setModelMarkers(model,'qvm',error?[{severity:monaco.MarkerSeverity.Error,message:error,startLineNumber:line,endLineNumber:line,startColumn:column,endColumn:column+1}]:[]);
  },[error,source,documentId]);
  return <div ref={container} className="monaco-host"/>;
}
