import {VILLAGE_PLACEMENTS} from './village-layout.js';
import {PLAINS_PLACEMENTS,PLAINS_TREASURE_ANCHORS} from './great-plains-layout.js';
import {lootRarity} from './loot-rarity.js';
const tree=VILLAGE_PLACEMENTS.filter(p=>p.kind==='tree').sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
const points=[];
const p=(map,id,label,x,z,{key='inspect:'+id,model='clue-journal',item=null,count=1,text='',requires=null,tier=0}={})=>points.push({map,id,label,x,z,key,model,item,count,text,requires,tier});
export const QUEST_APPLE_TREE={x:tree?.x??-6,z:tree?.z??-8,id:tree?.id};
p('village','apple-tree','사과나무 · 약공격 J',QUEST_APPLE_TREE.x+1.5,QUEST_APPLE_TREE.z,{model:null,requires:'Q01'});
p('village','apple-drop','떨어진 사과',QUEST_APPLE_TREE.x+1.5,QUEST_APPLE_TREE.z,{model:'apple',item:'apple',count:2,key:'apple-pickup'});
p('village','empty-vial','돌려주지 못한 빈 약통',2,-2,{model:'contaminated-vial',text:'치료약 봉인과 날짜를 약초사에게 확인해야 한다.',requires:'Q02'});
p('village','evidence-link','증언과 기록 연결',0,0,{requires:'M09',text:'그들은 악인이 아니었다. 그러나 그날 아무도 그녀에게 무엇이 필요한지 묻지 않았다.'});
p('village','village-relief','공동 구호함 · III',4.63,-3.22,{key:'chest:village-relief',model:'chest-common',tier:3,requires:'Q09',text:'주민들의 진술과 함께 다음 여정을 위한 구호 물자를 받는다.'});
Object.assign(points.at(-1),{yaw:-.2618});
for(const [id,label,x,z]of [['boundary-a','첫 숲길 경계석',53,-57],['boundary-b','두 번째 경계석',63,-64]])p('great-plains',id,label,x,z,{model:null,text:'낡은 경계 표식 아래에 성녀의 행방을 가리키는 흰 실이 걸려 있다.'});
p('great-plains','bandage','교회 문장 붕대',55,-58,{model:null,text:'익숙한 교회 문장. 서둘러 숲에 들어간 사람의 흔적이다.'});
for(const anchor of PLAINS_TREASURE_ANCHORS){p('great-plains',anchor.id,lootRarity(anchor.lootTier).chest,anchor.x,anchor.z,{model:'chest-common',key:'chest:'+anchor.id,tier:anchor.lootTier});Object.assign(points.at(-1),{yaw:anchor.yaw,scale:anchor.scale});}
for(let i=0;i<5;i++)p('monster-forest','herb-'+i,'달이슬풀 채집',-26+i*1.2,17+i*.8,{model:'moon-dew-herb',item:'herb'});
for(const [id,x,z]of [['vial-a',-12,-16],['vial-b',-17,-24]])p('monster-forest',id,'보랏빛 침전 약병',x,z,{model:'contaminated-vial',text:'깨끗한 약과 달리 바닥에 보랏빛 침전물이 남아 있다.'});
p('monster-forest','herbal-note','약초사의 비교 메모',-24,19,{text:'같은 병이라도 같은 약은 아니다. 달이슬풀은 깨끗한 샘 가까이에만 자란다.'});
for(let i=0;i<3;i++)p('monster-forest','cargo-'+i,'빼앗긴 상품 회수',26+i,12+i,{model:'clue-satchel',item:'cargo'});
p('monster-forest','locket','아내의 초상화 펜던트',31,14,{model:'memory-locket',item:'locket',text:'금보다 작은 초상화가 더 조심스럽게 감싸져 있다.'});
for(const [id,label,x,z]of [['claw','나무의 발톱 자국',-29,15],['soil','뒤집힌 흙',-30,19],['spring','맑은 샘의 위치',-23,22]])p('monster-forest',id,label,x,z,{model:null,text:'곰을 쓰러뜨리지 않아도 흔적을 따라 안전한 샘을 찾을 수 있다.'});
p('monster-forest','goblin-relic','약탈 창고 · III',36.42,7.21,{model:'chest-common',key:'chest:goblin-relic',tier:3,requires:'kill:hobgoblin'});
Object.assign(points.at(-1),{yaw:-Math.PI/2});
for(const [id,label,x,z,model,text]of [
 ['camp-bandage','폐야영지의 붕대',24,-33,'clue-bandage','처음 이곳에선 다친 이들을 치료했다.'],
 ['satchel','치료 도구 가방',26,-35,'clue-satchel','오래된 치료 도구 사이에 새로운 약병이 섞여 있다.'],
 ['date-label','건조대 날짜표',27,-32,'clue-journal','날짜표의 순서가 약병의 제조 흔적과 다르다.'],
 ['water-origin','동굴 쪽 물길',28,-37,null,'물은 숲에서 동굴로 들어가는 것이 아니라 동굴에서 흘러나온다.'],
 ['water-a','첫 오염 물길',24,-32,'contaminated-vial','작은 보랏빛 침전이 바위에 남아 있다.'],
 ['water-b','두 번째 오염 물길',26,-36,'contaminated-vial','위로 갈수록 침전이 짙어진다.'],
 ['water-c','동굴 앞 물길',28,-39,'contaminated-vial','동굴 내부에서 물이 흘러나온다.']])p('monster-forest',id,label,x,z,{model,text});
for(const [id,label,x,z,text]of [
 ['pressure','문 앞 압력판',-35,33,'문지기가 쓰러진 뒤 압력판의 잠금이 풀린다.'],
 ['lever','단축문 레버',-33,31,'압력판 다음에 레버를 당겨 문 개방을 기록한다.'],
 ['record-a','실험 기록 · 1',-32,20,'치료를 받으러 찾아오던 이들의 이름. 아직 기록만으로 모든 일을 단정할 수는 없다.'],
 ['record-b','실험 기록 · 2',-35,-15,'돌아오지 않는 영혼을 붙잡으려는 시도가 반복된다.'],
 ['record-c','실험 기록 · 3',-33,-19,'움직임과 생명, 그리고 돌아옴은 같은 것이 아니다.'],
 ['joachim','보존실의 요아힘과 일지',28,-37,'움직이는 것만으로는 돌아왔다고 할 수 없다.'],
 ['valve','실험실 배출 장치',26,-34,'배출 장치를 정지하고 남아 있는 기록을 보존한다.'],
 ['church-seal','교회 인장과 연구 기록',28,-35,'결론을 지어 버리기 전에 이 기록을 가져가야 한다.']])p('witch-cave',id,label,x,z,{text,requires:id==='pressure'?'kill:ghoul':id==='lever'?'inspect:pressure':id==='joachim'?'kill:mourning-elena':['valve','church-seal'].includes(id)?'M08':null});
for(const point of points.filter(p=>p.map==='great-plains')){const placement=PLAINS_PLACEMENTS.find(p=>p.id===(point.id==='bandage'?'saint-bandage':point.id));if(placement)Object.assign(point,{x:placement.x,z:placement.z});}
// Every cache belongs to a house, cart, tree canopy or solid cavern wall.
// The chest fronts face a clear approach; IDs and five reward grades stay stable.
const treasures={
 village:[['orchard',-23.54,11,1,1.0472],['stable',17.8,17,1,Math.PI/2],['garden',-24.32,-7.49,2,2.8798],['chapel',10.86,-17.04,2,1.8326],['north-wall',-5.8,-29,3,Math.PI/2]],
 'great-plains':[['village-grove',-78.02,-23.98,1,2.3562],['stream-bank',-38.77,60.91,2,1.8326],['western-ridge',-56.59,-30.93,2,-1.309],['hill-grove',-45.59,-35.41,3,Math.PI/2],['forest-fringe',37.73423,-45.58059,3,2.552544031041707],['forest-cache',63.67,-77.01,4,.5236]],
 'monster-forest':[['trail-cache',-36.13,29.84,1,2.618],['spring-cache',-27.36,26.75,2,2.0944],['fallen-log',-28.73,-7.14,2,Math.PI],['old-camp',14.68,19.13,3,-.7854],['stone-circle',8.94,-16.82,3,-1.309],['cave-approach',20.12,-27.29,4,2.3562]],
 'witch-cave':[['entry-cache',-40.4,36.4,1,.5236],['guard-stores',-31.2,27.8,2,-2.0944],['water-cache',-12.2,24.6,2,2.8798],['laboratory-cache',-36.4,-21.6,3,.2618],['lower-stores',8.2,-30.4,3,0],['sanctum-cache',40.6,-26.4,4,-1.8326],['reliquary',34.2,-41.2,5,.7854]],
};
for(const [map,entries]of Object.entries(treasures))for(const [suffix,x,z,tier,yaw]of entries){
 const id=map+'-treasure-'+suffix,grade=lootRarity(tier);
 p(map,id,`${grade.chest} · ${grade.name}`,x,z,{model:'chest-common',tier,key:'chest:'+id});
 Object.assign(points.at(-1),{yaw,height:tier>=4?.68:.56,treasure:true});
}
export const CHAPTER_POINTS=points;
