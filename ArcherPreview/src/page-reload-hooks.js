// Work that must finish before this document is replaced (0.3 reloads into a
// save slot, a language or the title). Each hook is awaited, all together,
// for at most `limitMs`; a slow hook never blocks the navigation.
const hooks=new Set();
export function onBeforePageReload(hook){hooks.add(hook);return ()=>hooks.delete(hook);}
export async function runBeforePageReload(limitMs=1500){
 if(!hooks.size)return;
 const work=Promise.allSettled([...hooks].map(hook=>{try{return hook();}catch(error){return Promise.reject(error);}}));
 let timer;await Promise.race([work,new Promise(resolve=>{timer=setTimeout(resolve,limitMs);})]);clearTimeout(timer);
}
