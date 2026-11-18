// Shortest retaining path from the GC roots to the object carrying a marker property.
import {readFileSync} from 'node:fs';
const file=process.argv[2],mark=process.argv[3]??'__LEAK_PROBE_MARK__',buf=readFileSync(file);
const find=(needle,from=0)=>buf.indexOf(needle,from);
const metaStart=find('"snapshot":'),nodesAt=find('"nodes":[');const meta=JSON.parse(buf.subarray(metaStart+11,nodesAt-1).toString().replace(/,\s*$/,''));
const ints=(start)=>{const out=[];let i=start,n=0,has=false;for(;;i++){const c=buf[i];if(c>=48&&c<=57){n=n*10+(c-48);has=true;}else{if(has){out.push(n);n=0;has=false;}if(c===93)break;}}return {arr:Uint32Array.from(out),end:i};};
const N=ints(nodesAt+9),edgesAt=find('"edges":[',N.end),E=ints(edgesAt+9),strAt=find('"strings":[',E.end);
const strings=JSON.parse(buf.subarray(strAt+10,buf.lastIndexOf(']')+1).toString());
const m=meta.meta,nf=m.node_fields,ef=m.edge_fields,NF=nf.length,EF=ef.length,nT=nf.indexOf('type'),nN=nf.indexOf('name'),nE=nf.indexOf('edge_count'),nS=nf.indexOf('self_size'),eT=ef.indexOf('type'),eN=ef.indexOf('name_or_index'),eTo=ef.indexOf('to_node'),ntypes=m.node_types[0],etypes=m.edge_types[0];
const nodes=N.arr,edges=E.arr,count=nodes.length/NF,first=new Uint32Array(count+1);for(let i=0,e=0;i<count;i++){first[i]=e;e+=nodes[i*NF+nE];first[i+1]=e;}
const markIdx=strings.indexOf(mark);if(markIdx<0){console.log('marker string not found');process.exit(1);}
const targets=new Set();for(let i=0;i<count;i++)for(let e=first[i];e<first[i+1];e++){const t=etypes[edges[e*EF+eT]];if((t==='property')&&edges[e*EF+eN]===markIdx)targets.add(i);}
console.log('nodes',count,'edges',edges.length/EF,'targets',targets.size);
const parent=new Int32Array(count).fill(-1),pedge=new Int32Array(count).fill(-1),queue=new Uint32Array(count);let head=0,tail=0;queue[tail++]=0;parent[0]=0;const found=[];
const skip=new Set(['weak','shortcut']);
while(head<tail&&found.length<Math.min(3,targets.size)){const i=queue[head++];for(let e=first[i];e<first[i+1];e++){const t=etypes[edges[e*EF+eT]];if(skip.has(t))continue;const to=edges[e*EF+eTo]/NF;if(parent[to]!==-1)continue;parent[to]=i;pedge[to]=e;if(targets.has(to)){found.push(to);}queue[tail++]=to;}}
const label=i=>`${ntypes[nodes[i*NF+nT]]}:${String(strings[nodes[i*NF+nN]]).slice(0,70)}`;
const ename=e=>{const t=etypes[edges[e*EF+eT]],v=edges[e*EF+eN];return t+':'+(t==='element'||t==='hidden'?v:String(strings[v]).slice(0,60));};
for(const t of found){const path=[];let c=t;while(c!==0){path.push(`  --[${ename(pedge[c])}]--> ${label(c)}`);c=parent[c];}console.log('PATH');console.log(path.reverse().join('\n'));}
if(!found.length)console.log('no strong path from roots (only weak) — target is garbage');
