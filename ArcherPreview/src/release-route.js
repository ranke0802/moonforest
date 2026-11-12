export const MOONFOREST_RELEASE='moonforest-0.1';
export const MOONFOREST_RELEASE_LABEL='MoonForest 0.1 ver';
export const MOONFOREST_RELEASE_V2='moonforest-0.2';
export const MOONFOREST_RELEASE_V2_LABEL='MoonForest 0.2 ver';
const releaseLabels=new Map([[MOONFOREST_RELEASE,MOONFOREST_RELEASE_LABEL],[MOONFOREST_RELEASE_V2,MOONFOREST_RELEASE_V2_LABEL]]);
export const isMoonforestRelease=value=>releaseLabels.has(value);

// A release is separate from the existing character and map identifiers.
// Keeping the marker in the URL also preserves it during in-place portal travel.
export function releaseRoute(href){
 const url=new URL(href),alias=isMoonforestRelease(url.searchParams.get('character'))?url.searchParams.get('character'):null;
 if(alias){
  url.searchParams.set('character','warrior-v3');
  url.searchParams.set('release',alias);
  for(const key of ['uiTest','arrival','from','elenaReview'])url.searchParams.delete(key);
 }
 // The additive entry opens the production village even without a query.
 if(url.pathname.endsWith('/moonforest-0.2.html')&&!url.searchParams.has('release')){
  url.searchParams.set('release',MOONFOREST_RELEASE_V2);
  if(!url.searchParams.has('character'))url.searchParams.set('character','warrior-v3');
 }
 const release=url.searchParams.get('release');
 return {url,enabled:isMoonforestRelease(release),release:isMoonforestRelease(release)?release:null,label:releaseLabels.get(release)??null};
}

export function releaseSelectionUrl(href,value){
 const url=new URL(href);url.searchParams.set('character',value);
 // A different HTML entry owns each published runtime. Switching back to 0.1
 // must load its preserved bundle rather than relabel the new runtime.
 if(value===MOONFOREST_RELEASE_V2)url.pathname=new URL('./moonforest-0.2.html',url).pathname;
 else if(url.pathname.endsWith('/moonforest-0.2.html'))url.pathname=new URL('./index.html',url).pathname;
 url.searchParams.delete('release');url.searchParams.delete('uiTest');
 for(const key of ['arrival','from','elenaReview'])url.searchParams.delete(key);
 return releaseRoute(url).url;
}

export const releaseSelectionValue=(enabled,character,uiTest=false,release=MOONFOREST_RELEASE)=>uiTest?'ui-test':enabled?(isMoonforestRelease(release)?release:MOONFOREST_RELEASE):character;
