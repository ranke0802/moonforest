// Diagnostic only (not a test, 2026-11-28 iPhone black scenery): loads the real plains and village
// data, lists every village-ink source with its base material's stencil/coverage state, the ink draws of
// a few frames and the 20 heaviest active meshes. VISITS=warrior-plains,warrior-v3 PROBE_MODE=v03 DUMP=1
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const LOG=process.env.PROBE_LOG;const say=(...a)=>{const line=a.join(' ');if(LOG)appendFileSync(LOG,line+'\n');else console.log(line);};const T0=Date.now();
import v8 from 'node:v8';
// Node has no canvas: label textures (plains decor) only need a no-op 2D context.
{const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};}
import {NullEngine,PBRMaterial,RawTexture,Vector3} from '@babylonjs/core';
import {VillageGroundDetail} from '../src/village-ground.js';
import {MeshoptCompression} from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import {MeshoptDecoder} from 'meshoptimizer';
import '@babylonjs/loaders/glTF/index.js';
import {createWorld,replaceWorldMap} from '../src/world.js';
import {loadStreamedVillage} from '../src/village-streamed-environment.js';
import {readMapContainer} from '../src/map-container.js';
import {WARRIOR_DIMENSIONS} from '../src/player-dimensions.js';
import {createWagonHorse} from '../src/v03/wagon-horse.js';
import {createStarfallAura} from '../src/v03/starfall-aura.js';
// PROBE_MODE (comma list, default none): horse = a mounted riding horse per visit,
// left after the next map loads like riding-horse.js; aura = one scene-lifetime
// Starfall aura bound to that horse root each visit (2026-11-27); v03 = the 0.3 world
// (gameplayV03: settlement scenery, fast route grids) instead of 0.2 (2026-11-28).
const MODES=new Set((process.env.PROBE_MODE??'').split(',').map(s=>s.trim()).filter(Boolean));
// Only these are read; any other word (CLAUDE.md once listed resources,ground,frames,materials,cast)
// would otherwise pass silently as if it had been checked (2026-11-27 audit).
const KNOWN_MODES=new Set(['horse','aura','v03']),unknownModes=[...MODES].filter(mode=>!KNOWN_MODES.has(mode));

const base=new URL('../public/assets/',import.meta.url),tick=()=>new Promise(r=>setTimeout(r,0));
const rounds=Number(process.argv[2]??3),snapshot=process.argv[3]??null;
globalThis.location={href:'https://leak.test/game/?character=warrior-plains'};
globalThis.fetch=async url=>{if(String(url).startsWith('file:'))return new Response(readFileSync(new URL(String(url))));const name=new URL(url).pathname.split('/').at(-1);return new Response(readFileSync(new URL(name,base)));};
if(MODES.has('v03')){
 globalThis.matchMedia??=()=>({matches:true});
 const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='getImageData'?(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}):typeof k==='string'?(t[k]??(()=>{})):undefined,set:(t,k,v)=>{t[k]=v;return true;}});
 globalThis.OffscreenCanvas??=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return ctx;}};
 await (await import('../src/fixed-layouts.js')).prepareFixedLayouts(['village','great-plains']);
}
const engine=new NullEngine({renderWidth:1560,renderHeight:720}),world=createWorld(engine,{plains:true,village:true,touchDevice:true,gameplayV03:MODES.has('v03')}),scene=world.scene;
engine.getCaps().instancedArrays=true;scene.defaultMaterial;scene.getOutlineRenderer();
await MeshoptDecoder.ready;MeshoptCompression._Default={decodeGltfBufferAsync:async(data,count,stride,mode,filter)=>{const out=new Uint8Array(count*stride);MeshoptDecoder.decodeGltfBuffer(out,count,stride,data,mode,filter);return out;}};
const readyRaw=()=>{for(const texture of scene.textures)if(texture.getInternalTexture())texture.getInternalTexture().isReady=true;};
const loadContainer=async(model,scene,options={})=>{
 const file=model.pathname.split('/').at(-1),modelUrl=new URL('content/'+file,base),gltf=JSON.parse(readFileSync(modelUrl));
 for(const b of gltf.buffers)if(b.uri){const bytes=readFileSync(new URL(b.uri,modelUrl));b.uri='data:application/octet-stream;base64,'+bytes.toString('base64');}
 const container=await readMapContainer(scene,gltf,'',{skipMaterials:true,fileName:file,...options}),geometry=container.meshes.filter(m=>m.getTotalVertices()>0);
 const materials=gltf.materials.map((source,i)=>{const m=new PBRMaterial(file+'-'+i,scene);m.albedoTexture=pixel(scene);return m;});
 for(const m of geometry)m.material=materials[gltf.meshes[0]?.primitives[0]?.material??0];container.materials.push(...materials);readyRaw();return container;
};
// Stand-ins for the GPU textures the map code expects (2026-11-20: the plains
// outskirts ground borrows the village floor's detail texture and each
// model's own colour texture).
const pixel=scene=>RawTexture.CreateRGBATexture(new Uint8Array([128,128,128,255]),1,1,scene);
const services={initialize:async()=>{},ground:async world=>{const material=world.floorMaterial;if(material&&!material.pluginManager?.getPlugin('MoonforestGroundDetail'))new VillageGroundDetail(material,pixel(world.scene));},loadContainer};
const place=()=>{const p=world.plains?{x:-55,z:37}:{x:0,z:70};world.camera.setTarget(new Vector3(p.x,world.terrain.heightAt(p.x,p.z)+WARRIOR_DIMENSIONS.stableFocusHeight,p.z));world.camera.alpha=1.2;world.camera.beta=.95;world.camera.radius=13;world.camera.getViewMatrix();world.camera.getProjectionMatrix();readyRaw();return p;};
const mb=()=>{globalThis.gc();const m=process.memoryUsage();return {heap:Math.round(m.heapUsed/1e6),ext:Math.round(m.external/1e6),ab:Math.round(m.arrayBuffers/1e6)};};
// ---- ink/stencil probe (iosblack 11/28) ----
const {VillageOutlines}=await import('../src/village-outlines.js');
const sten=m=>m?.stencil?.enabled?`${m.stencil.func}/${m.stencil.funcRef}/${m.stencil.funcMask}/${m.stencil.mask}/${m.stencil.opStencilDepthPass}`:'off';
const reg=(mesh,k)=>!!mesh?._userInstancedBuffersStorage?.sizes?.[k];
const plugin=(m,n)=>!!m?.pluginManager?.getPlugin?.(n);
const report=(label)=>{
 const comps=scene._afterRenderingMeshStage.filter(s=>s.component instanceof VillageOutlines).map(s=>s.component);
 say('==',label,'map',world.mapId,'outline components',comps.length);
 const rows=[];const lodOwner=new Map();
 for(const m of scene.meshes)for(const l of m.getLODLevels?.()??[])if(l.mesh)lodOwner.set(l.mesh,m);
 for(const [ci,c] of comps.entries())for(const src of c.sources){
  const mat=src.material;
  rows.push({c:ci,name:src.name,lodOf:lodOwner.get(src)?.name??'',lods:src.getLODLevels().length,inst:src.instances?.length??0,mat:mat?.name,cls:mat?.getClassName?.(),toon:!!mat?.metadata?.villageToon,stencil:sten(mat),cov:plugin(mat,'MoonforestTreeCoverage'),covReg:reg(src,'treeCoverage'),inkReg:reg(src,'villageInk'),frozen:!!mat?.isFrozen,bfc:mat?.backFaceCulling,alpha:mat?.transparencyMode,disposed:src.isDisposed()});
 }
 const bad=rows.filter(r=>r.stencil!=='off'?false:true);
 const covBad=rows.filter(r=>r.cov&&!r.covReg);
 say('ink sources',rows.length,'stencil-off',bad.length,'coveragePlugin-without-buffer',covBad.length);
 const key=r=>`${r.cls}|toon=${r.toon}|st=${r.stencil}|cov=${r.cov}|covReg=${r.covReg}|lod=${r.lodOf?'y':'n'}`;
 const groups=new Map();for(const r of rows){const k=key(r);groups.set(k,(groups.get(k)??[]).concat(r.name));}
 for(const [k,v] of groups)say(' ',v.length,k,'e.g.',v.slice(0,4).join(' ; '));
 // Every mesh (ink or not) that draws instanced with a TreeCoverage material but lacks the buffer.
 const allCovBad=scene.meshes.filter(m=>m.getTotalVertices?.()>0&&!m.sourceMesh&&plugin(m.material,'MoonforestTreeCoverage')&&m._userInstancedBuffersStorage&&!reg(m,'treeCoverage'));
 say('scene meshes: instanced-buffer meshes with TreeCoverage plugin but no treeCoverage buffer',allCovBad.length,allCovBad.slice(0,8).map(m=>m.name).join(' ; '));
 return {comps,rows};
};
// Record what the ink really draws over: the base mesh's own material at draw time.
const inkDraws=new Map();
const origAfter=VillageOutlines.prototype.afterBase;
VillageOutlines.prototype.afterBase=function(mesh,subMesh,batch){const before=this.stats.outlineDraws??0;origAfter.call(this,mesh,subMesh,batch);if((this.stats.outlineDraws??0)>before){const mat=subMesh.getMaterial();const k=`${mesh.name}|${mat?.name}|st=${sten(mat)}|cov=${plugin(mat,'MoonforestTreeCoverage')}/${reg(mesh,'treeCoverage')}|toon=${!!mat?.metadata?.villageToon}`;inkDraws.set(k,(inkDraws.get(k)??0)+1);}};
const tris=label=>{
 const per=new Map();let total=0;
 for(const m of scene.getActiveMeshes().data.slice(0,scene.getActiveMeshes().length)){
  const src=m.sourceMesh??m;const t=(m.getTotalIndices?.()??src.getTotalIndices())/3;const key=src.name;per.set(key,(per.get(key)??{n:0,t:0,tri:t}));const e=per.get(key);e.n++;e.t+=t;total+=t;}
 const top=[...per.entries()].sort((a,b)=>b[1].t-a[1].t).slice(0,20);
 say('== triangles',label,'active meshes',scene.getActiveMeshes().length,'triangles',Math.round(total));
 for(const [k,v] of top)say('  ',Math.round(v.t),'x'+v.n,'('+Math.round(v.tri)+'/each)',k);
};
const visits=(process.env.VISITS??'warrior-plains,warrior-v3').split(',');
for(const [visit,character] of visits.entries()){
 if(visit)replaceWorldMap(world,character);const p=place();
 await loadStreamedVillage(world,services);await tick();readyRaw();world.lighting.follow(new Vector3(p.x,world.terrain.heightAt(p.x,p.z),p.z),true);world.villageVisibility.update(world.camera.globalPosition,new Vector3(p.x,0,p.z),.1);
 for(let i=0;i<4;i++){scene.render();readyRaw();await tick();}
 inkDraws.clear();for(let i=0;i<3;i++){world.villageVisibility.update(world.camera.globalPosition,new Vector3(p.x,0,p.z),.1);scene.render();}
 const {rows}=report(character);
 say('ink draws this frame set',[...inkDraws.values()].reduce((a,b)=>a+b,0));
 for(const [k,n] of [...inkDraws.entries()].sort((a,b)=>b[1]-a[1]).slice(0,40))say('  draw',n,k);
 tris(character);
 say('render info drawCalls',engine._drawCalls?.current??'?','outlineTriangles',world.environment?.outlineTriangles??JSON.stringify(Object.fromEntries(Object.entries(world.villageStreaming?.stats??{}).filter(([k])=>/outline/.test(k)))));
 if(process.env.DUMP)for(const r of rows)say('  row',JSON.stringify(r));
}
engine.dispose();
