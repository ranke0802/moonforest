// Hold only a bounded set of linked programs across map disposal. No scene,
// material, geometry or texture is retained. Babylon 9.31's createEffect and
// Effect.dispose use this same reference counter for shared shader ownership.
const caches=new WeakMap();
export function retainMapEffect(effect){
  if(!effect?.isReady()||effect._isDisposed||!Number.isFinite(effect._refCount))return;
  const engine=effect.getEngine();let cache=caches.get(engine);
  if(!cache){cache=new Set();caches.set(engine,cache);engine.onDisposeObservable.addOnce(()=>{for(const e of cache)e.dispose();cache.clear();caches.delete(engine);});}
  if(cache.delete(effect)){cache.add(effect);return;}
  while(cache.size>=12){const oldest=cache.values().next().value;cache.delete(oldest);oldest.dispose();}
  effect._refCount++;cache.add(effect);
}
export function mapShaderCacheSize(engine){return caches.get(engine)?.size??0;}

// Warm the actual instanced submesh variant. Material.forceCompilationAsync
// creates temporary PBR submeshes, and warms ShaderMaterial without INSTANCES;
// neither guarantees the first real draw is ready.
export async function prepareMapMaterials(meshes,{material:override,cancelled=()=>false,now=()=>performance.now(),wait=()=>new Promise(r=>setTimeout(r,16))}={}){
  const states=new Map(),pending=[];
  for(const mesh of meshes){const material=override??mesh.material;if(!material)continue;
    if(!states.has(material)){states.set(material,material.allowShaderHotSwapping);material.allowShaderHotSwapping=false;}
    if(material._storeEffectOnSubMeshes)for(const subMesh of mesh.subMeshes)pending.push({mesh,material,subMesh});
    else pending.push({mesh,material});
  }
  const started=now();
  try{
    while(pending.length&&!cancelled()){
      for(let i=pending.length-1;i>=0;i--){const {mesh,material,subMesh}=pending[i];
        const ready=subMesh?material.isReadyForSubMesh(mesh,subMesh,true):material.isReady(mesh,true);
        const effect=subMesh?.effect??material.getEffect();
        if(ready){retainMapEffect(effect);pending.splice(i,1);}
        else if(effect?.getCompilationError?.()&&effect.allFallbacksProcessed?.())throw new Error('화면 셰이더를 준비하지 못했습니다. 새로고침해 주세요.');
      }
      if(pending.length){if(now()-started>45000)throw new Error('화면 준비 시간이 초과되었습니다. 새로고침해 주세요.');await wait();}
    }
  }finally{for(const [material,value]of states)material.allowShaderHotSwapping=value;}
}
