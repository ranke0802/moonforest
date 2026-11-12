import {MOONFOREST_RELEASE_V2} from './release-route.js';

// New releases can inherit approved preferences and authoring data, but writes
// and removals belong to their own namespace. Combat sequences start fresh.
export function releaseStorage(storage,release,{inherit=true}={}){
 if(release!==MOONFOREST_RELEASE_V2)return storage;
 const prefix=release+':storage:',isolated=new Set(['moonforest-boss-patterns-v1']);
 return {
  getItem(key){
   if(storage?.getItem(prefix+'removed:'+key)==='1')return null;
   return storage?.getItem(prefix+key)??(inherit&&!isolated.has(key)?storage?.getItem(key):null)??null;
  },
  setItem(key,value){storage?.setItem(prefix+key,String(value));storage?.removeItem(prefix+'removed:'+key);},
  removeItem(key){storage?.setItem(prefix+'removed:'+key,'1');storage?.removeItem(prefix+key);},
 };
}
