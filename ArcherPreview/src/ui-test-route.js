// Keep the test interface separate from character/model and map identifiers.
export function uiTestRoute(href) {
  const url=new URL(href),alias=url.searchParams.get('character')==='ui-test';
  const enabled=alias||url.searchParams.get('uiTest')==='1';
  if(alias){url.searchParams.set('character','warrior-v3');url.searchParams.set('uiTest','1');for(const key of ['arrival','from','elenaReview'])url.searchParams.delete(key);}
  return {enabled,url,character:url.searchParams.get('character')};
}
export function uiTestSelectionUrl(href,value){
  const url=new URL(href);url.searchParams.set('character',value==='ui-test'?'warrior-v3':value);
  if(value==='ui-test')url.searchParams.set('uiTest','1');else url.searchParams.delete('uiTest');
  for(const key of ['arrival','from','elenaReview'])url.searchParams.delete(key);
  return url;
}
export function uiTestStorage(storage){
  return {getItem:key=>storage?.getItem('moonforest-ui-test:'+key)??null,setItem:(key,value)=>storage?.setItem('moonforest-ui-test:'+key,value),removeItem:key=>storage?.removeItem('moonforest-ui-test:'+key)};
}
