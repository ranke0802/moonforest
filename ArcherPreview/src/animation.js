/** Cross-fades authored full-body clips. Moving attacks already contain the walking leg cycle. */
export class CharacterAnimator {
  constructor(groups, names, {bindingCacheSize=0}={}) {
    this.clips = {};
    this.active = new Map();
    this.current = null;
    this.actionId = null;
    this.bindingCacheSize=Math.min(2,Math.max(0,Math.floor(bindingCacheSize)||0));
    this.bindingCache=new Map();
    this.bindingCounts={created:0,reused:0,evicted:0};
    for (const [state, name] of Object.entries(names)) {
      const group = groups.find(g => g.name === name);
      if (!group) throw new Error(`필수 동작을 찾지 못했습니다: ${name}`);
      group.stop();
      this.clips[state] = group;
    }
    this.durations = Object.fromEntries(Object.entries(this.clips).map(([state, group]) => {
      const fps = group.targetedAnimations[0]?.animation.framePerSecond || 60;
      return [state, (group.to - group.from) / fps];
    }));
    // Reusing native original values is safe only when every fade covers the
    // same complete TRS channels. Sparse/additive animation keeps normal starts.
    const clips=Object.values(this.clips),channels=new Map();
    this.bindingCacheOwners=this.bindingCacheSize?{...this.clips}:null;
    this.bindingCacheCompatible=this.bindingCacheSize>0&&clips.length>0&&new Set(clips).size===clips.length;
    if(this.bindingCacheCompatible){
      for(const [index,{target,animation}]of clips[0].targetedAnimations.entries()){
        let properties=channels.get(target);if(!properties)channels.set(target,properties=new Map());
        if(!['position','rotationQuaternion','scaling'].includes(animation.targetProperty)||properties.has(animation.targetProperty))this.bindingCacheCompatible=false;
        properties.set(animation.targetProperty,index);
      }
      for(const group of clips){
        const seen=new Set();
        if(group.targetedAnimations.length!==clips[0].targetedAnimations.length)this.bindingCacheCompatible=false;
        for(const {target,animation}of group.targetedAnimations){const index=channels.get(target)?.get(animation.targetProperty);if(index===undefined||seen.has(index))this.bindingCacheCompatible=false;seen.add(index);}
      }
    }
  }
  canCacheBindings(entry){
    const group=entry.group;
    if(!this.bindingCacheCompatible||!group.isStarted||group.isAdditive||group.enableBlending||group.mask||group.from!==entry.bindingFrom||group.to!==entry.bindingTo)return false;
    for(const name of ['onAnimationEndObservable','onAnimationLoopObservable','onAnimationGroupLoopObservable','onAnimationGroupEndObservable','onAnimationGroupPauseObservable','onAnimationGroupPlayObservable'])if(group[name]?.hasObservers())return false;
    if(group.targetedAnimations.some(({target,animation},index)=>animation.enableBlending||target.animationPropertiesOverride?.enableBlending||animation.getEvents().length||target!==entry.nativeChannels[index*3]||animation!==entry.nativeChannels[index*3+1]||animation.getKeys()!==entry.nativeChannels[index*3+2]))return false;
    return group.animatables.length===group.targetedAnimations.length&&group.animatables.every((native,index)=>native.paused&&!native.onAnimationEndObservable.hasObservers()&&!native.onAnimationLoopObservable.hasObservers()&&native.onAnimationEnd===entry.nativeCallbacks[index*2]&&native.onAnimationLoop===entry.nativeCallbacks[index*2+1]);
  }
  cacheBindings(state,entry){
    if(!this.bindingCacheSize||!this.canCacheBindings(entry))return false;
    entry.group.setWeightForAllAnimatables(0);entry.appliedWeight=0;
    this.bindingCache.set(state,entry);
    while(this.bindingCache.size>this.bindingCacheSize){
      const oldest=this.bindingCache.keys().next().value;
      // An inactive cached clip has no end/play observers or animation events.
      // Eviction must not deliver a stale completion to a subsequently added listener.
      this.bindingCache.get(oldest).group.stop(true);this.bindingCache.delete(oldest);
      this.bindingCounts.evicted++;
    }
    return true;
  }
  // Explicit development actor pools retain the paused native animatables for
  // clips already used by this actor. A warm life resets playback state without
  // rebuilding animation targets/bindings; callers without a cache keep stop/delete.
  resetForReuse() {
    this.current=null;this.actionId=null;
    for(const entry of this.active.values()){
      entry.weight=0;entry.target=0;entry.clipTime=0;entry.actionId=null;
      entry.controlled=false;entry.timeScale=1;entry.loop=false;entry.blendDuration=.14;
      entry.group.setWeightForAllAnimatables(0);entry.appliedWeight=0;
    }
    return this;
  }
  transition(state, { phase = 0, clipTime, timeScale = 1, actionId = null, loop = false, blendDuration = .14, freezeOnExit = false } = {}) {
    if (!this.clips[state]) throw new Error(`필수 동작을 찾지 못했습니다: ${state}`);
    const previous = this.current;
    const changed = previous !== state || this.actionId !== actionId;
    this.current = state;
    this.actionId = actionId;
    if (changed) {
      for (const entry of this.active.values()) { entry.target = 0; entry.blendDuration = blendDuration; }
    }
    const group = this.clips[state];
    // A replaced group is outside the constructor's complete-channel proof.
    if(this.bindingCacheCompatible&&this.bindingCacheOwners[state]!==group){
      this.bindingCacheCompatible=false;
      // A new state can alias a cached owner. Drain before starting that group
      // so one native binding set cannot be both inactive and active.
      for(const cached of this.bindingCache.values()){cached.group.stop(true);this.bindingCounts.evicted++;}
      this.bindingCache.clear();
    }
    let entry = this.active.get(state);
    if (!entry) {
      const cached=this.bindingCache.get(state);this.bindingCache.delete(state);
      const reused=cached&&cached.group===group&&this.canCacheBindings(cached);
      if(cached&&!reused){cached.group.stop(true);this.bindingCounts.evicted++;}
      if(!reused)group.start(loop, 1, group.from, group.to, false);
      this.bindingCounts[reused?'reused':'created']+=group.animatables?.length??0;
      // Sample from the controller's seconds, not a second Babylon wall clock.
      // This also prevents hidden tabs / dropped frames from moving the arrow ahead of its event.
      if(!reused){group.pause();group.setWeightForAllAnimatables(0);}
      entry = { group, weight: previous === null ? 1 : 0, target: 1, clipTime: 0, blendDuration };
      if(this.bindingCacheCompatible){
        entry.nativeCallbacks=reused?cached.nativeCallbacks:group.animatables.flatMap(native=>[native.onAnimationEnd,native.onAnimationLoop]);
        entry.nativeChannels=reused?cached.nativeChannels:group.targetedAnimations.flatMap(({target,animation})=>[target,animation,animation.getKeys()]);
        entry.bindingFrom=group.from;entry.bindingTo=group.to;
      }
      this.active.set(state, entry);
    }
    if(this.retainBindings&&previous===null)entry.weight=1;
    entry.target = 1;
    entry.loop = loop;
    entry.actionId = actionId;
    entry.timeScale = timeScale;
    entry.freezeOnExit = freezeOnExit;
    if (changed) entry.blendDuration = blendDuration;
    entry.controlled = Number.isFinite(clipTime);
    if (entry.controlled) entry.clipTime = clipTime;
    else if (changed) entry.clipTime = phase * this.durations[state];
    if(group.loopAnimation!==loop)group.loopAnimation = loop;
    if(group.speedRatio!==timeScale)group.speedRatio = timeScale;
  }
  update(dt) {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    let totalWeight = 0;
    for (const [state, entry] of this.active) {
      const step = dt / Math.max(.001, entry.blendDuration);
      entry.weight = entry.target > entry.weight ? Math.min(entry.target, entry.weight + step) : Math.max(entry.target, entry.weight - step);
      if (entry.weight <= 0 && entry.target === 0) {
        if(this.retainBindings){if(entry.appliedWeight!==0){entry.group.setWeightForAllAnimatables(0);entry.appliedWeight=0;}}
        else{if(!this.cacheBindings(state,entry))entry.group.stop();this.active.delete(state);}continue;
      }
      totalWeight += entry.weight;
    }
    const current = this.active.get(this.current);
    for (const [state, entry] of this.active) {
      if(this.retainBindings&&entry.weight<=0&&entry.target===0)continue;
      // Interrupted fades can leave three groups active. Never mix the rest pose into that gap.
      if (totalWeight > 0) entry.weight /= totalWeight;
      if(entry.appliedWeight!==entry.weight){entry.group.setWeightForAllAnimatables(entry.weight);entry.appliedWeight=entry.weight;}
      const duration = this.durations[state];
      const sharedAttack = state !== this.current && ['attack', 'moveAttack'].includes(state) && ['attack', 'moveAttack'].includes(this.current) && entry.actionId === this.actionId && current.controlled;
      if (sharedAttack) entry.clipTime = current.clipTime / this.durations[this.current] * duration;
      // Only the current finite action gets an authoritative sampled time each update.
      else if ((!entry.controlled || state !== this.current) && !(entry.freezeOnExit && state !== this.current)) entry.clipTime += dt * entry.timeScale;
      entry.clipTime = entry.loop && duration > 0 ? entry.clipTime % duration : Math.min(duration, Math.max(0, entry.clipTime));
      const phase = duration > 0 ? entry.clipTime / duration : 0;
      // useWeight=true is essential: otherwise goToFrame bypasses the cross-fade.
      entry.group.goToFrame(entry.group.from + phase * (entry.group.to - entry.group.from), true);
    }
  }
  inspectBindingCache(){
    return {enabled:this.bindingCacheSize>0,eligible:this.bindingCacheCompatible,limit:this.bindingCacheSize,cached:this.bindingCache.size,...this.bindingCounts,
      currentBindings:[...this.bindingGroups()].reduce((sum,group)=>sum+(group.animatables?.length??0),0)};
  }
  bindingGroups(){
    return new Set([...Object.values(this.clips),...[...this.active.values()].map(entry=>entry.group),...[...this.bindingCache.values()].map(entry=>entry.group)]);
  }
  dispose() {
    const cached=new Set([...this.bindingCache.values()].map(entry=>entry.group));
    for (const group of this.bindingGroups()) group.stop(cached.has(group));
    this.bindingCache.clear();this.active.clear();
  }
}
