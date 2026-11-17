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
 'great-plains':{village:{x:-92.6,z:-34.6}},
 village:{'great-plains':{x:.35,z:74.5}},
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
 'driver-thanks':[
  {who:'마부',text:'허… 살았네. 용병 양반 아니었으면 말이고 나고 늑대 밥이 됐을 걸세.'},
  {who:'마부',text:'요즘 평원 짐승들이 이상하게 사나워. 예전엔 마차를 덮치진 않았는데.'},
  {who:'마부',text:'바퀴를 손봐야 해서 나는 여기 남겠네. 마을은 이 길 끝, 바로 저기야.'},
  {who:'마부',text:'도착하거든 달빛 여관부터 찾게. 주인이 무뚝뚝해도 방은 깨끗하지.'},
 ],
 'driver-idle':[{who:'마부',text:'바퀴만 고치면 나도 뒤따라가겠네. 길 조심하게.'}],
 'inn-arrive':[
  {who:'여관 주인',text:'못 보던 얼굴이군. 이 시기에 이 마을까지 오는 사람은 드문데.'},
  {who:'나',text:'교회의 의뢰로 왔다. 견습 성녀 엘레나가 여섯 달째 소식이 없다.'},
  {who:'여관 주인',text:'…그 이름을 오랜만에 듣는군. 좋은 아이였지. 다친 사람을 밤새 돌봤으니.'},
  {who:'여관 주인',text:'나는 아는 게 많지 않네. 우물가 노인, 약초사, 그리고 목책을 고치는 청년에게 물어보게. 각자 기억하는 게 다를 걸세.'},
  {who:'여관 주인',text:'2층 방을 쓰게. 쉬고 싶을 땐 언제든 말을 걸어. 오늘 일은 내가 장부에 적어 두지.',effects:['rest']},
 ],
 'inn-idle':[{who:'여관 주인',text:'쉬어 가겠나? 몸을 추스르고, 오늘 일은 장부에 적어 두지.',effects:['rest']}],
 'inn-report':[
  {who:'여관 주인',text:'세 사람 이야기를 다 들었군. 표정을 보니 말이 서로 안 맞았나 보네.'},
  {who:'나',text:'모두 그녀를 좋게 기억한다. 그런데 마지막 며칠을 물으면 말이 짧아진다.'},
  {who:'여관 주인',text:'…요아힘이 죽은 뒤로 마을이 그 얘기를 피하지. 그 친구는 평원 언덕의 곰한테 당했다고들 하네.'},
  {who:'여관 주인',text:'사람들 입을 열고 싶으면 먼저 마을 일을 도와 보게. 촌장 댁에 가 보면 일거리가 있을 걸세. 우선 쉬어 두고.',effects:['rest']},
 ],
 'chief-request':[
  {who:'촌장',text:'자네가 성녀님 일을 묻고 다닌다는 그 사람인가.'},
  {who:'촌장',text:'묻는 건 자유지. 하지만 지금 이 마을엔 옛이야기를 할 여유가 없네.'},
  {who:'촌장',text:'대평원 짐승들이 길까지 내려와. 마차가 습격당한 건 자네도 봤겠지.'},
  {who:'촌장',text:'세 마리만 쫓아내 주게. 그러면 나도 아는 걸 하나 이야기해 주지.'},
  {who:'나',text:'(성녀의 이야기를 들으려면, 먼저 이 마을의 신뢰부터.)'},
 ],
 'chief-report':[
  {who:'촌장',text:'길이 조용해졌군. 고맙네. 약속했으니 하나만 말하지.'},
  {who:'촌장',text:'요아힘이 죽던 날, 대평원 북쪽 언덕에서 곰 울음이 들렸네.'},
  {who:'촌장',text:'…하지만 곰은 사람을 그렇게 찢지 않아. 그 이상은 나도 모르네.'},
  {who:'나',text:'(곰. 모두가 같은 이름을 말한다. 그런데 본 사람은 아무도 없다.)'},
 ],
 'chief-bear':[
  {who:'촌장',text:'곰을…? 자네 혼자서?'},
  {who:'나',text:'목에 보랏빛 쇠붙이가 박혀 있었습니다. 누가 일부러 채운 것처럼.'},
  {who:'촌장',text:'…요아힘도 같은 말을 했었지. 짐승들 눈빛이 이상하다고. 그 말을 아무도 믿지 않았네.'},
  {who:'촌장',text:'숲 쪽에서 고블린들이 내려온다는 소문도 있네. 오늘 밤은 목책을 지켜 주게.'},
 ],
 'raid-start':[
  {who:'청년',text:'고블린이에요! 목책 쪽으로 몰려와요!'},
  {who:'나',text:'(마을 안으로 들이면 안 된다.)'},
 ],
 'youth-goblin':[
  {who:'청년',text:'막아냈어요… 근데 저것들, 그냥 고블린이 아니에요. 덩치 큰 놈이 뒤에서 지휘하는 걸 봤어요.'},
  {who:'청년',text:'홉고블린이요. 요아힘 형이 마지막으로 나갔던 날도, 숲에서 그놈 얘기를 했었어요.'},
  {who:'청년',text:'형은 곰한테 죽은 게 아니에요. 숲에, 마물의 숲에 뭔가 있어요.'},
  {who:'나',text:'(보랏빛 쇠붙이, 홉고블린, 그리고 숲. 성녀가 사라진 길도 그쪽일 것이다.)'},
 ],
 'chief-idle':[{who:'촌장',text:'목책 고칠 일손이 모자라. 힘 좀 쓰는 사람이면 언제든 환영이네.'}],
 'elder-witness':[
  {who:'노년 여성',text:'엘레나? 아이고, 그 아이 덕에 이 다리로 다시 걷는다오. 밤새 내 곁을 지켰지.'},
  {who:'노년 여성',text:'받은 건 많은데… 마지막으로 뭘 해 줬느냐고 물으면, 말이 잘 안 나오는구먼.'},
  {who:'나',text:'(받은 것은 또렷이 기억하고, 준 것은 기억하지 못한다.)'},
 ],
 'elder-idle':[{who:'노년 여성',text:'그 아이가 돌아오면… 이번엔 내가 밥이라도 지어 줘야지.'}],
 'herbalist-witness':[
  {who:'약초사',text:'성녀님은 제 약통을 자주 빌려 가셨어요. 늘 채워서 돌려주셨고요.'},
  {who:'약초사',text:'마지막 통은 돌아오지 않았어요. 그 무렵 요아힘 씨가… 그렇게 됐으니까요.'},
  {who:'약초사',text:'그 뒤로 숲 쪽 물이 이상해졌어요. 약초가 검게 시들어요. 이건 교회에 꼭 전해 주세요.'},
 ],
 'herbalist-idle':[{who:'약초사',text:'숲 가까이 가실 거면 물은 마시지 마세요.'}],
 'youth-witness':[
  {who:'청년',text:'요아힘 형이랑 성녀님은 늘 같이 다녔어요. 형이 목책을 지키면 성녀님이 옆에서 다친 사람을 봤죠.'},
  {who:'청년',text:'형이 죽던 날요? 전 못 봤어요. 다들 곰이라고 하는데… 그날 형은 혼자 나간 게 아니었어요.'},
  {who:'청년',text:'…이 얘긴 여기까지만요. 촌장님 댁에서 좋아하지 않아요.'},
  {who:'나',text:'(혼자가 아니었다. 그런데 돌아온 것은 죽음의 소식뿐이었다.)'},
 ],
 'youth-idle':[{who:'청년',text:'목책이 또 무너졌어요. 다음 습격 전에 고쳐야 하는데.'}],
});

// Step types: defeat {kind,count,map,at,summon,intro,arrival} (at: lead there; summon once the player is inside) · turnIn marks a report (! instead of ?) · talk {targets:[npc],dialogues:{npc:id}} · reach {map}
export const QUESTS=Object.freeze([
 {id:'M00',title:'늑대와 마차',steps:[
  {id:'fight',text:'늑대를 물리치기',type:'defeat',count:1},
  {id:'driver',text:'마부와 이야기하기',type:'talk',targets:['driver'],turnIn:true,dialogues:{driver:'driver-thanks'}},
  {id:'road',text:'길을 따라 마을로 가기',type:'reach',map:'village'},
 ]},
 {id:'M01',title:'달빛 여관',steps:[
  {id:'inn',text:'여관 주인과 이야기하기',type:'talk',targets:['innkeeper'],dialogues:{innkeeper:'inn-arrive'}},
 ]},
 {id:'M02',title:'사람들이 기억하는 성녀',steps:[
  {id:'witness',text:'주민 세 사람의 이야기 듣기',type:'talk',targets:['elder','herbalist','youth'],dialogues:{elder:'elder-witness',herbalist:'herbalist-witness',youth:'youth-witness'}},
  {id:'report',text:'여관 주인에게 돌아가기',type:'talk',targets:['innkeeper'],turnIn:true,dialogues:{innkeeper:'inn-report'}},
 ]},
 {id:'M03',title:'마을의 부탁',steps:[
  {id:'ask',text:'촌장 찾아가기',type:'talk',targets:['chief'],dialogues:{chief:'chief-request'}},
  {id:'hunt',text:'대평원의 짐승 쫓아내기',type:'defeat',map:'great-plains',count:3},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-report'}},
 ]},
 {id:'M04',title:'대평원의 곰',steps:[
  {id:'bear',text:'평원 언덕의 곰 쓰러뜨리기',type:'defeat',kind:'bear',count:1,map:'great-plains',at:{x:-60,z:-60,radius:13},summon:{kind:'bear',count:1},arrival:'대평원의 곰이 모습을 드러냈다'},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-bear'}},
 ]},
 {id:'M05',title:'마을을 습격한 고블린',steps:[
  {id:'raid',text:'목책에서 고블린 막아내기',type:'defeat',kind:'goblin',count:4,map:'village',at:{x:0,z:28,radius:11},summon:{kind:'goblin',count:4},intro:'raid-start',arrival:'고블린 습격!'},
  {id:'report',text:'청년과 이야기하기',type:'talk',targets:['youth'],turnIn:true,dialogues:{youth:'youth-goblin'}},
 ]},
]);
export const CHAPTER_END_NOTE='다음 이야기 · 마물의 숲';

// First-fight coaching, in order. Each line stays until the player has done it.
// done: moved (metres) · camera (radians turned) · states (controller states)
export const COMBAT_HINTS=Object.freeze([
 {id:'move',text:'이동',keys:'W A S D',touch:'왼쪽 아래 스틱',target:'#joystick',done:{moved:1.5}},
 {id:'camera',text:'시점 돌리기',keys:'마우스 우클릭 드래그 · 휠로 확대',touch:'화면 오른쪽을 드래그 · 두 손가락으로 확대',done:{camera:.3}},
 {id:'attack',text:'공격',keys:'J · 좌클릭',touch:'검 버튼',target:'#attack-button',done:{states:['attack','slash','judgment','moveAttack']}},
 {id:'dodge',text:'늑대가 몸을 낮추면 회피',keys:'Space',touch:'장화 버튼',target:'#dodge-button',done:{states:['dodge']}},
 {id:'guard',text:'방패로 밀쳐 빈틈 만들기',keys:'F (길게 누르면 방어)',touch:'방패 버튼 (길게 누르면 방어)',target:'#guard-button',done:{states:['shieldPush','guard']}},
]);

// One-time tips, shown the first time a feature becomes relevant (per save).
// when: low-hp · near-npc · step:<quest>/<step> · effect:<name>
export const TIPS=Object.freeze([
 {id:'guide',when:'step:M00/fight',title:'길잡이 빛',keys:'빛무리가 가야 할 곳으로 먼저 날아갑니다.',touch:'빛무리가 가야 할 곳으로 먼저 날아갑니다.',text:'어디로 갈지 모를 때는 빛을 따라가세요.'},
 {id:'potion',when:'low-hp',title:'회복약',target:'#potion-button',keys:'숫자 1 키로 회복약을 마십니다.',touch:'물약 버튼으로 회복약을 마십니다.',text:'마시는 동안에도 움직일 수 있습니다.'},
 {id:'boss',when:'step:M04/bear',title:'큰 짐승',keys:'몸을 크게 젖히면 강한 공격이 옵니다. Space로 피하거나 F를 길게 눌러 막으세요.',touch:'몸을 크게 젖히면 강한 공격이 옵니다. 장화 버튼으로 피하거나 방패 버튼을 길게 눌러 막으세요.',text:'공격이 끝난 직후가 반격할 때입니다.'},
 {id:'charge',when:'step:M00/driver',title:'강공격',keys:'공격(J · 좌클릭)을 길게 누르면 심판의 검을 내려칩니다.',touch:'검 버튼을 길게 누르면 심판의 검을 내려칩니다.',text:'느리지만 강합니다. 빈틈이 보일 때 쓰세요.'},
 {id:'talk',when:'near-npc',title:'대화',keys:'가까이에서 E 키로 말을 겁니다.',touch:'가까이 가면 뜨는 버튼으로 말을 겁니다.',text:'전투 중에는 대화할 수 없습니다.'},
 {id:'sprint',when:'step:M00/road',title:'질주',keys:'Space를 길게 누르면 달립니다.',touch:'회피 버튼을 길게 누르면 달립니다.',text:'스태미나를 씁니다. 왼쪽 목표와 오른쪽 위 지도를 따라가세요.'},
 {id:'rest',when:'effect:rest',title:'휴식과 기록',keys:'여관 주인에게 말을 걸면 쉴 수 있습니다.',touch:'여관 주인에게 말을 걸면 쉴 수 있습니다.',text:'체력과 회복약이 채워지고 여정이 기록됩니다.'},
 {id:'witness',when:'step:M02/witness',title:'증언 모으기',keys:'세 사람에게 순서와 상관없이 물어보세요.',touch:'세 사람에게 순서와 상관없이 물어보세요.',text:'누구에게 들었는지는 목표에 표시됩니다.'},
]);
