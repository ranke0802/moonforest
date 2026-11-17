export const MOONFOREST_RELEASE='moonforest-0.1';
export const MOONFOREST_RELEASE_LABEL='MoonForest 0.1 ver';
export const MOONFOREST_RELEASE_V2='moonforest-0.2';
export const MOONFOREST_RELEASE_V2_LABEL='MoonForest 0.2 ver';
// 0.3 is an edition layered on the 0.2 combat ruleset: release stays 0.2,
// while the edition selects the 0.3 shell, content and save namespace.
export const MOONFOREST_EDITION_V3='moonforest-0.3';
export const MOONFOREST_EDITION_V3_LABEL='MoonForest 0.3';
export const MOONFOREST_EDITION_V3_ENTRY='/moonforest-0.3.html';
// 0.4 is the same edition (story and saves are shared with 0.3) opened with
// the reworked world: scenery, time of day and weather. 0.3 stays as it is,
// so going back is opening the 0.3 address.
export const MOONFOREST_WORLD_V4_ENTRY='/moonforest-0.4.html';
export const MOONFOREST_WORLD_V4='0.4';
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
 const worldRevision=url.pathname.endsWith(MOONFOREST_WORLD_V4_ENTRY)?MOONFOREST_WORLD_V4:null;
 const edition=worldRevision||url.pathname.endsWith(MOONFOREST_EDITION_V3_ENTRY)?MOONFOREST_EDITION_V3:null;
 if(edition){
  url.searchParams.set('release',MOONFOREST_RELEASE_V2);
  if(!url.searchParams.has('character'))url.searchParams.set('character','warrior-plains');
  for(const key of ['uiTest','elenaReview'])url.searchParams.delete(key);
 }
 const release=url.searchParams.get('release');
 return {url,enabled:isMoonforestRelease(release),release:isMoonforestRelease(release)?release:null,edition,worldRevision,label:edition?MOONFOREST_EDITION_V3_LABEL:releaseLabels.get(release)??null};
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
