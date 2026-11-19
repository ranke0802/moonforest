// Chapter 1 content for the first ten minutes (M1). Data only: the story
// runtime reads it; nothing here touches the engine.
// The opening happens on the village road, about 35 m from the gate: close
// enough that the first walk is short and safe.
export const OPENING_STAGE=Object.freeze({map:'great-plains',x:-62.5,z:-20.9,yaw:-2.097});
// Scenery the story adds to a map (real assets, placed through the map's own
// placement runtime so streaming, collision and outlines work as usual).
export const PROPS=Object.freeze([
 {id:'v03-opening-wagon',asset:'covered-wagon',map:'great-plains',x:-64.3,z:-25.8,yaw:-2.097},
]);
// Where to walk to leave a map toward another one (used by the guide light).
export const ROUTES=Object.freeze({
 // Keyed by destination map: indirect destinations name the first exit to take.
 'great-plains':{village:{x:-92.6,z:-34.6},'monster-forest':{x:65,z:-72},'witch-cave':{x:65,z:-72}},
 village:{'great-plains':{x:.35,z:74.5},'monster-forest':{x:.35,z:74.5},'witch-cave':{x:.35,z:74.5}},
 'monster-forest':{'great-plains':{x:0,z:51},village:{x:0,z:51},'witch-cave':{x:28,z:-41}},
 'witch-cave':{'monster-forest':{x:-46,z:47},'great-plains':{x:-46,z:47},village:{x:-46,z:47}},
});
export const NPCS=Object.freeze([
 {id:'driver',name:'마부',visual:'driver',map:'great-plains',x:-65.6,z:-23.6,yaw:.6,idle:'driver-idle'},
 {id:'innkeeper',name:'여관 주인',visual:'innkeeper',map:'village',x:-3.4,z:10.6,yaw:1.2,idle:'inn-idle'},
 {id:'elder',name:'노년 여성',visual:'elder',map:'village',x:4.2,z:-2.6,yaw:-1.9,idle:'elder-idle'},
 {id:'herbalist',name:'약초사',visual:'herbalist',map:'village',x:-4.4,z:-2.8,yaw:.9,idle:'herbalist-idle'},
 {id:'chief',name:'촌장',visual:'chief',map:'village',x:7.2,z:9.4,yaw:-2.2,idle:'chief-idle'},
 {id:'youth',name:'청년',visual:'youth',map:'village',x:-5.2,z:5.6,yaw:1.6,idle:'youth-idle'},
]);

// who: speaker label. '나' lines are the warrior's own short thoughts.
export const DIALOGUES=Object.freeze({
 // After the fight: the driver asks for a hand with the wagon (the effect lifts it),
 // then thanks the warrior and gives what he has (M00 reward).
 'driver-wagon':[
  {who:'마부',text:'휴우… 살았다. 용병 양반 아니었으면 말이고 나고 꼼짝없이 늑대 밥이었수.'},
  {who:'마부',text:'염치없지만 마차 좀 같이 세워 주겠수? 나 혼자선 꿈쩍도 안 해서.'},
  {who:'나',text:'같이 들어요. 하나, 둘, 셋!',effects:['right-wagon']},
 ],
 'driver-thanks':[
  {who:'마부',text:'어이쿠, 섰다 섰어! …아이고, 바퀴가 아주 박살이 났구먼.'},
  {who:'마부',text:'그래도 다행이우. 마을이 바로 저기니까 여기서부턴 조금만 걸으면 되오.'},
  {who:'마부',text:'목숨을 구해 줬으니 내가 뭐라도 드려야 할 판이우. 하나밖에 없는 딸을 부모 없는 자식 만들 뻔했는데… 정말 고맙소.'},
  {who:'마부',text:'얼마 안 되지만 받아 두시우. 마을에 가거든 달빛 여관부터 찾아가고. 주인장이 무뚝뚝해도 방은 깨끗하다오.'},
 ],
 // Prologue → first fight: the wagon ride and the wolf (played by story.beginAmbushScene).
 'ambush-scene':[
  {who:'나',text:'(…꿈이었나.)'},
  {who:'마부',text:'깨셨수? 조금만 더 가면 마을이우. 저 언덕만 넘으면 금방이오.'},
  {who:'나',text:'(풀숲이… 이상하게 조용하네.)'},
  {who:'마부',text:'워, 워어! 늑대다! 말이 놀라…!'},
  {who:'마부',text:'아이고, 마, 말이…! 늑대요, 늑대!'},
  {who:'나',text:'(일단 마부부터 지키자.)'},
 ],
 'driver-idle':[{who:'마부',text:'바퀴만 고치면 나도 곧 뒤따라가겠수. 길 조심하시우.'}],
 'inn-arrive':[
  {who:'여관 주인',text:'못 보던 얼굴이군. 이맘때 이 마을까지 오는 사람은 드문데.'},
  {who:'나',text:'교회 의뢰로 왔어요. 견습 성녀 엘레나가 여섯 달째 소식이 없어서요.'},
  {who:'여관 주인',text:'…그 이름, 오랜만에 듣는군. 착한 아이였지. 다친 사람 곁을 밤새 지키곤 했으니까.'},
  {who:'여관 주인',text:'난 아는 게 별로 없네. 우물가 할머니, 약초사, 목책 고치는 청년한테 물어보게. 다들 기억하는 게 조금씩 다를 거야.'},
  {who:'여관 주인',text:'방은 2층을 쓰게. 쉬고 싶으면 언제든 말 걸고. 오늘 일은 내가 장부에 적어 두지.',effects:['rest']},
 ],
 'inn-idle':[{who:'여관 주인',text:'좀 쉬어 가겠나? 오늘 일은 장부에 적어 두지.',effects:['rest']}],
 'inn-report':[
  {who:'여관 주인',text:'세 사람 얘기는 다 들었나 보군. 표정 보니 말이 서로 안 맞았던 모양이야.'},
  {who:'나',text:'다들 그녀를 좋게 기억해요. 그런데 마지막 며칠을 물으면 말끝을 흐리더군요.'},
  {who:'여관 주인',text:'…요아힘이 죽은 뒤로 마을 사람들이 그 얘길 피하지. 평원 언덕에서 곰한테 당했다고들 하더군.'},
  {who:'여관 주인',text:'사람들 입을 열고 싶으면 마을 일부터 도와 보게. 촌장 댁에 가면 일거리가 있을 거야. 일단은 좀 쉬고.',effects:['rest']},
 ],
 'chief-request':[
  {who:'촌장',text:'자네가 성녀님 일을 캐묻고 다닌다는 사람인가.'},
  {who:'촌장',text:'묻는 거야 자유지. 하지만 지금 이 마을엔 옛날얘기 할 여유가 없네.'},
  {who:'촌장',text:'평원 짐승들이 길까지 내려오고 있어. 마차가 습격당한 건 자네도 봤겠지.'},
  {who:'촌장',text:'세 마리만 쫓아내 주게. 그러면 나도 아는 걸 하나 말해 주지.'},
  {who:'나',text:'(성녀 얘기를 들으려면 먼저 이 마을의 신뢰부터 얻어야겠네.)'},
 ],
 'chief-report':[
  {who:'촌장',text:'길이 좀 조용해졌군. 고맙네. 약속은 약속이니 하나만 말하지.'},
  {who:'촌장',text:'요아힘이 죽던 날, 평원 북쪽 언덕에서 곰 울음소리가 들렸네.'},
  {who:'촌장',text:'…그런데 곰은 사람을 그렇게 찢지 않아. 그 이상은 나도 모르네.'},
  {who:'나',text:'(곰이라… 다들 같은 말을 하는데, 정작 본 사람은 없어.)'},
 ],
 'chief-bear':[
  {who:'촌장',text:'곰을…? 자네 혼자서?'},
  {who:'나',text:'목에 보랏빛 쇠붙이가 박혀 있었어요. 누가 일부러 채워 놓은 것처럼요.'},
  {who:'촌장',text:'…요아힘도 똑같은 말을 했었지. 짐승들 눈빛이 이상하다고. 그땐 아무도 안 믿었네.'},
  {who:'촌장',text:'숲 쪽에서 고블린들이 내려온다는 소문도 있어. 오늘 밤엔 목책을 좀 지켜 주게.'},
 ],
 'raid-start':[
  {who:'청년',text:'고블린이에요! 목책 쪽으로 몰려와요!'},
  {who:'나',text:'(마을 안으로 들이면 안 돼.)'},
 ],
 'youth-goblin':[
  {who:'청년',text:'막았다… 근데 저것들, 그냥 고블린이 아니에요. 덩치 큰 놈이 뒤에서 지휘하는 걸 봤어요.'},
  {who:'청년',text:'홉고블린이요. 요아힘 형이 마지막으로 나가던 날도 숲에서 그놈 얘기를 했었어요.'},
  {who:'청년',text:'형은 곰한테 죽은 게 아니에요. 숲에… 마물의 숲에 뭔가 있어요.'},
  {who:'나',text:'(보랏빛 쇠붙이, 홉고블린, 그리고 숲. 성녀가 사라진 곳도 그쪽이겠지.)'},
 ],
 'driver-alpha':[
  {who:'마부',text:'오, 자네로구먼! 마을 소식은 들었수. 고블린까지 막아냈다면서?'},
  {who:'마부',text:'그런데 큰일이우. 초원 한복판에 우두머리 늑대가 무리를 끌고 나타났수. 덩치가 곰만 하다오.'},
  {who:'마부',text:'그놈이 무리를 끌고 다니는 한 마차는 한 발짝도 못 움직이우. 부탁 좀 하겠수.'},
  {who:'나',text:'(무리를 이끄는 놈이라… 짐승들이 사나워진 이유도 거기 있을지 몰라.)'},
 ],
 'alpha-start':[
  {who:'나',text:'(저 눈빛… 곰 목에 박혀 있던 것과 같은 보랏빛이야.)'},
 ],
 'chief-alpha':[
  {who:'촌장',text:'우두머리 늑대를…! 이제야 길이 트이겠군. 마을을 대표해서 고맙네.'},
  {who:'나',text:'그놈 목에도 보랏빛 쇠붙이가 있었어요. 곰한테 있던 것과 같은 거였어요.'},
  {who:'촌장',text:'…누군가 짐승들을 몰아붙이고 있다는 얘기로군. 숲 안쪽, 마물의 숲으로 가 보게. 답은 거기 있을 걸세.'},
 ],
 'forest-camp':[
  {who:'나',text:'(나무 사이로 연기가 올라와. 고블린 야영지야.)'},
  {who:'나',text:'(목책을 넘던 놈들도 여기서 왔겠지.)'},
 ],
 'inn-ending':[
  {who:'여관 주인',text:'…돌아왔군. 얼굴 보니 찾던 걸 찾은 모양이야.'},
  {who:'나',text:'성녀 엘레나는… 동굴 깊은 곳에 있었어요. 더는 사람이 아니었어요.'},
  {who:'여관 주인',text:'…그랬군. 그 아이가 이 여관에서 묵은 마지막 밤, 요아힘이 문 앞을 지켰었지.'},
  {who:'여관 주인',text:'그 방은 그대로 뒀네. 일지가 한 권 남아 있을 거야. 읽고 말고는 자네 몫이고.'},
  {who:'나',text:'(받은 건 기억하고, 준 건 기억 못 하는 마을. 그녀가 남긴 걸 읽어 봐야겠어.)'},
 ],
 'chief-idle':[{who:'촌장',text:'목책 고칠 일손이 모자라. 힘 좀 쓰는 사람이면 언제든 환영이네.'}],
 'elder-witness':[
  {who:'노년 여성',text:'엘레나? 아이고, 그 아이 덕에 이 다리로 다시 걷는다우. 밤새 내 곁을 지켜 줬지.'},
  {who:'노년 여성',text:'받은 건 많은데… 그 아이한테 마지막으로 뭘 해 줬냐고 물으면, 말이 잘 안 나오는구먼.'},
  {who:'나',text:'(받은 건 또렷이 기억하는데, 준 건 기억을 못 하네.)'},
 ],
 'elder-idle':[{who:'노년 여성',text:'그 아이가 돌아오면… 이번엔 내가 밥이라도 해 먹여야지.'}],
 'herbalist-witness':[
  {who:'약초사',text:'성녀님은 제 약통을 자주 빌려 가셨어요. 늘 꽉 채워서 돌려주셨고요.'},
  {who:'약초사',text:'마지막 통은 돌아오지 않았어요. 그 무렵에 요아힘 씨가… 그렇게 됐으니까요.'},
  {who:'약초사',text:'그 뒤로 숲 쪽 물이 이상해졌어요. 약초가 까맣게 시들어요. 이건 교회에 꼭 전해 주세요.'},
 ],
 'herbalist-idle':[{who:'약초사',text:'숲 근처에 가시면 물은 절대 마시지 마세요.'}],
 'youth-witness':[
  {who:'청년',text:'요아힘 형이랑 성녀님은 늘 붙어 다녔어요. 형이 목책을 지키면 성녀님은 옆에서 다친 사람들을 돌봤죠.'},
  {who:'청년',text:'형이 죽던 날요? 전 못 봤어요. 다들 곰 짓이라는데… 그날 형은 혼자 나간 게 아니었어요.'},
  {who:'청년',text:'…이 얘긴 여기까지만 할게요. 촌장님 댁에서 싫어하거든요.'},
  {who:'나',text:'(혼자가 아니었다라… 그런데 돌아온 건 죽었다는 소식뿐이었고.)'},
 ],
 'youth-idle':[{who:'청년',text:'목책이 또 무너졌어요. 다음 습격 전에 고쳐야 하는데.'}],
});

// Step types: defeat {kind,count,map,at,summon,tune,intro,arrival} (at: lead there; summon: call story foes once the player is inside — omit it to fight the map's own resident; tune: 0.3 balance for foes of that kind) · turnIn marks a report (! instead of ?) · talk {targets:[npc],dialogues:{npc:id}} · reach {map}
export const QUESTS=Object.freeze([
 {id:'M00',reward:{gold:30,potions:1},title:'늑대와 마차',steps:[
  {id:'fight',text:'늑대를 물리치기',type:'defeat',count:1},
  {id:'wagon',text:'마부를 도와 마차 세우기',type:'talk',targets:['driver'],dialogues:{driver:'driver-wagon'}},
  {id:'driver',text:'마부와 이야기하기',type:'talk',targets:['driver'],turnIn:true,dialogues:{driver:'driver-thanks'}},
  {id:'road',text:'길을 따라 마을로 가기',type:'reach',map:'village'},
 ]},
 {id:'M01',reward:{potions:1},title:'달빛 여관',steps:[
  {id:'inn',text:'여관 주인과 이야기하기',type:'talk',targets:['innkeeper'],dialogues:{innkeeper:'inn-arrive'}},
 ]},
 {id:'M02',reward:{gold:20},title:'사람들이 기억하는 성녀',steps:[
  {id:'witness',text:'주민 세 사람의 이야기 듣기',type:'talk',targets:['elder','herbalist','youth'],dialogues:{elder:'elder-witness',herbalist:'herbalist-witness',youth:'youth-witness'}},
  {id:'report',text:'여관 주인에게 돌아가기',type:'talk',targets:['innkeeper'],turnIn:true,dialogues:{innkeeper:'inn-report'}},
 ]},
 {id:'M03',reward:{gold:60,potions:1},title:'마을의 부탁',steps:[
  {id:'ask',text:'촌장 찾아가기',type:'talk',targets:['chief'],dialogues:{chief:'chief-request'}},
  {id:'hunt',text:'대평원의 짐승 쫓아내기',type:'defeat',map:'great-plains',count:3},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-report'}},
 ]},
 {id:'M04',reward:{gold:120,armor:'leather'},title:'대평원의 곰',steps:[
  {id:'bear',text:'평원 언덕의 곰 쓰러뜨리기',type:'defeat',kind:'bear',count:1,map:'great-plains',at:{x:-25,z:-16,radius:15},tune:{hp:650,damage:.7},arrival:'대평원의 곰이 모습을 드러냈다'},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-bear'}},
 ]},
 {id:'M05',reward:{gold:150,potions:2},title:'마을을 습격한 고블린',steps:[
  {id:'raid',text:'목책에서 고블린 막아내기',type:'defeat',kind:'goblin',count:4,map:'village',at:{x:0,z:28,radius:11},summon:{kind:'goblin',count:4},intro:'raid-start',arrival:'고블린 습격!'},
  {id:'report',text:'청년과 이야기하기',type:'talk',targets:['youth'],turnIn:true,dialogues:{youth:'youth-goblin'}},
 ]},
 {id:'M06',reward:{gold:250},title:'우두머리 늑대',steps:[
  {id:'driver',text:'마부와 이야기하기',type:'talk',targets:['driver'],dialogues:{driver:'driver-alpha'}},
  {id:'alpha',text:'초원 한가운데의 우두머리 늑대 쓰러뜨리기',type:'defeat',kind:'wolf',count:1,map:'great-plains',at:{x:29,z:37,radius:28},intro:'alpha-start',arrival:'우두머리 늑대가 울부짖는다'},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-alpha'}},
 ]},
 {id:'M07',reward:{gold:200,potions:1},title:'마물의 숲',steps:[
  {id:'forest',text:'평원 동쪽 끝에서 마물의 숲으로 들어가기',type:'reach',map:'monster-forest'},
  {id:'goblins',text:'숲의 고블린 야영지 쓸어내기',type:'defeat',kind:'goblin',count:5,map:'monster-forest',at:{x:14,z:2,radius:10},summon:{kind:'goblin',count:5},intro:'forest-camp',arrival:'고블린 야영지다!'},
  {id:'cave',text:'숲 깊은 곳의 동굴로 들어가기',type:'reach',map:'witch-cave'},
 ]},
 {id:'M08',reward:{gold:300},title:'타락의 성소',steps:[
  {id:'saint',text:'동굴 깊은 곳의 성녀와 마주하기',type:'defeat',kind:'elena',count:1,map:'witch-cave'},
 ]},
 {id:'M09',reward:{gold:100},title:'남겨진 방',steps:[
  {id:'report',text:'여관 주인에게 돌아가기',type:'talk',targets:['innkeeper'],turnIn:true,dialogues:{innkeeper:'inn-ending'}},
 ]},
]);
export const CHAPTER_END_NOTE='1장 끝 · 다음 이야기 · 엘레나의 일지';

// First-fight coaching, in order. Each line stays until the player has done it.
// done: moved (metres) · camera (radians turned) · states (controller states)
// allow: the only actions usable during the lesson · wolf: hold | charge | snap
export const COMBAT_HINTS=Object.freeze([
 {id:'move',text:'이동',keys:'W A S D',touch:'왼쪽 아래 스틱',target:'#joystick',allow:['move'],wolf:'hold',done:{moved:1.5}},
 {id:'camera',text:'시점 돌리기',keys:'마우스 우클릭 드래그 · 휠로 확대',touch:'화면 오른쪽을 드래그 · 두 손가락으로 확대',allow:['camera'],wolf:'hold',done:{camera:.3}},
 {id:'attack',text:'공격',keys:'J · 좌클릭',touch:'검 버튼',target:'#attack-button',allow:['move','camera','attack'],wolf:'hold',done:{states:['attack','slash','judgment','moveAttack']}},
 {id:'dodge',text:'늑대가 달려들면 회피',keys:'Space',touch:'장화 버튼',target:'#dodge-button',allow:['move','camera','dodge'],wolf:'charge',done:{states:['dodge']}},
 {id:'guard',text:'물려고 들면 방패로 밀치기',keys:'F (길게 누르면 방어)',touch:'방패 버튼 (길게 누르면 방어)',target:'#guard-button',allow:['move','camera','guard'],wolf:'snap',done:{states:['shieldPush','guard']}},
]);

// One-time tips, shown the first time a feature becomes relevant (per save).
// when: low-hp · low-stamina · near-npc · step:<quest>/<step> · effect:<name>
// (low-stamina also fires once the first-fight lessons are done)
export const TIPS=Object.freeze([
 {id:'guide',when:'guide-shown',title:'길잡이 빛',keys:'빛무리가 가야 할 곳으로 먼저 날아갑니다.',touch:'빛무리가 가야 할 곳으로 먼저 날아갑니다.',text:'어디로 갈지 모를 때는 빛을 따라가세요.'},
 {id:'potion',when:'low-hp',title:'회복약',target:'#potion-button',keys:'숫자 1 키로 회복약을 마십니다.',touch:'물약 버튼으로 회복약을 마십니다.',text:'마시는 동안에도 움직일 수 있습니다.'},
 {id:'boss',when:'step:M04/bear',title:'큰 짐승',keys:'몸을 크게 젖히면 강한 공격이 옵니다. Space로 피하거나 F를 길게 눌러 막으세요.',touch:'몸을 크게 젖히면 강한 공격이 옵니다. 장화 버튼으로 피하거나 방패 버튼을 길게 눌러 막으세요.',text:'공격이 끝난 직후가 반격할 때입니다.'},
 {id:'charge',when:'step:M00/driver',title:'강공격',keys:'공격(J · 좌클릭)을 길게 누르면 심판의 검을 내려칩니다.',touch:'검 버튼을 길게 누르면 심판의 검을 내려칩니다.',text:'느리지만 강합니다. 빈틈이 보일 때 쓰세요.'},
 {id:'talk',when:'near-npc',title:'대화',keys:'가까이에서 E 키로 말을 겁니다.',touch:'가까이 가면 뜨는 버튼으로 말을 겁니다.',text:'전투 중에는 대화할 수 없습니다.'},
 {id:'sprint',when:'step:M00/road',title:'질주',keys:'Space를 길게 누르면 달립니다.',touch:'회피 버튼을 길게 누르면 달립니다.',text:'스태미나를 씁니다. 왼쪽 목표와 오른쪽 위 지도를 따라가세요.'},
 {id:'stamina',when:'low-stamina',title:'스태미나',keys:'체력 아래 노란 막대가 스태미나입니다. 공격·회피·방패·질주에 쓰입니다.',touch:'체력 아래 노란 막대가 스태미나입니다. 공격·회피·방패·질주에 쓰입니다.',text:'다 쓰면 잠시 기다려야 합니다. 동작을 멈추면 다시 차오릅니다.'},
 {id:'rest',when:'effect:rest',title:'휴식과 기록',keys:'여관 주인에게 말을 걸면 쉴 수 있습니다.',touch:'여관 주인에게 말을 걸면 쉴 수 있습니다.',text:'체력과 회복약이 채워지고 여정이 기록됩니다.'},
 {id:'witness',when:'step:M02/witness',title:'증언 모으기',keys:'세 사람에게 순서와 상관없이 물어보세요.',touch:'세 사람에게 순서와 상관없이 물어보세요.',text:'누구에게 들었는지는 목표에 표시됩니다.'},
]);
