import path from 'node:path';

// Vite/Rollup reports both static and lazy chunk references by output filename.
// Validate them before publishing, and require the KTX loader in the initial
// graph of every entry that contains the village KTX initialization module.
export function verifyRuntimeModuleGraph(output){
  const chunks=new Map(Object.values(output).filter(item=>item.type==='chunk').map(chunk=>[chunk.fileName,chunk]));
  const target=(owner,ref)=>ref.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(owner),ref)):ref;
  const internal=ref=>ref.startsWith('.')||ref.startsWith('assets/');
  for(const [name,chunk]of chunks){
    for(const ref of [...chunk.imports,...chunk.dynamicImports]){
      const resolved=target(name,ref);
      if(internal(ref)&&!chunks.has(resolved))throw new Error(`Missing runtime chunk ${resolved} imported by ${name}`);
    }
  }
  const closure=entry=>{
    const seen=new Set(),visit=name=>{if(seen.has(name))return;seen.add(name);const chunk=chunks.get(name);if(chunk)for(const ref of chunk.imports)visit(target(name,ref));};
    visit(entry);return [...seen].map(name=>chunks.get(name)).filter(Boolean);
  };
  const contains=(chunk,suffix)=>Object.keys(chunk.modules??{}).some(id=>id.replaceAll('\\','/').endsWith(suffix));
  let checked=0;
  for(const [name,chunk]of chunks){
    if(!chunk.isEntry)continue;
    const staticChunks=closure(name);
    if(staticChunks.some(item=>contains(item,'/src/main.js'))){
      const developmentOnly=/(?:^|\/)src\/(?:developer-[^/]+|editor-workspace|actor-population|actor-definitions|actor-encounter-adapter|asset-catalog|placement-document|authored-placement-runtime|game-tool-lease|tool-camera-input|cinematic-(?:document|player|scene-host|studio|protocol|game|registry|interaction|path-view|authoring))\.js$/;
      for(const item of staticChunks)for(const id of Object.keys(item.modules??{})){
        const normalized=id.replaceAll('\\','/');
        if(developmentOnly.test(normalized)||/\/@babylonjs\/core\/Gizmos\/(?:gizmoManager|positionGizmo|rotationGizmo|scaleGizmo|boundingBoxGizmo)\.js$/.test(normalized))throw new Error(`Development module entered the initial game graph: ${id}`);
      }
    }
    if(!staticChunks.some(item=>contains(item,'/src/village-ktx2.js')))continue;
    checked++;
    if(!staticChunks.some(item=>contains(item,'/@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader.js')))throw new Error(`KTX loader is not in the initial module graph for ${name}`);
  }
  if(!checked)throw new Error('No entry contains village KTX initialization in its initial module graph');
  return {chunks:chunks.size,entriesChecked:checked};
}
