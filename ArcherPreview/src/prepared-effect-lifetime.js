// Babylon 9.31 createEffect / Effect.dispose use this reference counter for
// shared program ownership. Hold one additional reference per mesh/effect,
// never a scene/material/texture clone or an extra rendering pass.
const engines=new WeakMap(),owners=new WeakMap();
const OWNER_EFFECT_LIMIT=16,ENGINE_EFFECT_LIMIT=128;
// Programs prepared for actors stay after their owners are gone: monsters and people are disposed
// with their map and stand there again on the next visit, and building the same program again took
// 40-77 ms a time in play on a phone (S23 2026-11-22, 48 builds in 7 minutes). The engine keeps the
// most recently prepared KEEP_LIMIT programs with one reference each; an older one is let go.
const KEEP_LIMIT=96;
const disposed=value=>value?.isDisposed===true||value?._isDisposed===true;

function releasePin(pin){
  if(!pin.live)return;
  pin.live=false;
  const {owner,effect}=pin,state=owner.state;
  owner.pins.delete(effect);state.refs--;
  const pins=state.effects.get(effect);pins?.delete(pin);
  if(!pins?.size)state.effects.delete(effect);
  // Engine.releaseEffects and explicit force disposal invalidate every owner
  // regardless of ref count. Do not decrement an already released program.
  if(!disposed(effect))effect.dispose();
}
function releaseOwner(owner){
  if(!owner.live)return;
  owner.live=false;
  for(const pin of owner.pins.values())releasePin(pin);
  owner.state.owners.delete(owner);
  owner.meshObservable.remove(owner.meshObserver);
  owner.sceneObservable?.remove(owner.sceneObserver);
}
function keep(state,effect){
  if(state.kept.delete(effect)){state.kept.set(effect,true);return;}   // prepared again: newest
  if(disposed(effect)||!Number.isFinite(effect._refCount)||effect._refCount<=0)return;
  effect._refCount++;state.kept.set(effect,true);
  while(state.kept.size>KEEP_LIMIT){
    const oldest=state.kept.keys().next().value;state.kept.delete(oldest);
    if(!disposed(oldest))oldest.dispose();
  }
}
function stateFor(engine){
  let state=engines.get(engine);
  if(state)return state;
  state={owners:new Set(),effects:new Map(),kept:new Map(),refs:0,rejected:0,rejectedOwnerLimit:0,rejectedEngineLimit:0,rejectedInvalid:0};
  engines.set(engine,state);
  // Engine.releaseEffects has already released every program: forget the kept ones without touching them.
  const clear=()=>{for(const owner of state.owners)releaseOwner(owner);state.kept.clear();};
  state.releaseObserver=engine.onReleaseEffectsObservable?.add(clear);
  engine.onDisposeObservable?.addOnce(()=>{clear();engine.onReleaseEffectsObservable?.remove(state.releaseObserver);engines.delete(engine);});
  return state;
}
function prune(state){
  // At most 128 distinct effects are inspected on diagnostics/capacity pressure,
  // rather than rescanning every live actor reference on every retain call.
  for(const [effect,pins] of state.effects)if(disposed(effect))for(const pin of pins){
    releasePin(pin);if(!pin.owner.pins.size)releaseOwner(pin.owner);
  }
}
function reject(state,reason){state.rejected++;state[reason]++;return false;}

export function createPreparedEffectLease(){
  const pending=new Set(),token={};let status='open';
  return {
    retain(mesh,effect){
      if(status!=='open')return false;
      const engine=effect?.getEngine?.();
      if(!engine||typeof engine!=='object')return false;
      const state=stateFor(engine);
      const scene=mesh?.getScene?.();
      if(disposed(engine)||disposed(effect)||mesh?.isDisposed?.()||scene?.isDisposed===true||
        !mesh?.onDisposeObservable?.addOnce||!effect.isReady?.()||!Number.isFinite(effect._refCount)||effect._refCount<=0||
        (scene?.getEngine&&scene.getEngine()!==engine))return reject(state,'rejectedInvalid');
      let owner=owners.get(mesh),pin=owner?.live?owner.pins.get(effect):null;
      if(pin){
        // A concurrent successful prepare can adopt the same pending pin.
        // Its commit must survive the first job subsequently rolling back.
        if(!pin.committed){pin.pending.add(token);pending.add(pin);}
        return true;
      }
      if(owner?.live&&owner.pins.size>=OWNER_EFFECT_LIMIT){
        for(const previous of owner.pins.values())if(disposed(previous.effect))releasePin(previous);
        if(owner.pins.size>=OWNER_EFFECT_LIMIT)return reject(state,'rejectedOwnerLimit');
      }
      if(!state.effects.has(effect)&&state.effects.size>=ENGINE_EFFECT_LIMIT){prune(state);if(state.effects.size>=ENGINE_EFFECT_LIMIT)return reject(state,'rejectedEngineLimit');}
      if(!owner?.live){
        owner={state,pins:new Map(),live:true,meshObservable:mesh.onDisposeObservable,sceneObservable:scene?.onDisposeObservable};
        owners.set(mesh,owner);state.owners.add(owner);
        owner.meshObserver=owner.meshObservable.addOnce(()=>releaseOwner(owner));
        owner.sceneObserver=owner.sceneObservable?.addOnce(()=>releaseOwner(owner));
      }
      effect._refCount++;
      pin={owner,effect,live:true,committed:false,pending:new Set([token])};
      owner.pins.set(effect,pin);let effectPins=state.effects.get(effect);
      if(!effectPins){effectPins=new Set();state.effects.set(effect,effectPins);}effectPins.add(pin);state.refs++;
      pending.add(pin);return true;
    },
    // keep: the prepared programs also outlive these owners (see KEEP_LIMIT).
    commit({keep:kept=false}={}){
      if(status!=='open')return;
      status='committed';
      for(const pin of pending){pin.pending.delete(token);if(pin.live){pin.committed=true;if(kept)keep(pin.owner.state,pin.effect);}}
      pending.clear();
    },
    rollback(){
      if(status!=='open')return;
      status='rolled-back';
      for(const pin of pending){
        pin.pending.delete(token);
        if(pin.live&&!pin.committed&&!pin.pending.size){releasePin(pin);if(!pin.owner.pins.size)releaseOwner(pin.owner);}
      }
      pending.clear();
    },
  };
}

export function inspectPreparedEffects(engine){
  const state=engines.get(engine);if(state){prune(state);for(const effect of state.kept.keys())if(disposed(effect))state.kept.delete(effect);}
  return {liveOwners:state?.owners.size??0,liveEffects:state?.effects.size??0,refs:state?.refs??0,rejected:state?.rejected??0,
    rejectedOwnerLimit:state?.rejectedOwnerLimit??0,rejectedEngineLimit:state?.rejectedEngineLimit??0,rejectedInvalid:state?.rejectedInvalid??0,
    kept:state?.kept.size??0,keepLimit:KEEP_LIMIT,ownerLimit:OWNER_EFFECT_LIMIT,engineEffectLimit:ENGINE_EFFECT_LIMIT,scope:'additional prepared-program references; not GPU bytes'};
}
