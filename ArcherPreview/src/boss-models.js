import { AbstractMesh, Mesh, TransformNode } from '@babylonjs/core';
import {loadBossModelContainer,prepareBossCloneSource,cloneBossMorphManager} from './boss-gpu-preparation.js';
import {readMapManifest} from './map-manifests.js';
import {MapLoadLifetime,mapLoadAbortError} from './map-load-lifetime.js';
import {recoverMeshoptWorkerPool} from './meshopt-worker-supervisor.js';
import {canPosedClone,posedClone} from './posed-bounds.js';

export function instantiateBossModel(container, timings) {
  // Independent skeletons and animation targets; geometry/materials/textures stay shared.
  let started=timings?performance.now():0;
  prepareBossCloneSource(container);
  // Babylon clones morph managers while cloning each mesh. Preserve the boss
  // source's final slot policy before the clone's first thaw/upload, scoped to
  // these source objects and this synchronous call; no global prototype hook.
  const managers=[...new Set(container.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean))],originals=new Map();let instance;
  // Same scoping for the meshes: a clone takes its posed bounds from the first
  // clone of that geometry (posed-bounds.js) and skips the CPU skinning pass.
  const sources=container.meshes.filter(mesh=>mesh.getTotalVertices?.()>0&&!Object.hasOwn(mesh,'clone')&&canPosedClone(mesh));
  try{
    for(const mesh of sources)mesh.clone=(name='',parent=null,doNotCloneChildren)=>parent&&parent._addToSceneRootNodes===undefined?Mesh.prototype.clone.call(mesh,name,parent,doNotCloneChildren):posedClone(mesh,name,parent,doNotCloneChildren);
    for(const manager of managers){originals.set(manager,Object.getOwnPropertyDescriptor(manager,'clone'));manager.clone=()=>cloneBossMorphManager(manager,container.scene);}
    instance = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
  }finally{for(const mesh of sources)delete mesh.clone;for(const [manager,descriptor]of originals){if(descriptor)Object.defineProperty(manager,'clone',descriptor);else delete manager.clone;}}
  if(timings){timings.push({name:'model-clone',ms:Math.max(0,performance.now()-started)});started=performance.now();}
  const nodes = [...new Set(instance.rootNodes.flatMap(root => [root, ...root.getDescendants(false)]))];
  const asset={
    meshes: nodes.filter(node => node instanceof AbstractMesh),
    transformNodes: nodes.filter(node => node instanceof TransformNode && !(node instanceof AbstractMesh)),
    animationGroups: instance.animationGroups,
    skeletons: instance.skeletons,
  };
  if(timings)timings.push({name:'node-collection',ms:Math.max(0,performance.now()-started)});
  return asset;
}

export class BossModelLibrary {
  constructor(scene,manifest='guardian-bear',options={}) { this.scene = scene; this.loads = 0; this.manifest=manifest;this.options=options;this.generation=0; }
  async load() {
    if(this.disposed||this.scene.isDisposed)throw mapLoadAbortError();
    if(!this.pending){
      const {timeoutMs,timers}=this.options,lifetime=new MapLoadLifetime({timeoutMs,timers,stage:'actor-asset'});
      const generation=++this.generation;this.lifetime=lifetime;
      // The library, rather than one waiting actor, owns the shared request.
      // A caller cancelling its preparation cannot cancel another consumer.
      const check=()=>{if(this.disposed||this.scene.isDisposed||generation!==this.generation)lifetime.abort(mapLoadAbortError());lifetime.check();};
      const observer=this.scene.onDisposeObservable.addOnce(()=>lifetime.abort(mapLoadAbortError()));
      const pending=(async()=>{
        check();
        const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/${this.manifest}.json`,location.href);
        const config=await lifetime.wait(readMapManifest(url,{timeoutMs,timers}));check();
        // This loader owns partial/late containers through the same lifetime.
        // A decoder latched failed by an earlier scenery timeout must not make
        // every later monster model fail; start this load on a clean worker.
        recoverMeshoptWorkerPool();
        const container=await loadBossModelContainer(this.scene,new URL(config.model,url),{lifetime});
        try{check();for(const group of container.animationGroups)group.stop();check();}
        catch(error){container.dispose();throw error;}
        this.config=config;this.container=container;this.loads++;
      })().catch(error=>{lifetime.abort(error);if(this.pending===pending)this.pending=null;throw error;}).finally(()=>{
        lifetime.close();this.scene.onDisposeObservable.remove(observer);if(this.lifetime===lifetime)this.lifetime=null;
      });
      this.pending=pending;
    }
    await this.pending;
  }
  // Kept for existing explicit scoped consumers; all source loads now use it.
  loadScoped(){return this.load();}
  dispose(){
    if(this.disposed)return;this.disposed=true;this.generation++;this.lifetime?.abort(mapLoadAbortError());
    this.container?.dispose();this.container=null;
  }
  async instantiate() {
    await this.load();
    if(this.disposed||this.scene.isDisposed)throw mapLoadAbortError();
    // Keep the cached container as a clean template, including Elena. Adopting
    // a first live rig would let later clones inherit its actor transforms,
    // generated silhouettes, pose and mutable animation/morph ownership.
    const steps=[];
    return { config: this.config, asset: instantiateBossModel(this.container,steps),modelTimings:{mode:'clone',steps} };
  }
}
