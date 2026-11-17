import {MOONFOREST_RELEASE_V2} from './release-route.js';

// New releases can inherit approved preferences and authoring data, but writes
// and removals belong to their own namespace. Combat sequences start fresh.
export function releaseStorage(storage,release,{inherit=true}={}){
 if(release!==MOONFOREST_RELEASE_V2)return storage;
 const prefix=release+':storage:',isolated=new Set(['moonforest-boss-patterns-v1']);
 return {
  get available(){return !!storage&&typeof storage.getItem==='function'&&typeof storage.setItem==='function';},
  getItem(key){
   if(storage?.getItem(prefix+'removed:'+key)==='1')return null;
   return storage?.getItem(prefix+key)??(inherit&&!isolated.has(key)?storage?.getItem(key):null)??null;
  },
  setItem(key,value){if(!this.available)throw new Error('브라우저 저장소를 사용할 수 없습니다.');storage.setItem(prefix+key,String(value));storage.removeItem?.(prefix+'removed:'+key);},
  removeItem(key){if(!this.available)throw new Error('브라우저 저장소를 사용할 수 없습니다.');storage.setItem(prefix+'removed:'+key,'1');storage.removeItem?.(prefix+key);},
 };
}
