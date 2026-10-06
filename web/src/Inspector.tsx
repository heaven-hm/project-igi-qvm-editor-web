import {FileCode2,ShieldCheck,ArrowDownToLine} from 'lucide-react';
import type {Metadata} from './types';
export function Inspector({metadata,binaryName,binaryLoaded,busy,ready,onDecompile,onDownload,downloadReady}:{metadata?:Metadata;binaryName:string;binaryLoaded:boolean;busy:boolean;ready:boolean;onDecompile:()=>void;onDownload:()=>void;downloadReady:boolean}){
  return <aside className="inspector" aria-label="QVM inspector">
    <section className="panel"><div className="section-label">WORKSPACE</div><h2>QVM toolchain</h2><p>Edit a QSC source script or open a compiled QVM to inspect and decompile it.</p>
      <div className="workflow"><span>01</span><div><strong>Open your file</strong><small>QSC source or IGI QVM</small></div></div><div className="workflow"><span>02</span><div><strong>Edit & validate</strong><small>Choose the target game</small></div></div><div className="workflow"><span>03</span><div><strong>Compile & download</strong><small>Run the result in your game</small></div></div>
    </section>
    <section className="panel"><div className="section-label">BINARY INSPECTOR</div><h2><FileCode2 size={17}/> {binaryLoaded?binaryName:'No QVM loaded'}</h2>
      {metadata?<dl className="metadata"><div><dt>Detected game</dt><dd>{metadata.game}</dd></div><div><dt>QVM version</dt><dd>{metadata.version}</dd></div><div><dt>Instructions</dt><dd>{metadata.instructions.toLocaleString()}</dd></div><div><dt>Identifiers</dt><dd>{metadata.identifiers.toLocaleString()}</dd></div><div><dt>Strings</dt><dd>{metadata.strings.toLocaleString()}</dd></div><div><dt>File size</dt><dd>{metadata.size.toLocaleString()} bytes</dd></div></dl>:<p>Open a .qvm file to automatically detect its game and inspect the binary header.</p>}
      <button className="button full" disabled={!binaryLoaded||busy||!ready} onClick={onDecompile}>Decompile to QSC</button>
      <button className="button full" disabled={!downloadReady||busy} onClick={onDownload}><ArrowDownToLine size={16}/> Download compiled QVM</button>
    </section>
    <section className="privacy"><ShieldCheck size={20}/><div><strong>Your files stay here.</strong><p>Compilation runs in your browser. Scripts and game files are never uploaded.</p></div></section>
    <div className="compatibility"><span>SUPPORTED FORMATS</span><p>IGI 1 · QVM 8.5<br/>IGI 2 · QVM 8.7<br/>QSC source scripts</p></div>
  </aside>;
}
