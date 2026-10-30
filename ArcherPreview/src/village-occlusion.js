import { AbstractMesh, Frustum, MeshBuilder, Plane, Vector3 } from '@babylonjs/core';
import '@babylonjs/core/Engines/Extensions/engine.query.js';
import '@babylonjs/core/Rendering/boundingBoxRenderer.js';
import {caveFogRootEnabled} from './cave-fog-of-war.js';

export function stableOcclusion(hiddenSamples,visibleResult){return visibleResult?0:hiddenSamples+1;}
export function safeQueryBounds(min,max,camera,nearPlane){
  if(['x','y','z'].every(a=>camera[a]>=min[a]-.2&&camera[a]<=max[a]+.2))return false;
  // All corners must lie in front of the near plane. A clipped front face or a
  // camera inside the box can otherwise return zero because of back-face culling.
  const n=nearPlane.normal;
  return n.x*(n.x>=0?min.x:max.x)+n.y*(n.y>=0?min.y:max.y)+n.z*(n.z>=0?min.z:max.z)+nearPlane.d>.1;
}

// Query the full, slightly expanded bounds against the actual depth buffer.
// No guessed house proxies: a single visible sample retains the entire group.
// Camera movement always reveals groups before rendering and invalidates old results.
export class VillageOcclusion {
  constructor(world,records,stats){
    this.world=world;this.engine=world.scene.getEngine();this.stats=stats;this.groups=[];
    this.view=null;this.epoch=0;this.stableFrames=0;this.cursor=0;this.disabled=false;this.near=new Plane(0,0,0,0);
    stats.occludedProps=0;stats.occlusionQueries=0;
    if(!this.engine.getCaps().supportOcclusionQuery)return;
    const cells=new Map();
    for(const r of records){
      if(!['prop','garden','shrub'].includes(r.placement.kind)||Math.hypot(r.placement.x,r.placement.z)>44)continue;
      const key=`${Math.floor(r.placement.x/12)}:${Math.floor(r.placement.z/12)}`;
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(r);
    }
    for(const [key,items]of cells){
      const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
      for(const r of items){min.minimizeInPlace(r.min);max.maximizeInPlace(r.max);}
      min.subtractInPlace(new Vector3(.18,.18,.18));max.addInPlace(new Vector3(.18,.18,.18));
      const size=max.subtract(min),proxy=MeshBuilder.CreateBox(`village-visibility-proxy-${key}`,{width:size.x,height:size.y,depth:size.z},world.scene);
      proxy.position.copyFrom(min.add(max).scale(.5));proxy.isVisible=false;proxy.isPickable=false;proxy.setEnabled(false);proxy.computeWorldMatrix(true);proxy.freezeWorldMatrix();
      this.groups.push({items,proxy,min,max,query:null,pending:false,epoch:0,hiddenSamples:0,lastQuery:-Infinity});
    }
    this.after=world.scene.onAfterRenderObservable.add(()=>this.afterRender());
  }
  reveal(group){
    group.hiddenSamples=0;
    for(const r of group.items){r.occluded=false;r.root.setEnabled(caveFogRootEnabled(r));}
  }
  beforeRender(){
    if(!this.groups.length||this.disabled)return;
    const view=this.world.camera.getTransformationMatrix().m;
    const changed=!this.view||view.some((n,i)=>Math.abs(n-this.view[i])>.00001);
    if(changed){this.epoch++;this.stableFrames=0;for(const g of this.groups)this.reveal(g);}
    else this.stableFrames++;
    this.view=Array.from(view);
    this.stats.occludedProps=this.groups.reduce((n,g)=>n+g.items.filter(r=>r.occluded).length,0);
  }
  afterRender(){
    if(this.disabled||this.stableFrames<3||!this.groups.length)return;
    const now=performance.now(),engine=this.engine,renderer=this.world.scene.getBoundingBoxRenderer(),camera=this.world.camera;
    Frustum.GetNearPlaneToRef(camera.getTransformationMatrix(),this.near);
    const safe=g=>safeQueryBounds(g.min,g.max,camera.globalPosition,this.near);
    try{
      for(const g of this.groups){
        if(!safe(g)){this.reveal(g);g.epoch=-1;continue;}
        if(!g.pending)continue;
        if(engine.isQueryResultAvailable(g.query)){
          const visible=Boolean(engine.getQueryResult(g.query));g.pending=false;
          if(g.epoch!==this.epoch){this.reveal(g);continue;}
          g.hiddenSamples=stableOcclusion(g.hiddenSamples,visible);
          for(const r of g.items){r.occluded=g.hiddenSamples>=2;r.root.setEnabled(caveFogRootEnabled(r));}
        }else if(now-g.lastQuery>350){this.reveal(g);}
      }
      let submitted=0;
      for(let checked=0;checked<this.groups.length&&submitted<2;checked++){
        const g=this.groups[this.cursor++%this.groups.length];
        if(!safe(g)){this.reveal(g);continue;}
        if(g.pending||now-g.lastQuery<300||!g.items.some(r=>r.cellActive!==false&&r.fogVisible!==false))continue;
        // Warm the shader outside a query. An uncompiled shader must never be
        // mistaken for a zero-sample (hidden) box.
        renderer.renderOcclusionBoundingBox(g.proxy);
        if(!renderer._colorShaderForOcclusionQuery?.isReady(g.proxy,undefined,g.proxy.subMeshes[0]))continue;
        g.query??=engine.createQuery();
        const algorithm=AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
        if(!engine.beginOcclusionQuery(algorithm,g.query))continue;
        renderer.renderOcclusionBoundingBox(g.proxy);engine.endOcclusionQuery(algorithm);
        g.pending=true;g.epoch=this.epoch;g.lastQuery=now;submitted++;this.stats.occlusionQueries++;
      }
    }catch{
      // Optional optimization fails open once; it cannot hide required scenery.
      this.disabled=true;for(const g of this.groups)this.reveal(g);
    }
  }
  dispose(){
    if(this.after)this.world.scene.onAfterRenderObservable.remove(this.after);
    for(const g of this.groups){if(g.query)this.engine.deleteQuery(g.query);g.proxy.dispose();}
  }
}
