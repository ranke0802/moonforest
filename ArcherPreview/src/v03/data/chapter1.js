// Chapter 1 content for the first ten minutes (M1). Data only: the story
// runtime reads it; nothing here touches the engine.
// The opening happens on the village road, about 24 m from the gate: close
// enough that the first walk is short and safe.
// 2026-11-20 (user: the wagon came down a slope over the grass): everything
// stands on the road itself now, on its straight flat stretch west of the
// lookout crossroads (-61,-20) -> (-79,-30). The wagon stops 12 m past the
// crossroads on the road's centre line, heading along it (yaw -2.078); the
// ride before it runs over ground between 0.64 and 0.21 m.
export const OPENING_STAGE=Object.freeze({map:'great-plains',x:-69.6,z:-21,yaw:-2.078});
// Scenery the story adds to a map (real assets, placed through the map's own
// placement runtime so streaming, collision and outlines work as usual).
export const PROPS=Object.freeze([
 {id:'v03-opening-wagon',asset:'covered-wagon',map:'great-plains',x:-71.49,z:-25.83,yaw:-2.078,collision:'none'},
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
 {id:'foster-father',name:'양아버지',visual:'sword-instructor',map:'village',x:7.3,z:-7.5,yaw:-.92,roam:false,idle:'instructor-idle',greet:'instructor-home'},
 {id:'driver',name:'마부',visual:'driver',map:'great-plains',x:-72.87,z:-30.14,yaw:.42,idle:'driver-idle'},
 {id:'innkeeper',name:'여관 주인',visual:'innkeeper',map:'village',x:-3.4,z:10.6,yaw:1.2,idle:'inn-idle'},
 {id:'elder',name:'노년 여성',visual:'elder',map:'village',x:4.2,z:-2.6,yaw:-1.9,idle:'elder-idle',greet:'elder-greet'},
 {id:'smith',name:'대장장이',visual:'smith',map:'village',x:7.4,z:3.5,yaw:-1.4,idle:'smith-idle',greet:'smith-greet',menu:'smith-menu'},
 {id:'herbalist',name:'약초사',visual:'herbalist',map:'village',x:-4.4,z:-2.8,yaw:.9,idle:'herbalist-idle',greet:'herbalist-greet',menu:'herbalist-menu'},
 {id:'chief',name:'촌장',visual:'chief',map:'village',x:7.2,z:9.4,yaw:-2.2,idle:'chief-idle',greet:'chief-greet'},
 {id:'youth',name:'청년',visual:'youth',map:'village',x:-5.2,z:5.6,yaw:1.6,idle:'youth-idle',greet:'youth-greet'},
]);

// who: speaker label. '나' lines are the warrior's own short thoughts.
export const DIALOGUES=Object.freeze({
 'instructor-home':[
  {who:'양아버지',text:'문밖에서 네 발소리가 들리더구나. 아직도 오른발을 조금 끄는구나.'},
  {who:'나',text:'그걸 듣고 저인 줄 아셨어요?'},
  {who:'양아버지',text:'그 발걸음을 누가 가르쳤는데. 이리 와 앉아라. 오늘은 검 내려놓고.'},
  {who:'양아버지',text:'기별 받고 바로 왔구나. 요즘 짐승들이 울타리 코앞까지 내려온다. 이 다리로는 목책에 설 수가 없어서 너를 불렀다.'},
  {who:'나',text:'교회 편지도 같이 받았어요. 엘레나 성녀님이 여섯 달째 소식이 없대요. 마지막으로 보신 게 언제예요?'},
  {who:'양아버지',text:'예배당 문을 나서는 걸 본 게 마지막이다. 그 뒤는 내가 본 게 없으니 말하지 않으마. 남의 말을 옮기면 너만 헷갈린다.'},
  {who:'양아버지',text:'사람들 얘기를 들어 봐라. 다들 반길 거다. 다만 그날 얘기가 나오면 입을 닫는 이도 있을 게다. 다그치지는 마라.'},
 ],
 // After the fight: the driver asks for a hand with the wagon (the effect lifts it),
 // then thanks the warrior and gives what he has (M00 reward).
 'driver-wagon':[
  {who:'마부',text:'휴우… 살았다. 네가 없었으면 말이고 나고 꼼짝없이 늑대 밥이었다.'},
  {who:'마부',text:'미안하다만 마차 좀 같이 세우자꾸나. 나 혼자선 꿈쩍도 안 한다.'},
  {who:'나',text:'그럼요. 아저씨가 자리 잡으시면 같이 밀어요.',effects:['right-wagon']},
 ],
 'driver-thanks':[
  {who:'마부',text:'어이쿠, 섰다 섰어! …아이고, 바퀴가 아주 박살이 났구나.'},
  {who:'마부',text:'그래도 다행이다. 마을이 바로 저기니 여기서부턴 조금만 걸으면 된다.'},
  {who:'마부',text:'목숨을 구해 줬으니 뭐라도 줘야 할 판이구나. 하나밖에 없는 딸을 아비 없는 자식 만들 뻔했다… 정말 고맙다.'},
  {who:'마부',text:'마구간에 네가 타곤 하던 말이 아직 있다. 오늘부터 네 말이야. 길에선 불러 타거라.'},
  {who:'마부',text:'마을에 들거든 아버지부터 뵙고, 달빛 여관에도 얼굴 비추거라. 주인장이 네 자리를 비워 뒀을 게다.'},
 ],
 // Prologue → first fight: the wagon ride and the wolf (played by story.beginAmbushScene).
 'ambush-scene':[
  {who:'마부',text:'으아악!'},
  {who:'나',text:'(…뭐, 뭐야?)'},
  {who:'마부',text:'느, 늑대다! 워, 워어!'},
  {who:'마부',text:'아이고, 마, 말이…!'},
  {who:'나',text:'(일단 마부부터 지키자.)'},
 ],
 'driver-idle':[
  {who:'마부',text:'바퀴만 고치면 나도 곧 뒤따라가마. 아버지께 안부 전해 다오.'},
 ],
 'inn-arrive':[
  {who:'여관 주인',text:'왔냐. …늘 앉던 자리, 짐부터 치워 놨다.'},
  {who:'나',text:'하나도 안 변하셨네요. 교회 편지를 받고 왔어요. 엘레나 성녀님이 여섯 달째 소식이 없대요.'},
  {who:'여관 주인',text:'…그 이름 오랜만에 듣는다. 다친 사람 곁을 밤새 지키던 아이였지.'},
  {who:'여관 주인',text:'난 장부만 들여다봤다. 그날 일은 본 사람한테 물어라. 우물가 할머니, 약초사, 목책 고치는 녀석. 다들 기억하는 게 조금씩 다를 거다.'},
  {who:'여관 주인',text:'2층 방 써라. 쉬고 싶으면 말하고. 오늘 일은 장부에 적어 두마.',effects:['rest']},
 ],
 'inn-idle':[
  {who:'여관 주인',text:'좀 쉬었다 가라. 오늘 일은 장부에 적어 두마.',effects:['rest']},
 ],
 'inn-report':[
  {who:'여관 주인',text:'세 사람 얘긴 다 들었구나. 표정 보니 말이 안 맞았던 모양이다.'},
  {who:'나',text:'다들 그녀를 좋게 기억해요. 그런데 마지막 며칠을 물으면 말끝을 흐리더군요.'},
  {who:'여관 주인',text:'…요아힘이 죽은 뒤로 다들 그 얘길 피한다. 평원 언덕에서 곰한테 당했다더라. 난 들은 거다.'},
  {who:'여관 주인',text:'입을 열게 하고 싶으면 일손부터 보태라. 촌장 댁에 일거리가 있을 거다. 일단 좀 쉬고.',effects:['rest']},
 ],
 'chief-request':[
  {who:'촌장',text:'돌아왔구먼. 자네가 성녀님 일을 묻고 다닌다지.'},
  {who:'촌장',text:'묻는 거야 말리지 않네. 다만 지금 이 마을엔 옛이야기를 할 여유가 없어.'},
  {who:'촌장',text:'평원 짐승들이 길까지 내려오고 있네. 마차가 당한 건 자네도 겪었고.'},
  {who:'촌장',text:'세 마리만 쫓아내 주게. 그러면 나도 아는 걸 하나 말해 주지.'},
  {who:'나',text:'(다들 반겨 주는데, 그날 일만은 쉽게 꺼내지 않네.)'},
 ],
 'chief-report':[
  {who:'촌장',text:'길이 좀 조용해졌군. 고맙네. 약속은 약속이니 하나만 말하지.'},
  {who:'촌장',text:'요아힘이 죽던 날, 평원 북쪽 언덕에서 곰 울음소리를 들었네. 내 귀로 들은 건 그것뿐일세.'},
  {who:'촌장',text:'…그런데 곰은 사람을 그렇게 찢지 않아. 그 이상은 나도 모르네.'},
  {who:'나',text:'(곰이라… 다들 같은 말을 하는데, 정작 본 사람은 없어.)'},
 ],
 'chief-bear':[
  {who:'촌장',text:'곰을…? 자네 혼자서?'},
  {who:'나',text:'목에 보랏빛 쇠붙이가 박혀 있었어요. 누가 일부러 채워 놓은 것처럼요.'},
  {who:'촌장',text:'…요아힘도 같은 말을 했었네. 짐승들 눈빛이 이상하다고. 그땐 아무도 믿지 않았지.'},
  {who:'촌장',text:'숲 쪽에서 고블린들이 내려온다는 소문도 있어. 오늘 밤엔 목책을 좀 지켜 주게.'},
 ],
 'raid-start':[
  {who:'청년',text:'누나, 고블린이에요! 목책 쪽으로 몰려와요!'},
  {who:'나',text:'(마을 안으로 들이면 안 돼.)'},
 ],
 'youth-goblin':[
  {who:'청년',text:'막았다… 누나, 저것들 그냥 고블린이 아니에요. 덩치 큰 놈이 뒤에서 지휘하는 걸 봤어요.'},
  {who:'청년',text:'홉고블린이요. 요아힘 형이 마지막으로 나가던 날도 숲에서 그놈 얘기를 했었어요.'},
  {who:'청년',text:'형은 곰한테 죽은 게 아니에요. 숲에… 마물의 숲에 뭔가 있어요.'},
  {who:'나',text:'(보랏빛 쇠붙이, 홉고블린, 그리고 숲. 성녀가 사라진 곳도 그쪽이겠지.)'},
 ],
 'driver-alpha':[
  {who:'마부',text:'오, 왔구나! 마을 소식 들었다. 고블린까지 막아 냈다면서?'},
  {who:'마부',text:'그런데 큰일이다. 초원 한복판에 우두머리 늑대가 무리를 끌고 나타났어. 덩치가 곰만 하더구나.'},
  {who:'마부',text:'그놈이 무리를 끌고 다니는 한 마차는 한 발짝도 못 움직인다. 미안하다만 부탁 좀 하자.'},
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
  {who:'여관 주인',text:'…돌아왔구나. 얼굴 보니 찾긴 찾은 모양이다.'},
  {who:'나',text:'성녀 엘레나는… 동굴 깊은 곳에 있었어요. 더는 사람이 아니었어요.'},
  {who:'여관 주인',text:'…그랬구나. 그 아이가 여기서 묵은 마지막 밤, 요아힘이 문 앞을 지켰다. 내가 본 건 그게 다다.'},
  {who:'여관 주인',text:'그 방은 그대로 뒀다. 일지가 한 권 남아 있을 거다. 읽고 말고는 네 몫이다.'},
  {who:'나',text:'(받은 건 기억하고, 준 건 기억 못 하는 마을. 그녀가 남긴 걸 읽어 봐야겠어.)'},
 ],
 'chief-idle':[
  {who:'촌장',text:'목책 고칠 일손이 모자라네. 힘쓸 사람이면 언제든 환영일세.'},
 ],
 'elder-witness':[
  {who:'노년 여성',text:'엘레나? 아이고, 그 아이 덕에 이 다리로 다시 걷는다우. 밤새 내 곁을 지켜 줬지.'},
  {who:'노년 여성',text:'받은 건 많은데… 그 아이한테 마지막으로 뭘 해 줬냐고 물으면, 말이 잘 안 나오는구먼.'},
  {who:'나',text:'(받은 건 또렷이 기억하는데, 준 건 기억을 못 하네.)'},
 ],
 'elder-idle':[
  {who:'노년 여성',text:'그 아이가 돌아오면… 이번엔 내가 밥이라도 해 먹여야지.'},
 ],
 'smith-idle':[
  {who:'대장장이',text:'날 상했으면 가져와라. 쇠는 거짓말 안 한다.'},
 ],
 // 2026-11-26: the one greeting line above the service choices (NPCS menu; story.js interact).
 'smith-menu':[
  {who:'대장장이',text:'왔구나. 사러 왔냐, 손보러 왔냐?'},
 ],
 'herbalist-menu':[
  {who:'약초사',text:'어서 오세요. 오늘은 뭐가 필요하세요?'},
 ],
 'herbalist-witness':[
  {who:'약초사',text:'성녀님은 상처 씻을 물을 몇 번이고 데워 가셨어요. 제 약통도 자주 빌려 가셨고요. 늘 꽉 채워서 돌려주셨어요.'},
  {who:'약초사',text:'마지막 통은 돌아오지 않았어요. 그 무렵에 요아힘 씨가… 그건 제가 본 게 아니라 들은 얘기예요.'},
  {who:'약초사',text:'제가 본 건 이거예요. 그 뒤로 숲 쪽 물가 약초가 까맣게 시들어요. 이건 교회에 꼭 전해 주세요.'},
 ],
 'herbalist-idle':[
  {who:'약초사',text:'숲 근처에 가시면 물은 절대 마시지 마세요.'},
 ],
 'youth-witness':[
  {who:'청년',text:'요아힘 형이랑 성녀님은 늘 붙어 다녔어요. 형이 목책을 지키면 성녀님은 옆에서 다친 사람들을 돌봤죠.'},
  {who:'청년',text:'형이 죽던 날요? 전 못 봤어요. 다들 곰 짓이라는데… 그날 형은 혼자 나간 게 아니었어요. 그건 제가 봤어요.'},
  {who:'청년',text:'…이 얘긴 여기까지만 할게요, 누나. 촌장님이 싫어하시거든요.'},
  {who:'나',text:'(혼자가 아니었다라… 그런데 돌아온 건 죽었다는 소식뿐이었고.)'},
 ],
 'youth-idle':[
  {who:'청년',text:'목책이 또 무너졌어요. 다음 습격 전에 고쳐야 하는데.'},
 ],
 // 2026-11-24 homecoming: first greetings (NPCS greet) and the optional errands (ERRANDS).
 'instructor-idle':[
  {who:'양아버지',text:'앉았다 가거라. 날이 무디면 대장간에 들르고. 검은 손질하는 만큼 버틴다.'},
 ],
 'chief-greet':[
  {who:'촌장',text:'자네로군. 아버지 기별 받고 왔다지. 잘 왔네.'},
  {who:'촌장',text:'마을 사정이 좋지 않네. 할 일이 생기면 부르겠네.'},
 ],
 'elder-greet':[
  {who:'노년 여성',text:'아이고, 이게 누구야! 키만 훌쩍 커서 왔구먼. 밥은 먹었니?'},
  {who:'나',text:'할머니도 참. 오자마자 밥 얘기부터 하세요.'},
  {who:'노년 여성',text:'밥 얘기 말고 할 얘기가 뭐 있누. 먼 길 왔으면 배부터 채워야지.'},
 ],
 'herbalist-greet':[
  {who:'약초사',text:'어머, 돌아오셨네요. 아버님이 요즘 부쩍 문 쪽을 보시더니, 기다리셨나 봐요.'},
  {who:'약초사',text:'길 떠나실 거면 물약 챙겨 가세요. 사 가셔도 되고, 재료가 있으면 여기서 만들어도 돼요.'},
 ],
 'youth-greet':[
  {who:'청년',text:'누나! 진짜 누나 맞아요? 왕국 용병단 들어갔다더니, 검 차고 오니까 딴사람 같네요!'},
  {who:'나',text:'너도 많이 컸네. 아직도 목책 고치고 있어?'},
  {who:'청년',text:'고쳐도 고쳐도 또 무너져요. 요즘 짐승들이 이상하게 사나워서요.'},
 ],
 'smith-greet':[
  {who:'대장장이',text:'손잡이 감은 매듭을 보니 네 검이구나. 어릴 적엔 저 모루에도 손이 안 닿더니. 자, 어디 한번 보자.'},
 ],
 'youth-errand':[
  {who:'청년',text:'누나, 부탁 하나만 해도 돼요? 울타리 밖에 짐승 발자국이 잔뜩이에요.'},
  {who:'청년',text:'목책 고치는 동안 자꾸 기웃거려서요. 대평원 쪽에서 두 마리만 쫓아내 주세요.'},
  {who:'나',text:'알았어. 쓸 만한 가죽이나 송곳니가 나오면 챙겨 둘게.'},
 ],
 'youth-errand-wait':[
  {who:'청년',text:'울타리 밖 놈들, 아직 기웃거려요. 대평원 쪽이에요.'},
 ],
 'youth-errand-done':[
  {who:'청년',text:'벌써요? 역시 누나네요.'},
  {who:'청년',text:'…사실 형이 마지막으로 나가던 날, 저 목책 위에 있었어요. 형 뒤로 몇 사람이 따라 나갔어요. 등만 봤어요.'},
  {who:'청년',text:'돌아온 건 형 소식뿐이었어요. 그 사람들 얼굴은… 끝내 못 봤어요.'},
  {who:'나',text:'(본 건 뒷모습뿐. 거기까지만 기억해 두자.)'},
 ],
 'herbalist-errand':[
  {who:'약초사',text:'손이 빈 김에 하나 알려 드릴게요. 회복약 한 병 만드는 법이요.'},
  {who:'약초사',text:'달이슬 약초 두 줌이면 돼요. 이건 제가 드릴게요. 제 앞에서 조제로 한 병 만들어 보세요.',effects:['give:moon-herb:2']},
  {who:'약초사',text:'만든 약은 가방에서 빠른 사용에 등록해 두세요. 싸울 때 바로 꺼내 마실 수 있어요.'},
 ],
 'herbalist-errand-wait':[
  {who:'약초사',text:'조제 탁자는 늘 비어 있어요. 약초 두 줌이면 한 병이에요.'},
 ],
 'herbalist-errand-done':[
  {who:'약초사',text:'잘 만드셨네요. 성녀님도 처음엔 물 온도를 못 맞춰서 몇 번이고 다시 끓이셨어요.'},
  {who:'약초사',text:'제가 본 마지막 날, 성녀님은 물을 데워 가시면서 오늘은 늦을 거라고만 하셨어요. 어디로 가신다는 말은 없었고요.'},
  {who:'약초사',text:'그때 더 여쭤볼걸… 가끔 그 생각을 해요.'},
 ],
 'elder-errand':[
  {who:'노년 여성',text:'얘야, 이 빈 광주리 좀 들어 주라. 습격 통에 곳간이 텅 비었지 뭐유.'},
  {who:'노년 여성',text:'멧돼지 고기 한 덩이만 구해 오면 오늘 저녁 국을 끓여 주마. 너도 먹고 가고.'},
  {who:'나',text:'대평원에 멧돼지가 다니던데. 잡아서 가져올게요.'},
 ],
 'elder-errand-wait':[
  {who:'노년 여성',text:'멧돼지 고기 한 덩이면 된다우. 대평원 풀숲에 멧돼지가 다니지.'},
 ],
 'elder-errand-done':[
  {who:'노년 여성',text:'아이고, 실하기도 하지. 국 끓이는 동안 앉아 있거라.'},
  {who:'노년 여성',text:'…엘레나도 여기 앉아서 국을 먹곤 했지. 마지막엔 숟가락만 들고 한참 창밖을 보더라. 무슨 생각을 했는지는 나도 모르우.'},
  {who:'노년 여성',text:'받기만 하고 물어보질 못했구먼. 넌 꼭 물어보고 다녀라.'},
 ],
 'smith-errand':[
  {who:'대장장이',text:'곰하고 붙었다며. 날 좀 보자. …이가 나갔구나.'},
  {who:'대장장이',text:'고치기만 할 거면 수리, 더 벼리려면 단련이다. 쇳조각 하나 줄 테니 직접 망치 쥐어 봐. 표시가 가운데 올 때 내리쳐.',effects:['give:iron-scrap:1']},
 ],
 'smith-errand-wait':[
  {who:'대장장이',text:'작업대 비어 있다. 단련 한 번 해 봐. 망치는 표시가 가운데 올 때다.'},
 ],
 'smith-errand-done':[
  {who:'대장장이',text:'손목이 아직 살아 있네. 어릴 적 버릇 그대로다.'},
  {who:'대장장이',text:'요아힘 검을 마지막으로 벼린 게 그날 사흘 전이다. 날을 세워 달라더군. 어디에 쓸 건지는 말 안 했다.'},
  {who:'나',text:'(사흘 전부터 무언가를 준비했다는 거네.)'},
 ],
 'chief-errand':[
  {who:'촌장',text:'숲으로 들 생각이면 하나 부탁하세. 숲 어귀에서 고블린 궁수들이 길 가는 사람을 노린다네.'},
  {who:'촌장',text:'거리를 두고 쏘아 대니 마을 사람들은 손을 못 써. 궁수 둘만 정리해 주게.'},
  {who:'나',text:'화살은 피하고, 가까이 붙어서 끝낼게요.'},
 ],
 'chief-errand-wait':[
  {who:'촌장',text:'궁수들은 숲 야영지 근처에 있다네. 화살이 날아오면 옆으로 피하게.'},
 ],
 'chief-errand-done':[
  {who:'촌장',text:'길이 한결 낫겠군. 고맙네.'},
  {who:'촌장',text:'…요아힘 일로 자네한테 할 말이 있네. 그날 밤 나는 회관 문을 잠그라고 했어. 밖에서 무슨 일이 있었는지 내 눈으로 본 건 없네.'},
  {who:'촌장',text:'본 게 없으니 말을 아꼈고, 그게 부끄러워 또 아꼈네. 이제라도 자네가 본 대로 적어 가게.'},
 ],
 'smith-chain':[
  {who:'대장장이',text:'숲 깊은 데서 갑옷 입은 송장이 돌아다닌다더라. 그 사슬, 고리 하나만 떼어 와 봐라.'},
  {who:'대장장이',text:'쇠를 보면 어디서 얼마나 있었는지 안다. 쇠는 거짓말 안 하거든.'},
  {who:'나',text:'구울 전사를 쓰러뜨리면 챙겨 올게요.'},
 ],
 'smith-chain-wait':[
  {who:'대장장이',text:'사슬 고리 하나면 된다. 갑옷 입은 송장한테서 떼어 와.'},
 ],
 'smith-chain-done':[
  {who:'대장장이',text:'…오래된 사슬이다. 고리마다 물에 삭은 자국이 있어. 숲 물가에 오래 있던 놈이다.'},
  {who:'대장장이',text:'누가 입던 건지는 모른다. 내가 아는 건 쇠뿐이야. 약초사가 말한 물 얘기와 같이 교회에 적어 보내라.'},
 ],
});

// Step types: defeat {kind,count,map,at,summon,tune,intro,arrival} (at: lead there; summon: call story foes once the player is inside — omit it to fight the map's own resident; tune: 0.3 balance for foes of that kind) · turnIn marks a report (! instead of ?) · talk {targets:[npc],dialogues:{npc:id}} · reach {map}
export const QUESTS=Object.freeze([
 {id:'M00',reward:{gold:30,potions:1},title:'늑대와 마차',steps:[
  {id:'fight',text:'늑대를 물리치기',type:'defeat',count:1},
  {id:'wagon',text:'마부를 도와 마차 세우기',type:'talk',targets:['driver'],dialogues:{driver:'driver-wagon'}},
  {id:'driver',text:'마부와 이야기하기',type:'talk',targets:['driver'],turnIn:true,dialogues:{driver:'driver-thanks'}},
  {id:'road',text:'길을 따라 몬트하임 마을로 가기',type:'reach',map:'village'},
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
  {id:'hunt',text:'윈드몬 대평원의 짐승 쫓아내기',type:'defeat',map:'great-plains',count:3},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-report'}},
 ]},
 {id:'M04',reward:{gold:120,armor:'leather'},title:'대평원의 곰',steps:[
  {id:'bear',text:'평원 언덕의 곰 쓰러뜨리기',type:'defeat',kind:'bear',count:1,map:'great-plains',at:{x:-25,z:-16,radius:15},tune:{hp:650,damage:.7},arrival:'대평원의 곰이 모습을 드러냈다'},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-bear'}},
 ]},
 {id:'M05',reward:{gold:150,potions:2},title:'마을을 습격한 고블린',steps:[
  {id:'raid',text:'목책에서 고블린 막아내기',type:'defeat',kind:'goblin',count:4,map:'village',at:{x:0,z:28,radius:11},summon:{kind:'goblin',count:4,from:{x:-1.2,z:58}},intro:'raid-start',arrival:'고블린 습격!'},
  {id:'report',text:'청년과 이야기하기',type:'talk',targets:['youth'],turnIn:true,dialogues:{youth:'youth-goblin'}},
 ]},
 {id:'M06',reward:{gold:250},title:'우두머리 늑대',steps:[
  {id:'driver',text:'마부와 이야기하기',type:'talk',targets:['driver'],dialogues:{driver:'driver-alpha'}},
  {id:'alpha',text:'초원 한가운데의 우두머리 늑대 쓰러뜨리기',type:'defeat',kind:'wolf',count:1,map:'great-plains',at:{x:29,z:37,radius:28},intro:'alpha-start',arrival:'우두머리 늑대가 당신을 주시하기 시작했다'},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-alpha'}},
 ]},
 {id:'M07',reward:{gold:200,potions:1},title:'마물의 숲',steps:[
  {id:'forest',text:'평원 동쪽 끝에서 마물의 숲으로 들어가기',type:'reach',map:'monster-forest'},
  {id:'goblins',text:'숲의 두 야영지에서 고블린 물리치기',type:'defeat',kind:'goblin',count:5,map:'monster-forest',at:{x:0,z:1,radius:10},intro:'forest-camp',arrival:'고블린 야영지다!'},
  {id:'cave',text:'숲 깊은 곳의 동굴로 들어가기',type:'reach',map:'witch-cave'},
 ]},
 {id:'M08',reward:{gold:300},title:'타락의 성소',steps:[
  {id:'saint',text:'동굴 깊은 곳의 성녀와 마주하기',type:'defeat',kind:'elena',count:1,map:'witch-cave'},
 ]},
 {id:'M09',reward:{gold:100},title:'남겨진 방',steps:[
  {id:'report',text:'여관 주인에게 돌아가기',type:'talk',targets:['innkeeper'],turnIn:true,dialogues:{innkeeper:'inn-ending'}},
 ]},
]);
// Optional errands (선택 의뢰) between main quests, 2026-11-24. Each teaches one
// village system and lets its giver tell what they themselves saw (errands.js).
// after: main quest that must be done · offer/wait/done: the giver's dialogues.
// Steps: defeat · talk · reach as in QUESTS, deliver {item,count,targets} hands
// bag items over in that talk, town {action:craft|forge|repair|buy,item?}.
export const ERRANDS=Object.freeze([
 {id:'S01',giver:'youth',after:'M02',reward:{gold:25},title:'울타리 밖 발자국',offer:'youth-errand',wait:'youth-errand-wait',done:'youth-errand-done',steps:[
  {id:'hunt',text:'대평원에서 짐승 두 마리 쫓아내기',type:'defeat',map:'great-plains',count:2},
  {id:'report',text:'청년에게 알리기',type:'talk',targets:['youth'],turnIn:true},
 ]},
 {id:'S02',giver:'herbalist',after:'M02',reward:{gold:10,potions:1},title:'물약 한 병',offer:'herbalist-errand',wait:'herbalist-errand-wait',done:'herbalist-errand-done',steps:[
  {id:'brew',text:'약초사에게서 회복약 한 병 조제하기',type:'town',action:'craft',item:'potion'},
  {id:'report',text:'약초사에게 알리기',type:'talk',targets:['herbalist'],turnIn:true},
 ]},
 {id:'S03',giver:'elder',after:'M03',reward:{gold:20,potions:1},title:'빈 광주리',offer:'elder-errand',wait:'elder-errand-wait',done:'elder-errand-done',steps:[
  {id:'meat',text:'할머니께 멧돼지 고기 한 덩이 가져다드리기',type:'deliver',item:'boar-meat',count:1,targets:['elder']},
 ]},
 {id:'S04',giver:'smith',after:'M04',reward:{gold:30},title:'무딘 날',offer:'smith-errand',wait:'smith-errand-wait',done:'smith-errand-done',steps:[
  {id:'temper',text:'대장장이 작업대에서 검을 한 번 단련하기',type:'town',action:'forge'},
  {id:'report',text:'대장장이에게 알리기',type:'talk',targets:['smith'],turnIn:true},
 ]},
 {id:'S05',giver:'chief',after:'M06',reward:{gold:60},title:'숲 어귀의 궁수',offer:'chief-errand',wait:'chief-errand-wait',done:'chief-errand-done',steps:[
  {id:'archers',text:'마물의 숲에서 고블린 궁수 둘 쓰러뜨리기',type:'defeat',kind:'goblin-archer',map:'monster-forest',count:2},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true},
 ]},
 {id:'S06',giver:'smith',after:'M06',reward:{gold:50},title:'구울의 사슬',offer:'smith-chain',wait:'smith-chain-wait',done:'smith-chain-done',steps:[
  {id:'link',text:'구울 사슬 고리 하나를 대장장이에게 가져가기',type:'deliver',item:'ghoul-mail',count:1,targets:['smith']},
 ]},
]);
export const CHAPTER_END_NOTE='1장 끝 · 다음 이야기 · 엘레나의 일지';

// First-fight coaching, in order. Each line stays until the player has done it.
// done: moved (metres) · camera (radians turned) · states (controller states)
// allow: the only actions usable during the lesson · wolf: hold | charge | snap
// The first fight's lessons, in the order the user set (2026-11-20): walk and
// look around while the wolf is busy with the horse, then dodge its charge,
// hold the guard, a normal attack, the shield shove and the heavy attack.
// wolf: feed (tearing at the fallen horse) · hold · charge · snap.
// done: moved (metres walked) · camera (radians turned) · states (the
// player's action; with hold, for that many seconds; with combo, as the
// nth hit of a chain; with charged, from the held attack only).
export const COMBAT_HINTS=Object.freeze([
 {id:'move',text:'이동',keys:'W A S D',touch:'왼쪽 아래 스틱',target:'#joystick',allow:['move'],wolf:'feed',done:{moved:8}},
 {id:'camera',text:'시점 돌리기',keys:'마우스 우클릭 드래그 · 휠로 확대',touch:'화면 오른쪽을 드래그 · 두 손가락으로 확대',allow:['camera'],wolf:'feed',done:{camera:.3}},
 {id:'dodge',text:'늑대가 달려들면 회피',keys:'Space',touch:'장화 버튼',target:'#dodge-button',allow:['move','camera','dodge'],wolf:'charge',done:{states:['dodge']}},
 {id:'guard',text:'방어 태세',keys:'F를 길게 누르고 있기',touch:'방패 버튼을 길게 누르고 있기',target:'#guard-button',allow:['move','camera','guard'],wolf:'snap',done:{states:['guard'],hold:.8}},
 {id:'attack',text:'연속 공격',keys:'J · 좌클릭을 이어서 두 번',touch:'검 버튼을 이어서 두 번',target:'#attack-button',allow:['move','camera','attack'],wolf:'hold',done:{states:['attack'],combo:2}},
 {id:'push',text:'방패 밀치기',keys:'F를 짧게',touch:'방패 버튼을 짧게',target:'#guard-button',allow:['move','camera','guard'],wolf:'snap',done:{states:['shieldPush']}},
 {id:'heavy',text:'강공격',keys:'J · 좌클릭을 길게 눌렀다 떼기',touch:'검 버튼을 길게 눌렀다 떼기',target:'#attack-button',allow:['move','camera','attack'],wolf:'hold',done:{states:['judgment'],charged:true}},
]);

// One-time tips, shown the first time a feature becomes relevant (per save).
// when: low-hp · low-stamina · near-npc · step:<quest>/<step> · effect:<name>
// (low-stamina also fires once the first-fight lessons are done)
export const TIPS=Object.freeze([
 {id:'guide',when:'guide-shown',title:'길잡이 빛',keys:'빛무리가 갈 곳으로 먼저 날아갑니다.',touch:'빛무리가 갈 곳으로 먼저 날아갑니다.',text:'길을 모를 땐 빛을 따라가세요.'},
 {id:'potion',when:'low-hp',title:'물약',target:'#potion-button',keys:'숫자 1~4로 해당 슬롯의 물약을 사용합니다.',touch:'물약 버튼을 짧게 눌러 사용하고 길게 눌러 종류를 선택합니다.',text:'가방에서 물약을 슬롯에 등록할 수 있습니다.'},
 {id:'boss',when:'step:M04/bear',title:'큰 짐승',keys:'Space로 피하고 F를 길게 눌러 막으세요.',touch:'장화로 피하고 방패를 길게 눌러 막으세요.',text:'젖히면 강공격, 끝나면 반격하세요.'},
 {id:'talk',when:'near-npc',title:'대화',keys:'가까이에서 E 키로 말을 겁니다.',touch:'가까이 가면 뜨는 버튼으로 말을 겁니다.',text:'전투 중에는 대화할 수 없습니다.'},
 {id:'sprint',when:'step:M00/road',title:'질주',keys:'Space를 길게 누르면 달립니다.',touch:'회피 버튼을 길게 누르면 달립니다.',text:'스태미나를 씁니다. 목표·지도를 따라가세요.'},
 {id:'stamina',when:'low-stamina',title:'스태미나',keys:'노란 막대가 스태미나입니다.',touch:'노란 막대가 스태미나입니다.',text:'공격·회피·방패·질주에 쓰고, 멈추면 찹니다.'},
 {id:'rest',when:'effect:rest',title:'휴식과 기록',keys:'여관 주인에게 말을 걸면 쉴 수 있습니다.',touch:'여관 주인에게 말을 걸면 쉴 수 있습니다.',text:'체력·회복약이 차고 여정이 기록됩니다.'},
 {id:'witness',when:'step:M02/witness',title:'증언 모으기',keys:'세 사람에게 순서 상관없이 물어보세요.',touch:'세 사람에게 순서 상관없이 물어보세요.',text:'들은 사람은 목표에 표시됩니다.'},
]);
