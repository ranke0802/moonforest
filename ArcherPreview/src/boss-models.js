import { AbstractMesh, TransformNode } from '@babylonjs/core';
import {loadBossModelContainer} from './boss-gpu-preparation.js';

export function instantiateBossModel(container, timings) {
  // Independent skeletons and animation targets; geometry/materials/textures stay shared.
  let started=timings?performance.now():0;
  const instance = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
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
  constructor(scene,manifest='guardian-bear') { this.scene = scene; this.loads = 0; this.manifest=manifest; }
  async load() {
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
  async instantiate() {
    await this.load();
    if(this.manifest==='elena'||this.config.id==='mourning-elena'){
      // Each resident phase can exist only once. Adopt its packed-copy container
      // instead of cloning its skeleton/clips or retaining a hidden morph copy.
      if(!this.residentAsset){
        const started=performance.now();
        this.container.addAllToScene();
        this.residentAsset={meshes:[...this.container.meshes],transformNodes:[...this.container.transformNodes],animationGroups:this.container.animationGroups,skeletons:this.container.skeletons};
        return {config:this.config,asset:this.residentAsset,modelTimings:{mode:'adopt',steps:[{name:'model-adopt',ms:Math.max(0,performance.now()-started)}]}};
      }
      return {config:this.config,asset:this.residentAsset,modelTimings:{mode:'reuse',steps:[]}};
    }
    const steps=[];
    return { config: this.config, asset: instantiateBossModel(this.container,steps),modelTimings:{mode:'clone',steps} };
  }
}
