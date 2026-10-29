export const CONTENT_NAME=/^[a-f0-9]{64}\.(bin|gltf|png|jpg|jpeg|webp|ktx2|js|wasm|wav|mp3)$/;
export const PACK_NAME=/^bundles\/[a-f0-9]{64}\.mfp\.gz$/;
export const RESOURCE_PACK_LIMITS=Object.freeze({member:1048576,unpacked:4194304,packed:4259840});
export function validateResourceIndex(index){
  if(index?.version!==1||!/^[a-f0-9]{64}$/.test(index.revision)||!index.files||!Array.isArray(index.bundles))throw new Error('Invalid resource version index');
  const names=Object.keys(index.files);
  if(!names.length||names.length>20000||names.some(name=>!CONTENT_NAME.test(name)||!Number.isSafeInteger(index.files[name])||index.files[name]<=0))throw new Error('Invalid resource version entries');
  const assigned=new Set();
  for(const pack of index.bundles){
    if(!PACK_NAME.test(pack.url)||!Number.isSafeInteger(pack.bytes)||pack.bytes<=0||pack.bytes>RESOURCE_PACK_LIMITS.packed||!Array.isArray(pack.files)||pack.files.length<2)throw new Error('Invalid resource bundle');
    let size=0;
    for(const name of pack.files){
      if(!CONTENT_NAME.test(name)||assigned.has(name)||!index.files[name]||index.files[name]>RESOURCE_PACK_LIMITS.member)throw new Error('Invalid or duplicate bundle member');
      assigned.add(name);size+=index.files[name];
    }
    if(size!==pack.unpackedBytes||size>RESOURCE_PACK_LIMITS.unpacked)throw new Error('Resource bundle exceeds its bounded extraction size');
  }
  return index;
}

// A bundle is useful only when every member is missing AND requested. A small
// revision or a partially populated cache fetches just the missing files.
export function planResourceTransfers(missing,index){
  const remaining=new Map(missing.map(item=>[new URL(item.url).pathname.split('/').at(-1),item])),packs=[];
  for(const bundle of index?.bundles??[]){
    if(bundle.files.every(name=>remaining.has(name))&&bundle.bytes<bundle.unpackedBytes+1024){
      packs.push(bundle);for(const name of bundle.files)remaining.delete(name);
    }
  }
  return {packs,files:[...remaining.values()],bytes:packs.reduce((n,p)=>n+p.bytes,0)+[...remaining.values()].reduce((n,f)=>n+f.size,0)};
}
