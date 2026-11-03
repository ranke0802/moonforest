import manifest from '../public/assets/map-loading-art.json' with {type:'json'};

// Precache compressed bytes with the first game asset plan. Keep this separate
// from image display: visiting one map must not decode the other three images.
export const loadingArtResources=Object.freeze([...manifest.resources]);

// Static metadata is available before any scene/model request. Resolve from the
// app document rather than the JS chunk directory, including nested deployments.
export function loadingArtFor(character){
 if(typeof character!=='string'||!Object.hasOwn(manifest.characters,character))return null;
 const art=manifest.artworks[manifest.characters[character]],base=import.meta.env?.BASE_URL??'./',fallback=new URL('../',import.meta.url);
 let root;try{root=new URL(base,globalThis.location?.href??globalThis.document?.baseURI??fallback);}catch{root=new URL(base,fallback);}
 return {url:new URL('assets/'+art.url.replace(/^\.\//,''),root).href,label:art.label,position:art.position};
}
