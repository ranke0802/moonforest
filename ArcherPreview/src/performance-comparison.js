// Record only known render comparison switches; a shared URL may have unrelated fields.
const switches=['pets','riding','chapterCamps','leaves','vista','itemIcons'];

export function disabledComparisonFeatures(search=''){
  const params=new URLSearchParams(search);
  return switches.filter(name=>params.get(name)==='0');
}
