// A running document keeps a consistent immutable asset graph across travel.
// JSON only (bounded); GPU textures/models are still released on map departure.
const manifests=new Map();
export function readMapManifest(url){
  const key=new URL(url).href;
  if(!manifests.has(key)){
    if(manifests.size>=24)manifests.delete(manifests.keys().next().value);
    const pending=fetch(key,{cache:'no-cache'}).then(response=>{
      if(!response.ok)throw new Error(`리소스 목록을 불러오지 못했습니다 (${response.status}).`);
      return response.json();
    });
    manifests.set(key,pending);pending.catch(()=>{if(manifests.get(key)===pending)manifests.delete(key);});
  }
  return manifests.get(key);
}
