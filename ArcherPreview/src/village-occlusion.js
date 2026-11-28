import { AbstractMesh, Frustum, MeshBuilder, Plane, Vector3 } from '@babylonjs/core';
import '@babylonjs/core/Engines/Extensions/engine.query.js';
import '@babylonjs/core/Rendering/boundingBoxRenderer.js';
import {caveFogRootEnabled} from './cave-fog-of-war.js';
import {sceneryProjection} from './village-scenery-cache.js';

export function stableOcclusion(hiddenSamples,visibleResult){return visibleResult?0:hiddenSamples+1;}
export function safeQueryBounds(min,max,camera,nearPlane){
  if(['x','y','z'].every(a=>camera[a]>=min[a]-.2&&camera[a]<=max[a]+.2))return false;
  // All corners must lie in front of the near plane. A clipped front face or a
  // camera inside the box can otherwise return zero because of back-face culling.
  const n=nearPlane.normal;
  return n.x*(n.x>=0?min.x:max.x)+n.y*(n.y>=0?min.y:max.y)+n.z*(n.z>=0?min.z:max.z)+nearPlane.d>.1;
}

function queryShaderReady(renderer,mesh,engine){
  const shader=renderer._colorShaderForOcclusionQuery,pass=renderer._renderPassIdForOcclusionQuery;
  if(!shader||pass===undefined)return false;
  // The SDK renderer uses a separate per-submesh draw wrapper for this pass.
  // Testing the restored scene pass could approve a still-uncompiled query.
  const previous=engine.currentRenderPassId;
  try{engine.currentRenderPassId=pass;return shader.isReady(mesh,undefined,mesh.subMeshes[0])&&mesh.hasBoundingInfo;}
  finally{engine.currentRenderPassId=previous;}
}

function isSingleCameraVillage({scene,camera,mapId,edition}){
  return mapId==='village'&&edition==='moonforest-0.3'&&scene.activeCamera===camera&&!scene.frameGraph&&!(scene.activeCameras?.length>1);
}

const indexRecoveryScenes=new WeakSet();
function installQueryIndexRecovery(scene,engine){
  if(indexRecoveryScenes.has(scene))return;
  indexRecoveryScenes.add(scene);
  const observer=engine.onContextLostObservable.add(()=>{
    // Babylon 9.31 rebuilds the box line indices but not the filled proxy
    // indices, which the scene renderer retains even across map changes.
    const renderer=scene._boundingBoxRenderer;
    if(renderer?._fillIndexBuffer)renderer._fillIndexBuffer=null;
  });
  scene.onDisposeObservable.addOnce(()=>engine.onContextLostObservable.remove(observer));
}

// Query the full, slightly expanded bounds against the actual depth buffer.
// No guessed house proxies: a single visible sample retains the entire group.
// Camera movement always reveals groups before rendering and invalidates old results.
export class VillageOcclusion {
  constructor(world,records,stats){
    this.world=world;this.engine=world.scene.getEngine();this.stats=stats;this.groups=[];
    this.view=null;this.epoch=0;this.stableFrames=0;this.cursor=0;this.disabled=false;this.contextLost=false;this.sharpenSuspended=false;this.near=new Plane(0,0,0,0);
    stats.occludedProps=0;stats.occlusionQueries=0;
    if(!this.engine.getCaps().supportOcclusionQuery)return;
    if(world.gameplayV03)installQueryIndexRecovery(world.scene,this.engine);
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
    if(world.gameplayV03&&this.groups.length){
      this.contextLost=this.engine._contextWasLost;
      this.lostObserver=this.engine.onContextLostObservable.add(()=>{
        this.contextLost=true;
        // Lost-context handles cannot be polled, reused, or deleted.
        this.discardQueries(false);
      });
      this.restoredObserver=this.engine.onContextRestoredObservable.add(()=>{this.contextLost=false;});
    }
    this.after=world.scene.onAfterRenderObservable.add(()=>{
      const start=world.frameDiagnostics?.mark()??null;
      try{this.afterRender();}finally{world.frameDiagnostics?.measure('sceneryOcclusionMs',start);}
    });
  }
  reveal(group){
    group.hiddenSamples=0;
    for(const r of group.items){r.occluded=false;r.root.setEnabled(caveFogRootEnabled(r));}
  }
  discardQueries(canDelete){
    this.epoch++;this.stableFrames=0;this.cursor=0;this.stats.occludedProps=0;
    for(const group of this.groups){
      if(canDelete&&group.query)this.engine.deleteQuery(group.query);
      group.query=null;group.pending=false;group.lastQuery=-Infinity;
      this.reveal(group);
    }
  }
  queryDepthUnavailable(){
    const {scene,camera,gameplayV03}=this.world;
    // Phone sharpen draws the scene into its first input. AfterRender restores
    // the output framebuffer without copying scene depth, so these queries
    // cannot test the scenery that was drawn.
    const suspended=!!(gameplayV03&&isSingleCameraVillage(this.world)&&scene.postProcessesEnabled&&
      scene.postProcessManager&&!scene.prePass&&!camera._multiviewTexture&&camera._getFirstPostProcess()?.name==='phone-sharpen');
    if(suspended===this.sharpenSuspended)return suspended;
    this.sharpenSuspended=suspended;this.view=null;
    if(suspended)this.discardQueries(!this.engine._contextWasLost);
    return suspended;
  }
  beforeRender(){
    if(!this.groups.length||this.disabled||this.contextLost||this.queryDepthUnavailable())return;
    const view=this.world.camera.getTransformationMatrix().m;
    const changed=!this.view||view.some((n,i)=>Math.abs(n-this.view[i])>.00001);
    if(changed){this.epoch++;this.stableFrames=0;for(const g of this.groups)this.reveal(g);}
    else this.stableFrames++;
    // Keep the previous-frame comparison (including tiny changes), without
    // allocating a matrix array and one filtered item array per group/frame.
    this.view??=new Float64Array(view.length);this.view.set(view);
    let occludedProps=0;
    for(const group of this.groups)for(const record of group.items)if(record.occluded)occludedProps++;
    this.stats.occludedProps=occludedProps;
  }
  afterRender(){
    if(this.disabled||this.contextLost||!this.groups.length||this.queryDepthUnavailable()||this.stableFrames<3)return;
    const now=performance.now(),engine=this.engine,renderer=this.world.scene.getBoundingBoxRenderer(),camera=this.world.camera;
    const screenOnly=isSingleCameraVillage(this.world);
    const planes=screenOnly?sceneryProjection(camera).planes:null;
    if(!planes)Frustum.GetNearPlaneToRef(camera.getTransformationMatrix(),this.near);
    const near=planes?planes[0]:this.near;
    const safe=g=>safeQueryBounds(g.min,g.max,camera.globalPosition,near);
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
        // An entirely off-screen box cannot save a camera draw. This only
        // skips issuing a query; it never hides an object or a shadow caster.
        if(planes){
          if(g.testPlanes!==planes){g.onScreen=g.proxy.isInFrustum(planes);g.testPlanes=planes;}
          if(!g.onScreen)continue;
        }
        // Only a cold query pass needs an outside-query initialization call.
        // Once ready, the SDK binds everything for the one draw inside the
        // query; repeating that draw beforehand contributes no query samples.
        if(!queryShaderReady(renderer,g.proxy,engine)){
          renderer.renderOcclusionBoundingBox(g.proxy);
          if(!queryShaderReady(renderer,g.proxy,engine))continue;
        }
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
    if(this.lostObserver)this.engine.onContextLostObservable.remove(this.lostObserver);
    if(this.restoredObserver)this.engine.onContextRestoredObservable.remove(this.restoredObserver);
    const canDelete=!(this.world.gameplayV03&&this.engine._contextWasLost);
    for(const group of this.groups){
      if(canDelete&&group.query)this.engine.deleteQuery(group.query);
      group.query=null;group.proxy.dispose();
    }
  }
}
