import { AbstractMesh, SceneLoader, TransformNode } from '@babylonjs/core';

export function instantiateBossModel(container) {
  // Independent skeletons and animation targets; geometry/materials/textures stay shared.
  const instance = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
  const nodes = [...new Set(instance.rootNodes.flatMap(root => [root, ...root.getDescendants(false)]))];
  return {
    meshes: nodes.filter(node => node instanceof AbstractMesh),
    transformNodes: nodes.filter(node => node instanceof TransformNode && !(node instanceof AbstractMesh)),
    animationGroups: instance.animationGroups,
    skeletons: instance.skeletons,
  };
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
        this.container = await SceneLoader.LoadAssetContainerAsync(new URL('.', model).href, model.pathname.split('/').pop(), this.scene, null, '.gltf');
        for (const group of this.container.animationGroups) group.stop();
        this.loads++;
      })().catch(error => { this.pending = null; throw error; });
    }
    await this.pending;
  }
  async instantiate() {
    await this.load();
    if(this.config.id==='mourning-elena'){
      // This resident can exist only once. Adopt its packed-copy container so a
      // hidden template does not retain a second large float morph texture.
      if(!this.residentAsset){
        this.container.addAllToScene();
        this.residentAsset={meshes:[...this.container.meshes],transformNodes:[...this.container.transformNodes],animationGroups:this.container.animationGroups,skeletons:this.container.skeletons};
      }
      return {config:this.config,asset:this.residentAsset};
    }
    return { config: this.config, asset: instantiateBossModel(this.container) };
  }
}
