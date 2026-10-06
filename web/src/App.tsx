import {useEffect,useRef,useState} from 'react';
import type {editor} from 'monaco-editor';
import {ArrowDownToLine,Check,Code2,FilePlus2,FolderOpen,Play,Search,WrapText,X,PanelRightClose,PanelRightOpen,ChevronDown} from 'lucide-react';
import {CodeEditor} from './CodeEditor';
import {Inspector} from './Inspector';
import {useEngine} from './useEngine';
import type {Metadata} from './types';
function download(bytes:BlobPart,name:string){const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
interface WorkspaceFile {id:string;source:string;name:string;dirty:boolean;minor:number;message:string;error:string;binary?:Uint8Array;binaryName:string;metadata?:Metadata;compiled?:Uint8Array}
const blank=(id:string):WorkspaceFile=>({id,source:'',name:'untitled.qsc',dirty:false,minor:5,message:'Open a QSC or QVM file to begin.',error:'',binaryName:''});
export default function App(){
  const engine=useEngine();
  const [files,setFiles]=useState<WorkspaceFile[]>([blank('1')]),[activeId,setActiveId]=useState('1');
  const filesRef=useRef(files),activeRef=useRef(activeId),nextId=useRef(1);
  function updateFiles(next:WorkspaceFile[]){filesRef.current=next;setFiles(next);}
  function field<K extends keyof WorkspaceFile>(key:K){return (value:WorkspaceFile[K])=>updateFiles(filesRef.current.map(file=>file.id===activeRef.current?{...file,[key]:value}:file));}
  const {source,name,dirty,minor,message,error,binary,binaryName,metadata,compiled}=files.find(file=>file.id===activeId)!;
  const setSource=field('source'),setName=field('name'),setDirty=field('dirty'),setMinor=field('minor'),setMessage=field('message'),setError=field('error'),setBinary=field('binary'),setBinaryName=field('binaryName'),setMetadata=field('metadata'),setCompiled=field('compiled');
  const [theme,setTheme]=useState(()=>{try{return ['dark','light','midnight'].includes(localStorage.getItem('igi-theme')||'')?localStorage.getItem('igi-theme')!:'dark';}catch{return 'dark';}});
  const [panelOpen,setPanelOpen]=useState(false),[saveMenu,setSaveMenu]=useState(false);
  const saveContainer=useRef<HTMLDivElement>(null);
  useEffect(()=>{const outside=(event:PointerEvent)=>{if(!saveContainer.current?.contains(event.target as Node))setSaveMenu(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSaveMenu(false);saveContainer.current?.querySelector('button')?.focus();}};if(saveMenu){document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);}return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[saveMenu]);
  const [wrap,setWrap]=useState(false),[busy,setBusy]=useState('');
  const [drag,setDrag]=useState(false),[position,setPosition]=useState({lineNumber:1,column:1});
  const revision=useRef(0),loadId=useRef(0),fileInput=useRef<HTMLInputElement>(null),editorRef=useRef<editor.IStandaloneCodeEditor|null>(null);
  const ready=engine.state==='ready';
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('igi-theme',theme);}catch{/* Theme works without storage. */}},[theme]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(filesRef.current.some(file=>file.dirty)){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  function edit(value:string){revision.current++;setSource(value);setDirty(true);setCompiled(undefined);setError('');setMessage('Source changed. Compile to create a new QVM.');}
  function replace(value:string,filename:string){revision.current++;setSource(value);setName(filename);setDirty(false);setCompiled(undefined);setError('');}
  function save(){download(source,name.replace(/\.qvm$/i,'.qsc'));setDirty(false);setMessage('QSC source downloaded.');}
  function activate(id:string){revision.current++;loadId.current++;activeRef.current=id;setActiveId(id);setPosition({lineNumber:1,column:1});}
  function addFile(){
    const id=String(++nextId.current),initial=filesRef.current;
    if(initial.length>=20){setError('Close a tab before opening more files. The limit is 20 tabs.');return false;}
    const empty=initial.length===1&&!initial[0].dirty&&!initial[0].source&&!initial[0].binary;
    updateFiles(empty?[blank(id)]:[...initial,blank(id)]);activate(id);return true;
  }
  function newFile(){if(!addFile())return;setMessage('New QSC document.');editorRef.current?.focus();}
  function closeFile(id:string){
    const file=filesRef.current.find(file=>file.id===id);if(!file||busy)return;
    if(file.dirty&&!confirm('Discard unsaved source changes and close this file?'))return;
    let remaining=filesRef.current.filter(file=>file.id!==id);
    if(!remaining.length)remaining=[blank(String(++nextId.current))];
    updateFiles(remaining);if(activeRef.current===id)activate(remaining[remaining.length-1].id);
  }
  async function loadFiles(incoming:File[]){if(busy)return;for(const file of incoming)await load(file);}
  async function load(file:File){
    const ext=file.name.split('.').pop()?.toLowerCase();
    if(ext!=='qsc'&&ext!=='qvm'){setError('Unsupported file. Open a .qsc source script or a .qvm game binary.');return;}
    if(file.size>(ext==='qsc'?4:8)*1024*1024){setError(`File is too large. The limit is ${ext==='qsc'?4:8} MiB for ${ext.toUpperCase()} files.`);return;}
    if(ext==='qvm'&&!ready){setError('Wait for the QVM engine to load before opening a binary.');return;}
    const id=++loadId.current,rev=revision.current;setBusy('Opening file');setError('');
    try{
      if(ext==='qsc'){const text=await file.text();if(id!==loadId.current||rev!==revision.current){setMessage('File open cancelled because the source changed.');return;}if(!addFile())return;replace(text,file.name);setBinary(undefined);setMetadata(undefined);setMessage(`Opened ${file.name}. Choose the target game before compiling.`);}
      else{const bytes=new Uint8Array(await file.arrayBuffer());const result=await engine.request('inspect',{bytes});if(id!==loadId.current||rev!==revision.current){setMessage('File open cancelled because the source changed.');return;}if(!result.ok){setError(result.error||'Invalid QVM file.');return;}const decoded=await engine.request('decompile',{bytes});if(id!==loadId.current||rev!==revision.current){setMessage('File open cancelled because the source changed.');return;}if(!addFile())return;setBinary(bytes);setBinaryName(file.name);setMetadata(result.metadata);setMinor(result.metadata?.version==='8.7'?7:5);replace(decoded?.ok?decoded.source||'':'',file.name.replace(/\.qvm$/i,'.qsc'));if(decoded&&!decoded.ok){setError(decoded.error||'This QVM cannot be converted to editable source.');return;}setMessage(`Detected ${result.metadata?.game}. QVM source opened in the editor. Edit it and save as QSC or QVM.`);}
    }catch(e){setError(`Unable to open file: ${String(e)}`);}finally{setBusy('');}
  }
  async function run(operation:'compile'|'validate',saveOutput=false){
    if(!ready||busy)return;if(!source.trim()){setError('The source is empty. Open a QSC file or write a script first.');return;}
    if(new TextEncoder().encode(source).length>4*1024*1024){setError('Source is too large. The QSC limit is 4 MiB.');return;}
    const rev=revision.current;setBusy(operation==='compile'?'Compiling':'Validating');setError('');
    const result=await engine.request(operation,{source,minor});setBusy('');
    if(rev!==revision.current){setMessage('Source or target changed during the operation. Run it again.');return;}
    if(!result.ok){setCompiled(undefined);setError(result.error||'The toolchain rejected this source.');return;}
    if(operation==='compile'){setCompiled(result.binary);setBinary(result.binary);setBinaryName(name.replace(/\.qsc$/i,'.qvm'));setMetadata(result.metadata);if(saveOutput&&result.binary){download(result.binary.slice().buffer,name.replace(/\.qsc$/i,'.qvm'));setMessage(`Updated QVM downloaded for IGI ${minor===5?'1':'2'}.`);}else setMessage(`Compiled successfully for IGI ${minor===5?'1':'2'}. Your QVM is ready to download.`);}else setMessage('Validation passed. No source errors found.');
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
  return <div className="studio" onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);void loadFiles(Array.from(e.dataTransfer.files));}}>
    <header className="topbar"><a className="brand" href="./" aria-label="IGI QVM Editor home"><span className="brand-icon"><Code2 size={22}/></span><div><h1>IGI QVM <span>EDITOR</span></h1><small>PROJECT IGI · SCRIPT WORKSPACE</small></div></a><div className="topbar-right"><span className={`engine-state ${engine.state}`}><i/>{engine.state==='ready'?'Engine ready':engine.state==='loading'?'Loading engine':'Engine unavailable'}</span><label className="theme-label" htmlFor="theme">Theme<select id="theme" name="theme" aria-label="Theme" value={theme} onChange={e=>setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="midnight">Midnight</option></select></label><a className="repo-link" href="https://github.com/heaven-hm/project-igi-qvm-editor-web" target="_blank" rel="noreferrer">GitHub ↗</a></div></header>
    <div className="toolbar"><div className="toolbar-group"><button className="button" onClick={()=>fileInput.current?.click()} disabled={!!busy}><FolderOpen size={16}/> Open file</button><button className="button icon-button" aria-label="New QSC file" title="New QSC file" onClick={newFile} disabled={!!busy}><FilePlus2 size={16}/></button><div className="save-dropdown" ref={saveContainer}><button className="button" aria-haspopup="menu" aria-expanded={saveMenu} aria-controls="save-options" onClick={()=>setSaveMenu(!saveMenu)}><ArrowDownToLine size={16}/> Save <ChevronDown size={14}/></button>{saveMenu&&<div className="save-options" role="menu" id="save-options" aria-label="Save options"><button role="menuitem" onClick={()=>{setSaveMenu(false);save();}}>Save script (QSC)</button><button role="menuitem" disabled={!ready||!!busy} onClick={()=>{setSaveMenu(false);void run('compile',true);}}>Save binary (QVM)</button></div>}</div></div><div className="toolbar-group"><label className="target-label" htmlFor="compile-target">Compile target<select id="compile-target" name="compile-target" aria-label="Compile target" value={minor} onChange={e=>{revision.current++;setMinor(Number(e.target.value));setCompiled(undefined);setMessage('Target changed. Compile to create a new QVM.');}}><option value={5}>IGI 1 · QVM 8.5</option><option value={7}>IGI 2 · QVM 8.7</option></select></label><button className="button" onClick={()=>void run('validate')} disabled={!ready||!!busy}><Check size={16}/> Validate</button><button className="button primary" onClick={()=>void run('compile')} disabled={!ready||!!busy}><Play size={15}/>{busy||'Compile QVM'}</button></div></div>
    <input id="open-file" name="open-file" ref={fileInput} type="file" multiple accept=".qsc,.qvm" aria-label="Open QSC or QVM file" className="file-input" onChange={e=>{const incoming=Array.from(e.target.files||[]);e.target.value='';void loadFiles(incoming);}}/>
    {engine.state==='error'&&<div className="engine-error" role="alert"><span>{engine.error}</span><button className="button" onClick={engine.retry}>Retry engine</button></div>}
    <main className={`workspace ${panelOpen?'':'panel-closed'}`}><section className="editor-pane" aria-label="Source workspace"><div className="editor-header"><div className="document-tabs" role="tablist" aria-label="Open files">{files.map(file=><div className={`document-tab ${file.id===activeId?'selected':''}`} key={file.id}><button role="tab" aria-selected={file.id===activeId} aria-controls="source-panel" id={`tab-${file.id}`} disabled={!!busy} onClick={()=>activate(file.id)}>{file.name}{file.dirty&&<span className="dirty-dot" aria-label={file.id===activeId?'Unsaved changes':`Unsaved changes in ${file.name}`}/>}</button><button className="tab-close" aria-label={`Close ${file.name}`} disabled={!!busy} onClick={()=>closeFile(file.id)}><X size={12}/></button></div>)}</div><div className="editor-controls"><button className="button icon-button" aria-label={panelOpen?'Close right panel':'Expand right panel'} aria-expanded={panelOpen} aria-controls="right-panel" onClick={()=>setPanelOpen(!panelOpen)}>{panelOpen?<PanelRightClose size={17}/>:<PanelRightOpen size={17}/>}</button><button className="button icon-button" aria-label="Find in source" title="Find in source" onClick={()=>editorRef.current?.getAction('actions.find')?.run()}><Search size={16}/></button><button className={`button icon-button ${wrap?'active':''}`} aria-label="Toggle word wrap" aria-pressed={wrap} title="Toggle word wrap" onClick={()=>setWrap(!wrap)}><WrapText size={17}/></button></div></div><div className="code-area" id="source-panel" role="tabpanel" aria-labelledby={`tab-${activeId}`}><CodeEditor documentId={activeId} openIds={files.map(file=>file.id)} source={source} onChange={edit} theme={theme} wrap={wrap} error={error} onEditor={e=>{editorRef.current=e;e.onDidChangeCursorPosition(event=>setPosition(event.position));}}/></div><section className={`diagnostics ${error?'has-error':''}`} aria-label="Diagnostics"><div className="diagnostics-heading"><span>{error?'ERROR':'OUTPUT'}</span><small>{busy?`${busy}…`:error?'Action required':'Toolchain messages'}</small></div><p role={error?'alert':'status'}>{error||message}</p></section><div className="editor-status"><span>Ln {position.lineNumber}, Col {position.column}</span><span>UTF-8 <span className="status-separator">·</span> QSC <span className="status-separator">·</span> {source.split('\n').length} lines</span></div></section><div id="right-panel" hidden={!panelOpen}><Inspector metadata={metadata} binaryName={binaryName} binaryLoaded={!!binary} busy={!!busy} ready={ready} onDecompile={()=>void decompile()} onDownload={()=>{if(compiled)download(compiled.slice().buffer,name.replace(/\.qsc$/i,'.qvm'));}} downloadReady={!!compiled}/></div></main>
    {drag&&<div className="drop-overlay"><FolderOpen size={38}/><h2>Drop QSC or QVM files here</h2><p>Multiple files · QSC up to 4 MiB · QVM up to 8 MiB</p></div>}
  </div>;
}
