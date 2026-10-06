import {useEffect,useRef,useState} from 'react';
import type {editor} from 'monaco-editor';
import {ArrowDownToLine,Check,ChevronRight,Code2,FilePlus2,FolderOpen,Play,Search,ShieldCheck,WrapText} from 'lucide-react';
import {CodeEditor} from './CodeEditor';
import {Inspector} from './Inspector';
import {useEngine} from './useEngine';
import type {Metadata} from './types';
function download(bytes:BlobPart,name:string){const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function App(){
  const engine=useEngine();
  const [source,setSource]=useState(''),[name,setName]=useState('untitled.qsc'),[dirty,setDirty]=useState(false);
  const [minor,setMinor]=useState(5),[theme,setTheme]=useState(()=>{try{return ['dark','light','midnight'].includes(localStorage.getItem('igi-theme')||'')?localStorage.getItem('igi-theme')!:'dark';}catch{return 'dark';}});
  const [wrap,setWrap]=useState(false),[busy,setBusy]=useState(''),[message,setMessage]=useState('Open a QSC or QVM file to begin.'),[error,setError]=useState('');
  const [binary,setBinary]=useState<Uint8Array>(),[binaryName,setBinaryName]=useState(''),[metadata,setMetadata]=useState<Metadata>(),[compiled,setCompiled]=useState<Uint8Array>();
  const [drag,setDrag]=useState(false),[position,setPosition]=useState({lineNumber:1,column:1});
  const revision=useRef(0),loadId=useRef(0),fileInput=useRef<HTMLInputElement>(null),editorRef=useRef<editor.IStandaloneCodeEditor|null>(null);
  const ready=engine.state==='ready';
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('igi-theme',theme);}catch{/* Theme works without storage. */}},[theme]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function edit(value:string){revision.current++;setSource(value);setDirty(true);setCompiled(undefined);setError('');setMessage('Source changed. Compile to create a new QVM.');}
  function replace(value:string,filename:string){revision.current++;setSource(value);setName(filename);setDirty(false);setCompiled(undefined);setError('');}
  function save(){download(source,name.replace(/\.qvm$/i,'.qsc'));setDirty(false);setMessage('QSC source downloaded.');}
  function newFile(){if(dirty&&!confirm('Discard unsaved source changes and create a new file?'))return;loadId.current++;replace('','untitled.qsc');setBinary(undefined);setMetadata(undefined);setMessage('New QSC document.');editorRef.current?.focus();}
  async function load(file:File){
    if(busy)return;
    const ext=file.name.split('.').pop()?.toLowerCase();
    if(ext!=='qsc'&&ext!=='qvm'){setError('Unsupported file. Open a .qsc source script or a .qvm game binary.');return;}
    if(file.size>(ext==='qsc'?4:8)*1024*1024){setError(`File is too large. The limit is ${ext==='qsc'?4:8} MiB for ${ext.toUpperCase()} files.`);return;}
    if(dirty&&!confirm('Discard unsaved source changes and open this file?'))return;
    if(ext==='qvm'&&!ready){setError('Wait for the QVM engine to load before opening a binary.');return;}
    const id=++loadId.current,rev=revision.current;setBusy('Opening file');setError('');
    try{
      if(ext==='qsc'){const text=await file.text();if(id!==loadId.current||rev!==revision.current){setMessage('File open cancelled because the source changed.');return;}replace(text,file.name);setBinary(undefined);setMetadata(undefined);setMessage(`Opened ${file.name}. Choose the target game before compiling.`);}
      else{const bytes=new Uint8Array(await file.arrayBuffer());const result=await engine.request('inspect',{bytes});if(id!==loadId.current||rev!==revision.current){setMessage('File open cancelled because the source changed.');return;}if(!result.ok){setError(result.error||'Invalid QVM file.');return;}setBinary(bytes);setBinaryName(file.name);setMetadata(result.metadata);setMinor(result.metadata?.version==='8.7'?7:5);setCompiled(undefined);revision.current++;setMessage(`Detected ${result.metadata?.game}. Select Decompile to QSC to edit its source.`);}
    }catch(e){setError(`Unable to open file: ${String(e)}`);}finally{setBusy('');}
  }
  async function run(operation:'compile'|'validate'){
    if(!ready||busy)return;if(!source.trim()){setError('The source is empty. Open a QSC file or write a script first.');return;}
    if(new TextEncoder().encode(source).length>4*1024*1024){setError('Source is too large. The QSC limit is 4 MiB.');return;}
    const rev=revision.current;setBusy(operation==='compile'?'Compiling':'Validating');setError('');
    const result=await engine.request(operation,{source,minor});setBusy('');
    if(rev!==revision.current){setMessage('Source or target changed during the operation. Run it again.');return;}
    if(!result.ok){setCompiled(undefined);setError(result.error||'The toolchain rejected this source.');return;}
    if(operation==='compile'){setCompiled(result.binary);setBinary(result.binary);setBinaryName(name.replace(/\.qsc$/i,'.qvm'));setMetadata(result.metadata);setMessage(`Compiled successfully for IGI ${minor===5?'1':'2'}. Your QVM is ready to download.`);}else setMessage('Validation passed. No source errors found.');
  }
  async function decompile(){
    if(!binary||!ready||busy)return;if(dirty&&!confirm('Replace unsaved source changes with the decompiled QVM?'))return;
    const rev=revision.current;setBusy('Decompiling');setError('');const result=await engine.request('decompile',{bytes:binary});setBusy('');
    if(rev!==revision.current){setMessage('Decompilation cancelled because the source changed.');return;}
    if(!result.ok){setError(result.error||'Unable to decompile this QVM.');return;}
    replace(result.source||'',binaryName.replace(/\.qvm$/i,'.qsc'));setMessage('QVM decompiled. Edit the source, then compile for your target game.');
  }
  const actions=useRef({save,run});actions.current={save,run};
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(!(event.ctrlKey||event.metaKey)||event.altKey)return;if(event.key.toLowerCase()==='s'){event.preventDefault();actions.current.save();}else if(event.key.toLowerCase()==='o'){event.preventDefault();fileInput.current?.click();}else if(event.key==='Enter'){event.preventDefault();void actions.current.run('compile');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  return <div className="studio" onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files.length!==1){setError('Open one QSC or QVM file at a time.');return;}void load(e.dataTransfer.files[0]);}}>
    <header className="topbar"><a className="brand" href="./" aria-label="IGI QVM Studio home"><span className="brand-icon"><Code2 size={22}/></span><div><h1>IGI QVM <span>STUDIO</span></h1><small>PROJECT IGI · SCRIPT WORKSPACE</small></div></a><div className="topbar-right"><span className={`engine-state ${engine.state}`}><i/>{engine.state==='ready'?'Engine ready':engine.state==='loading'?'Loading engine':'Engine unavailable'}</span><label className="theme-label" htmlFor="theme">Theme<select id="theme" name="theme" aria-label="Theme" value={theme} onChange={e=>setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="midnight">Midnight</option></select></label><a className="repo-link" href="https://github.com/heaven-hm/project-igi-qvm-editor-online" target="_blank" rel="noreferrer">GitHub ↗</a></div></header>
    <div className="workspace-heading"><div><div className="eyebrow">BROWSER WORKSPACE <ChevronRight size={12}/> QSC EDITOR</div><h2>QSC workspace</h2><p>Edit, validate and compile scripts for Project IGI 1 & 2.</p></div><span className="local-badge"><ShieldCheck size={15}/> Local processing</span></div>
    <div className="toolbar"><div className="toolbar-group"><button className="button" onClick={()=>fileInput.current?.click()} disabled={!!busy}><FolderOpen size={16}/> Open file</button><button className="button icon-button" aria-label="New QSC file" title="New QSC file" onClick={newFile} disabled={!!busy}><FilePlus2 size={16}/></button><button className="button" onClick={save}><ArrowDownToLine size={16}/> Save QSC</button></div><div className="toolbar-group"><label className="target-label" htmlFor="compile-target">Compile target<select id="compile-target" name="compile-target" aria-label="Compile target" value={minor} onChange={e=>{revision.current++;setMinor(Number(e.target.value));setCompiled(undefined);setMessage('Target changed. Compile to create a new QVM.');}}><option value={5}>IGI 1 · QVM 8.5</option><option value={7}>IGI 2 · QVM 8.7</option></select></label><button className="button" onClick={()=>void run('validate')} disabled={!ready||!!busy}><Check size={16}/> Validate</button><button className="button primary" onClick={()=>void run('compile')} disabled={!ready||!!busy}><Play size={15}/>{busy||'Compile QVM'}</button></div></div>
    <input id="open-file" name="open-file" ref={fileInput} type="file" accept=".qsc,.qvm" aria-label="Open QSC or QVM file" className="file-input" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void load(f);}}/>
    {engine.state==='error'&&<div className="engine-error" role="alert"><span>{engine.error}</span><button className="button" onClick={engine.retry}>Retry engine</button></div>}
    <main className="workspace"><section className="editor-pane" aria-label="Source workspace"><div className="editor-header"><div className="file-tab"><FilePlus2 size={15}/><span>{name}</span>{dirty&&<span className="dirty-dot" aria-label="Unsaved changes"/>}<span className="file-type">QSC</span></div><div className="editor-controls"><button className="button icon-button" aria-label="Find in source" title="Find in source" onClick={()=>editorRef.current?.getAction('actions.find')?.run()}><Search size={16}/></button><button className={`button icon-button ${wrap?'active':''}`} aria-label="Toggle word wrap" aria-pressed={wrap} title="Toggle word wrap" onClick={()=>setWrap(!wrap)}><WrapText size={17}/></button></div></div><div className="code-area"><CodeEditor source={source} onChange={edit} theme={theme} wrap={wrap} error={error} onEditor={e=>{editorRef.current=e;e.onDidChangeCursorPosition(event=>setPosition(event.position));}}/></div><section className={`diagnostics ${error?'has-error':''}`} aria-label="Diagnostics"><div className="diagnostics-heading"><span>{error?'ERROR':'OUTPUT'}</span><small>{busy?`${busy}…`:error?'Action required':'Toolchain messages'}</small></div><p role={error?'alert':'status'}>{error||message}</p></section><div className="editor-status"><span>Ln {position.lineNumber}, Col {position.column}</span><span>UTF-8 <span className="status-separator">·</span> QSC <span className="status-separator">·</span> {source.split('\n').length} lines</span></div></section><Inspector metadata={metadata} binaryName={binaryName} binaryLoaded={!!binary} busy={!!busy} ready={ready} onDecompile={()=>void decompile()} onDownload={()=>{if(compiled)download(compiled.slice().buffer,name.replace(/\.qsc$/i,'.qvm'));}} downloadReady={!!compiled}/></main>
    <footer><span>IGI QVM Studio <span className="status-separator">/</span> Open source tools for the IGI community</span><span><kbd>⌘ / Ctrl</kbd> + O open <span className="status-separator">·</span> + S save <span className="status-separator">·</span> + Enter compile</span></footer>
    {drag&&<div className="drop-overlay"><FolderOpen size={38}/><h2>Drop your QSC or QVM here</h2><p>One file · QSC up to 4 MiB · QVM up to 8 MiB</p></div>}
  </div>;
}
