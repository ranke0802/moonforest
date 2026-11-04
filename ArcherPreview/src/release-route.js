export const MOONFOREST_RELEASE='moonforest-0.1';
export const MOONFOREST_RELEASE_LABEL='MoonForest 0.1 ver';

// A release is separate from the existing character and map identifiers.
// Keeping the marker in the URL also preserves it during in-place portal travel.
export function releaseRoute(href){
 const url=new URL(href),alias=url.searchParams.get('character')===MOONFOREST_RELEASE;
 if(alias){
  url.searchParams.set('character','warrior-v3');
  url.searchParams.set('release',MOONFOREST_RELEASE);
  for(const key of ['uiTest','arrival','from','elenaReview'])url.searchParams.delete(key);
 }
 return {url,enabled:url.searchParams.get('release')===MOONFOREST_RELEASE};
}

export function releaseSelectionUrl(href,value){
 const url=new URL(href);url.searchParams.set('character',value);
 url.searchParams.delete('release');url.searchParams.delete('uiTest');
 for(const key of ['arrival','from','elenaReview'])url.searchParams.delete(key);
 return releaseRoute(url).url;
}

export const releaseSelectionValue=(enabled,character,uiTest=false)=>uiTest?'ui-test':enabled?MOONFOREST_RELEASE:character;
