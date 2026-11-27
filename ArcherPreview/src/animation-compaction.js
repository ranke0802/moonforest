import {registerGLTFExtension} from '@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js';

// glTF exports bake every bone channel once per frame, so about half of all
// keys (scale, most translations) repeat one value. Such a channel is the same
// pose with only its first and last key. Both ends stay because the runtime
// clamps playback to a channel's own frame range.
const EPSILON=1e-5;
export const animationCompaction={enabled:false,channels:0,keys:0,ms:0,seenKeys:0,files:{}};
// Per glTF file (diagnostics, 2026-11-27): how often its clips were parsed and
// how many keys that allocated. A file that grows every visit is reloaded per map.
const FILE_LIMIT=32;
function countFile(file,groups,seen,removed){
  if(!file)return;const files=animationCompaction.files;let row=files[file];
  if(!row){if(Object.keys(files).length>=FILE_LIMIT)return;row=files[file]={groups:0,seenKeys:0,removedKeys:0};}
  row.groups+=groups;row.seenKeys+=seen;row.removedKeys+=removed;
}

function steady(first,value){
  if(typeof first==='number')return typeof value==='number'&&Math.abs(value-first)<=EPSILON;
  if(value===null||typeof value!=='object')return false;
  if(first.w!==undefined&&!(Math.abs(value.w-first.w)<=EPSILON))return false;
  return Math.abs(value.x-first.x)<=EPSILON&&Math.abs(value.y-first.y)<=EPSILON&&Math.abs(value.z-first.z)<=EPSILON;
}

// Returns how many keys were dropped. Channels with tangents or easing, and
// value types other than scalar, vector3 and quaternion, are left alone.
export function compactChannel(animation){
  const keys=animation?.getKeys?.();
  if(!Array.isArray(keys)||keys.length<3)return 0;
  const value=keys[0].value;
  if(typeof value!=='number'&&(value===null||typeof value!=='object'||typeof value.x!=='number'||typeof value.z!=='number'))return 0;
  for(let i=0;i<keys.length;i++){
    const key=keys[i];
    if(key.inTangent!==undefined||key.outTangent!==undefined||key.easingFunction!==undefined)return 0;
    if(i&&!steady(value,key.value))return 0;
  }
  const last=keys[keys.length-1],removed=keys.length-2;
  if(typeof value==='number')last.value=value;
  else if(typeof last.value.copyFrom==='function')last.value.copyFrom(value);
  else{last.value.x=value.x;last.value.y=value.y;last.value.z=value.z;if(value.w!==undefined)last.value.w=value.w;}
  // In place: bindings compare the key array by identity.
  keys[1]=last;keys.length=2;
  return removed;
}

export function compactAnimationGroup(group,file=null){
  const channels=group?.targetedAnimations;
  if(!channels)return 0;
  const started=performance.now();let removed=0,seen=0;
  for(let i=0;i<channels.length;i++){
    seen+=channels[i].animation?.getKeys?.()?.length??0;
    const dropped=compactChannel(channels[i].animation);
    if(dropped){removed+=dropped;animationCompaction.channels++;}
  }
  animationCompaction.keys+=removed;animationCompaction.seenKeys+=seen;countFile(file,1,seen,removed);animationCompaction.ms+=performance.now()-started;
  return removed;
}

export function setAnimationCompaction(enabled){animationCompaction.enabled=enabled===true;}

const name='MOONFOREST_compact_animation';
export function compactionExtension(loader){
  return {name,enabled:animationCompaction.enabled,
    // The loader skips this extension on the nested call, so this wraps the stock load.
    loadAnimationAsync(context,animation){return loader.loadAnimationAsync(context,animation).then(group=>{compactAnimationGroup(group,typeof loader._fileName==='string'?loader._fileName.split('?')[0].slice(-64):null);return group;});},
    dispose(){}};
}
registerGLTFExtension(name,false,compactionExtension);
