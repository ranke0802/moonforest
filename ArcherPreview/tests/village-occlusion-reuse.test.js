import test from 'node:test';
import assert from 'node:assert/strict';
import {VillageOcclusion} from '../src/village-occlusion.js';

// 9ca3561 previous-frame and hidden-item behavior. The real reveal implementation
// is shared so the comparison also retains the current cave/fog visibility rule.
function previousBeforeRender(){
 if(!this.groups.length||this.disabled)return;
 const view=this.world.camera.getTransformationMatrix().m;
 const changed=!this.view||view.some((n,i)=>Math.abs(n-this.view[i])>.00001);
 if(changed){this.epoch++;this.stableFrames=0;for(const g of this.groups)this.reveal(g);}
 else this.stableFrames++;
 this.view=Array.from(view);
 this.stats.occludedProps=this.groups.reduce((n,g)=>n+g.items.filter(r=>r.occluded).length,0);
}
function fixture(){
 const matrix=Float64Array.from({length:16},(_,i)=>i%5===0?1:0),value=Object.create(VillageOcclusion.prototype);
 const groups=Array.from({length:7},(_,i)=>({hiddenSamples:0,items:Array.from({length:i+2},(_,j)=>({occluded:j%2===0,cellActive:true,fogVisible:true,root:{enabled:true,setEnabled(v){this.enabled=v;}}}))}));
 Object.assign(value,{world:{camera:{getTransformationMatrix:()=>({m:matrix})}},groups,disabled:false,view:null,epoch:0,stableFrames:0,stats:{}});
 return {value,matrix};
}
function state(value){return {epoch:value.epoch,stableFrames:value.stableFrames,view:[...value.view],stats:{...value.stats},groups:value.groups.map(g=>({hiddenSamples:g.hiddenSamples,items:g.items.map(r=>({occluded:r.occluded,enabled:r.root.enabled}))}))};}

test('occlusion reuses its matrix buffer with the exact previous-frame camera and fog behavior',()=>{
 const old=fixture(),next=fixture();let reused=null;
 for(let frame=0;frame<600;frame++){
  const movement=frame%71===0?.03:.000004;
  for(const f of [old,next]){
   f.matrix[12]+=movement;
   for(const [i,g]of f.value.groups.entries())for(const [j,r]of g.items.entries()){
    r.occluded=(frame+i+j)%5===0;r.fogVisible=(frame+i)%7!==0;r.cellActive=(frame+j)%9!==0;r.shadowCaster=(frame+j)%13===0;
   }
  }
  previousBeforeRender.call(old.value);next.value.beforeRender();
  assert.deepEqual(state(next.value),state(old.value),'camera/fog/group result changed at frame '+frame);
  if(reused)assert.equal(next.value.view,reused);reused=next.value.view;
 }
 assert.equal(reused.byteLength,128);
 // Copy even sub-threshold movement: comparing against a stale view would
 // reveal all groups periodically and prevent the occlusion queries settling.
 assert.ok(next.value.stableFrames>3);
});

test('occlusion does not build filtered record arrays while disabled and empty paths remain unchanged',()=>{
 const f=fixture();
 for(const group of f.value.groups)group.items.filter=()=>{throw Error('temporary record array');};
 f.value.beforeRender();f.value.beforeRender();assert.equal(f.value.stableFrames,1);
 const buffer=f.value.view;f.value.disabled=true;f.matrix[0]=4;f.value.beforeRender();assert.equal(f.value.view,buffer);assert.equal(f.value.view[0],1);
 f.value.disabled=false;f.value.groups=[];f.value.beforeRender();assert.equal(f.value.view[0],1);
});
