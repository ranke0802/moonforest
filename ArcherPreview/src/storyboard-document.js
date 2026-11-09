// Versioned, data-only authoring format. Cards are an ordered linear graph.
export const STORYBOARD_FORMAT='moonforest-storyboard';
export const STORYBOARD_TYPES=Object.freeze(['manual','zone','quest','cinematic','bear']);
export const STORYBOARD_LIMITS=Object.freeze({cards:100,scenes:12,bytes:2*1024*1024});
export const STORYBOARD_EVENT_TRIGGERS=Object.freeze(['map-enter','object-interact','npc-interact','game-start','restart','death','game-exit']);
const maps=['village','great-plains','monster-forest','witch-cave'];
const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const clone=value=>structuredClone(value);
export function createStoryboardCard(type='manual',idValue='card-1'){
 if(!STORYBOARD_TYPES.includes(type))throw new Error('지원하지 않는 카드 종류입니다.');
 return {id:idValue,type,title:{manual:'수동 진행',zone:'장소 도착',quest:'퀘스트 완료',cinematic:'컷씬',bear:'곰 전투'}[type],next:null,mapId:'great-plains',zone:{x:0,z:0,radius:4},questId:'M00',sceneId:''};
}
export function createStoryboard(){
 const cards=[['manual','시작'],['zone','이동 튜토리얼'],['quest','첫 퀘스트'],['manual','전투 튜토리얼'],['zone','곰 영역 진입'],['cinematic','곰 첫 대면'],['bear','곰 전투'],['manual','처치 후 마무리']].map(([type,title],i)=>({...createStoryboardCard(type,'card-'+(i+1)),title}));
 cards.forEach((card,i)=>card.next=cards[i+1]?.id??null);
 return {format:STORYBOARD_FORMAT,version:1,id:'bear-test',title:'대평원 · 곰 전투 시험',entry:cards[0].id,cards,scenes:[]};
}
export function validateStoryboard(value,{requireScenes=false}={}){
 const errors=[];let doc;
 try{const text=typeof value==='string'?value:JSON.stringify(value);if(new TextEncoder().encode(text).length>STORYBOARD_LIMITS.bytes)throw Error('파일이 2 MiB를 초과합니다.');doc=JSON.parse(text);}catch(error){return {valid:false,errors:['작업 파일을 읽을 수 없습니다. '+error.message]};}
 const fail=message=>errors.push(message);
 if(!doc||typeof doc!=='object'||Array.isArray(doc))return {valid:false,errors:['작업 문서 형식이 아닙니다.']};
 if(doc.format!==STORYBOARD_FORMAT||doc.version!==1)fail('지원하지 않는 스토리보드 형식 또는 버전입니다.');
 if(!id.test(doc.id??''))fail('프로젝트 ID가 올바르지 않습니다.');
 if(typeof doc.title!=='string'||!doc.title.trim()||doc.title.length>120)fail('프로젝트 이름은 1~120자여야 합니다.');
 if(!Array.isArray(doc.cards)||!doc.cards.length||doc.cards.length>STORYBOARD_LIMITS.cards)fail('카드는 1~100개여야 합니다.');
 if(!Array.isArray(doc.scenes)||doc.scenes.length>STORYBOARD_LIMITS.scenes)fail('컷씬은 최대 12개입니다.');
 const cards=Array.isArray(doc.cards)?doc.cards:[],scenes=Array.isArray(doc.scenes)?doc.scenes:[],ids=new Set(),sceneIds=new Set();
 for(const [i,c] of cards.entries()){
  if(!c||typeof c!=='object'||Array.isArray(c)){fail(`${i+1}번 카드가 올바르지 않습니다.`);continue;}
  if(!id.test(c.id??'')||ids.has(c.id))fail(`${i+1}번 카드 ID가 중복되거나 올바르지 않습니다.`);ids.add(c.id);
  if(!STORYBOARD_TYPES.includes(c.type))fail(`${c.id}: 지원하지 않는 카드 종류입니다.`);
  if(typeof c.title!=='string'||!c.title.trim()||c.title.length>100)fail(`${c.id}: 카드 이름이 올바르지 않습니다.`);
  if(!maps.includes(c.mapId))fail(`${c.id}: 지역이 올바르지 않습니다.`);
  if(c.next!==null&&!id.test(c.next??''))fail(`${c.id}: 다음 카드 ID가 올바르지 않습니다.`);
  if(c.type==='zone'&&(!c.zone||!['x','z','radius'].every(k=>Number.isFinite(c.zone[k]))||Math.abs(c.zone.x)>10000||Math.abs(c.zone.z)>10000||c.zone.radius<.5||c.zone.radius>100))fail(`${c.id}: 구역 좌표와 반경을 확인하세요.`);
  if(c.type==='quest'&&!id.test(c.questId??''))fail(`${c.id}: 퀘스트 ID를 입력하세요.`);
  if(c.type==='cinematic'&&c.sceneId&&!id.test(c.sceneId))fail(`${c.id}: 컷씬 ID가 올바르지 않습니다.`);
 }
 for(const scene of scenes){if(!scene||typeof scene!=='object'||scene.format!=='moonforest-cinematic'||!id.test(scene.cutsceneId??'')||sceneIds.has(scene.cutsceneId)||!maps.includes(scene.mapId))fail('컷씬 파일의 형식, ID 또는 지역을 확인하세요.');else sceneIds.add(scene.cutsceneId);}
 const events=doc.events??[];
 if(!Array.isArray(events)||events.length>100)fail('이벤트는 최대 100개입니다.');
 else {const eventIds=new Set();for(const event of events){
  if(!event||typeof event!=='object'||!id.test(event.id??'')||eventIds.has(event.id)){fail('이벤트 ID가 중복되거나 올바르지 않습니다.');continue;}eventIds.add(event.id);
  if(typeof event.title!=='string'||!event.title.trim()||event.title.length>100||!STORYBOARD_EVENT_TRIGGERS.includes(event.trigger)||!maps.includes(event.mapId)||typeof event.once!=='boolean'||typeof event.targetId!=='string'||event.targetId.length>120||typeof event.questKey!=='string'||(event.questKey!==''&&!/^[a-zA-Z0-9:_-]{1,90}$/.test(event.questKey))||typeof event.sceneId!=='string'||(event.sceneId&&!id.test(event.sceneId)))fail(`${event.id}: 이벤트 설정을 확인하세요.`);
  if(event.sceneId&&sceneIds.has(event.sceneId)&&scenes.find(s=>s.cutsceneId===event.sceneId)?.mapId!==event.mapId)fail(`${event.id}: 컷씬과 이벤트 지역이 다릅니다.`);
  if(requireScenes&&event.sceneId&&!sceneIds.has(event.sceneId))fail(`${event.id}: 컷씬 파일을 연결하세요.`);
 }}
 if(!ids.has(doc.entry))fail('시작 카드가 없습니다.');
 for(const card of cards){if(card?.next&&!ids.has(card.next))fail(`${card.id}: 연결된 다음 카드가 없습니다.`);if(card?.type==='cinematic'&&requireScenes&&(!card.sceneId||!sceneIds.has(card.sceneId)))fail(`${card.id}: 컷씬 파일을 연결하세요.`);if(card?.type==='cinematic'&&card.sceneId&&sceneIds.has(card.sceneId)&&scenes.find(s=>s.cutsceneId===card.sceneId)?.mapId!==card.mapId)fail(`${card.id}: 컷씬과 카드의 지역이 다릅니다.`);}
 if(ids.has(doc.entry)){const seen=new Set();let current=doc.entry;while(current&&ids.has(current)){if(seen.has(current)){fail('순환 연결은 1차 시험에서 지원하지 않습니다.');break;}seen.add(current);current=cards.find(c=>c.id===current)?.next;}if(seen.size!==cards.length)fail('시작 카드에서 도달할 수 없는 카드가 있습니다.');}
 if(cards.length&&doc.entry!==cards[0]?.id)fail('시작 카드와 표시 순서가 일치하지 않습니다.');
 for(let i=0;i<cards.length;i++)if(cards[i]?.next!==(cards[i+1]?.id??null))fail(`${cards[i]?.id??i+1}: 카드 순서와 다음 연결이 일치하지 않습니다.`);
 return {valid:errors.length===0,errors,document:errors.length?null:doc};
}
export function connectLinear(doc){const result=clone(doc);result.cards.forEach((c,i)=>c.next=result.cards[i+1]?.id??null);result.entry=result.cards[0]?.id??null;return result;}
export function moveStoryboardCard(doc,fromId,toId,after=false){const next=clone(doc),from=next.cards.findIndex(c=>c.id===fromId),to=next.cards.findIndex(c=>c.id===toId);if(from<0||to<0||from===to)return next;const [card]=next.cards.splice(from,1);let index=next.cards.findIndex(c=>c.id===toId)+(after?1:0);next.cards.splice(index,0,card);return connectLinear(next);}
export function addStoryboardCard(doc,card,afterId=null){const next=clone(doc);if(next.cards.length>=STORYBOARD_LIMITS.cards)throw Error('카드는 최대 100개입니다.');if(next.cards.some(c=>c.id===card.id))throw Error('카드 ID가 중복됩니다.');const at=afterId===null?next.cards.length:next.cards.findIndex(c=>c.id===afterId)+1;next.cards.splice(at<1&&afterId!==null?next.cards.length:at,0,clone(card));return connectLinear(next);}
export function removeStoryboardCard(doc,idValue){if(doc.cards.length===1)throw Error('카드는 하나 이상 필요합니다.');const next=clone(doc);next.cards=next.cards.filter(c=>c.id!==idValue);return connectLinear(next);}
