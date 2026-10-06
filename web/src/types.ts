export interface Metadata {version:string;game:string;instructions:number;identifiers:number;strings:number;size:number}
export interface Result {ok:boolean;error?:string;source?:string;binary?:Uint8Array;metadata?:Metadata}
export type Operation = 'compile'|'validate'|'inspect'|'decompile';
