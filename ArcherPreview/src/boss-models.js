import { AbstractMesh, TransformNode } from '@babylonjs/core';
import {loadBossModelContainer,prepareBossCloneSource,cloneBossMorphManager} from './boss-gpu-preparation.js';
import {readMapManifest} from './map-manifests.js';
import {MapLoadLifetime,mapLoadAbortError} from './map-load-lifetime.js';

export function instantiateBossModel(container, timings) {
  // Independent skeletons and animation targets; geometry/materials/textures stay shared.
  let started=timings?performance.now():0;
  prepareBossCloneSource(container);
  // Babylon clones morph managers while cloning each mesh. Preserve the boss
  // source's final slot policy before the clone's first thaw/upload, scoped to
  // these source objects and this synchronous call; no global prototype hook.
  const managers=[...new Set(container.meshes.map(mesh=>mesh.morphTargetManager).filter(Boolean))],originals=new Map();let instance;
  try{
    for(const manager of managers){originals.set(manager,Object.getOwnPropertyDescriptor(manager,'clone'));manager.clone=()=>cloneBossMorphManager(manager,container.scene);}
    instance = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
  }finally{for(const [manager,descriptor]of originals){if(descriptor)Object.defineProperty(manager,'clone',descriptor);else delete manager.clone;}}
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
  constructor(scene,manifest='guardian-bear',options={}) { this.scene = scene; this.loads = 0; this.manifest=manifest;this.options=options; }
  async load() {
    if(this.options.scoped)return this.loadScoped();
    if (!this.pending) {
      this.pending = (async () => {
        const url = new URL(`${import.meta.env.BASE_URL}assets/${this.manifest}.json`, location.href);
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error('보스 설정을 불러오지 못했습니다.');
        this.config = await response.json();
        const model = new URL(this.config.model, url);
        this.container = await loadBossModelContainer(this.scene,model);
        for (const group of this.container.animationGroups) group.stop();
        this.loads++;
      })().catch(error => { this.pending = null; throw error; });
    }
    await this.pending;
  }
  async loadScoped(){
    if(this.disposed)throw mapLoadAbortError();
    if(!this.pending){
      const {timeoutMs,timers}=this.options,lifetime=new MapLoadLifetime({timeoutMs,timers,stage:'actor-asset'});
      this.lifetime=lifetime;
      const observer=this.scene.onDisposeObservable.addOnce(()=>lifetime.abort(mapLoadAbortError()));
      const pending=(async()=>{
        lifetime.check();
        if(this.scene.isDisposed)throw mapLoadAbortError();
        const url=new URL(`${import.meta.env?.BASE_URL??'/'}assets/${this.manifest}.json`,location.href);
        this.config=await lifetime.wait(readMapManifest(url,{timeoutMs,timers}));
        const container=await loadBossModelContainer(this.scene,new URL(this.config.model,url),{lifetime});
        lifetime.check();this.container=container;
        for(const group of container.animationGroups)group.stop();this.loads++;
      })().catch(error=>{if(this.pending===pending)this.pending=null;throw error;}).finally(()=>{
        lifetime.close();this.scene.onDisposeObservable.remove(observer);if(this.lifetime===lifetime)this.lifetime=null;
      });
      this.pending=pending;
    }
    await this.pending;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.lifetime?.abort(mapLoadAbortError());
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
