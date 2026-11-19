// One pending long recording carried across a page reload, in IndexedDB
// (a 10-minute recording is several MB; sessionStorage is too small).
const DB='moonforest-diagnostics',STORE='carry',KEY='long-recording';
function open(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function run(mode,work){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE),request=work(store);let value;if(request)request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function storeCarriedRecording(state){if(!globalThis.indexedDB||!state)return false;await run('readwrite',store=>store.put(state,KEY));return true;}
export async function takeCarriedRecording(){if(!globalThis.indexedDB)return null;const value=await run('readonly',store=>store.get(KEY));if(value)await run('readwrite',store=>store.delete(KEY));return value??null;}
