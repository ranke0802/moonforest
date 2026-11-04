import {Color3,MeshBuilder,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';
import {createBossPreparation,bossPreparationCancelled} from './boss-preparation.js';

// Tiny shared coin geometry; no downloaded texture, dynamic light or shadow map.
export function createGoldLootView(scene,host,{visibleAt=()=>true}={}) {
  const material=new StandardMaterial('loot-gold',scene);
  material.diffuseColor=new Color3(.85,.55,.12);material.emissiveColor=new Color3(.32,.18,.025);material.specularColor=new Color3(.6,.42,.16);
  const template=MeshBuilder.CreateCylinder('gold-coin-template',{diameter:.19,height:.035,tessellation:10},scene);
  template.material=material;template.isVisible=false;template.isPickable=false;
  const records=new Map(),anchor=new Vector3();
  let disposed=false,preparing=null,activePreparation=null;
  const preparationState={status:'idle',runs:0,checks:0,geometryBindings:0,lastDurationMs:null,error:null};
  function remove(record){record.root.dispose(false,false);record.label.remove();}
  function coin(name,parent,index){
    const mesh=template.clone(name,parent);mesh.isVisible=true;
    mesh.position.set((index-1)*.07,index*.025,Math.sin(index*2)*.06);mesh.rotation.set(index===2?.3:0,index*1.1,0);
    return mesh;
  }
  const view={
    prepare({preparation,frame,now,timeoutMs=45000}={}){
      if(disposed||scene.isDisposed)return Promise.reject(bossPreparationCancelled());
      if(preparing)return preparing;
      const clock=now??(()=>performance.now()),started=clock();
      preparationState.status='preparing';preparationState.runs++;preparationState.error=null;
      const job=activePreparation=preparation??createBossPreparation({frame,now,timeoutMs,isCurrent:()=>!disposed&&!scene.isDisposed});
      preparing=(async()=>{
        // Use a real visible-coin clone, disabled only from scene traversal. The
        // hidden template's visibility is not the first drop's material variant.
        const probe=coin('gold-coin-preparation',null,0);probe.setEnabled(false);
        const check=()=>{if(disposed||scene.isDisposed)throw bossPreparationCancelled();job.check();};
        try{
          probe.computeWorldMatrix(true);await job.nextFrame();
          for(;;){
            check();let ready=true;
            const everyCall=material.checkReadyOnEveryCall,hotSwap=material.allowShaderHotSwapping;
            try{
              // Unlike forceCompilationAsync's private retry timer, this exact
              // submesh poll has cancellation and a bounded preparation deadline.
              material.checkReadyOnEveryCall=true;material.allowShaderHotSwapping=false;
              for(const sub of probe.subMeshes){
                preparationState.checks++;
                if(!material.isReadyForSubMesh(probe,sub,false)){
                  ready=false;const effect=sub.effect;
                  if(effect?.getCompilationError?.()&&effect.allFallbacksProcessed?.())throw new Error('골드 표시 셰이더를 준비하지 못했습니다.');
                }
              }
            }finally{material.checkReadyOnEveryCall=everyCall;material.allowShaderHotSwapping=hotSwap;}
            if(ready){
              check();
              // Babylon 9.31 binds the shared vertex/index buffers and caches its
              // effect's vertex-array layout here. No mesh or scene is drawn.
              for(const sub of probe.subMeshes){probe._bind(sub,sub.effect,material.fillMode,false);preparationState.geometryBindings++;}
              check();preparationState.status='ready';
              return;
            }
            await job.sleep(16);
          }
        }finally{probe.dispose(false,false);}
      })().catch(error=>{if(!disposed)preparationState.status='failed';preparationState.error={name:error.name,message:error.message};throw error;})
        .finally(()=>{preparationState.lastDurationMs=Math.max(0,clock()-started);preparing=null;activePreparation=null;});
      return preparing;
    },
    inspect(){return {...preparationState,error:preparationState.error?{...preparationState.error}:null};},
    sync(drops){
      if(disposed||scene.isDisposed)return;
      const ids=new Set(drops.map(d=>d.id));
      for(const [id,record] of records)if(!ids.has(id)){remove(record);records.delete(id);}
      for(const drop of drops){
        let record=records.get(drop.id);
        if(!record){
          const root=new TransformNode(`gold-pile-${drop.id}`,scene);
          for(let i=0;i<3;i++)coin(`gold-${drop.id}-${i}`,root,i);
          const label=document.createElement('span');label.className='gold-drop-label';host.append(label);
          record={root,label,drop,settled:false};records.set(drop.id,record);
        }
        record.drop=drop;
        record.root.setEnabled(visibleAt(drop.position));
        const label=`${drop.amount} G`;if(record.label.textContent!==label)record.label.textContent=label;
        if(!record.settled){const t=Math.min(1,drop.age/.6);record.root.position.set(drop.position.x,drop.position.y+Math.sin(t*Math.PI)*.38,drop.position.z);if(t===1){record.settled=true;record.root.freezeWorldMatrix();for(const mesh of record.root.getChildMeshes())mesh.freezeWorldMatrix();}}
      }
    },
    project(projection){for(const {root,label} of records.values()){anchor.copyFrom(root.position);anchor.y+=.22;const p=projection.project(anchor),visible=visibleAt(root.position);root.setEnabled(visible);label.hidden=!p.visible||!visible;label.style.transform=`translate3d(${p.x}px,${p.y}px,0) translate(-50%,-100%)`;}},
    clear(){for(const record of records.values())remove(record);records.clear();},
    dispose(){if(disposed)return;disposed=true;preparationState.status='disposed';activePreparation?.cancel();scene.onDisposeObservable.remove(disposeObserver);this.clear();template.dispose();material.dispose();},
  };
  const disposeObserver=scene.onDisposeObservable.addOnce(()=>view.dispose());
  return view;
}
