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
// Villagers greet the warrior once per save as after three years away (NPCS greet). Chapter 2
// retraces the journal and sets this false.
export const REUNIONS=true;
export const NPCS=Object.freeze([
 // greet: the first meeting in a save (a reunion after three years; the driver is a stranger).
 // Before a quest or errand line it is played first, once (story.js interact).
 {id:'foster-father',name:'양아버지',visual:'sword-instructor',map:'village',x:7.3,z:-7.5,yaw:-.92,roam:false,idle:'instructor-idle',greet:'instructor-greet'},
 {id:'driver',name:'마부',visual:'driver',map:'great-plains',x:-72.87,z:-30.14,yaw:.42,idle:'driver-idle'},
 {id:'innkeeper',name:'여관 주인',visual:'innkeeper',map:'village',x:-3.4,z:10.6,yaw:1.2,idle:'inn-idle',greet:'inn-greet',menu:'inn-menu'},
 {id:'elder',name:'노년 여성',visual:'elder',map:'village',x:4.2,z:-2.6,yaw:-1.9,idle:'elder-idle',greet:'elder-greet'},
 {id:'smith',name:'대장장이',visual:'smith',map:'village',x:7.4,z:3.5,yaw:-1.4,idle:'smith-idle',greet:'smith-greet',menu:'smith-menu'},
 {id:'herbalist',name:'약초사',visual:'herbalist',map:'village',x:-4.4,z:-2.8,yaw:.9,idle:'herbalist-idle',greet:'herbalist-greet',menu:'herbalist-menu'},
 {id:'chief',name:'촌장',visual:'chief',map:'village',x:7.2,z:9.4,yaw:-2.2,idle:'chief-idle',greet:'chief-greet'},
 // The village scout (was "청년" until 2026-11-27). The id stays youth (saves, errands, portraits).
 {id:'youth',name:'제프리',visual:'youth',map:'village',x:-5.2,z:5.6,yaw:1.6,idle:'youth-idle',greet:'youth-greet'},
 // clue: things to look at in the forest (M07). They stand only while their step waits on
 // them; temporary blocks from placeholder-actor.js until models exist (ASSETS.md).
 {id:'clue-poison',name:'고블린의 약병',visual:'clue-poison',map:'monster-forest',x:2.8,z:4.6,yaw:.4,roam:false,clue:true},
 {id:'clue-sword',name:'할리안의 검',visual:'clue-sword',map:'monster-forest',x:-3.6,z:-2.4,yaw:1.1,roam:false,clue:true},
 {id:'clue-armor',name:'할리안의 갑옷',visual:'clue-armor',map:'monster-forest',x:4.4,z:-3.2,yaw:-.5,roam:false,clue:true},
 {id:'clue-cave',name:'동굴로 이어진 흔적',visual:'clue-cave',map:'monster-forest',x:24.5,z:-36.5,yaw:.3,roam:false,clue:true},
]);

// who: speaker label. '나' lines are the warrior's own short thoughts.
export const DIALOGUES=Object.freeze({
 // After the fight: the driver asks for a hand with the wagon (the effect lifts it),
 // then thanks the warrior and gives what he has (M00 reward).
 'driver-wagon':[
  {who:'마부',text:'휴우… 살았다. 네가 없었으면 말이고 나고 꼼짝없이 늑대 밥이었다.'},
  {who:'마부',text:'미안하다만 마차 좀 같이 세우자꾸나. 나 혼자선 꿈쩍도 안 한다.'},
  {who:'나',text:'그럼요. 아저씨가 자리 잡으시면 같이 밀어요.',effects:['right-wagon']},
 ],
 'driver-thanks':[
  {who:'마부',text:'어이쿠, 섰다 섰어! …아이고, 바퀴가 아주 박살이 났구나.'},
  {who:'마부',text:'그래도 다행이다. 몬트하임이 바로 저기니 여기서부턴 조금만 걸으면 된다.'},
  {who:'마부',text:'목숨을 구해 줬으니 뭐라도 줘야 할 판이구나. 하나밖에 없는 딸을 아비 없는 자식 만들 뻔했다… 정말 고맙다.'},
  {who:'마부',text:'마을 마구간에 내 말이 한 필 더 있다. 오늘부터 네 말이다. 길에선 불러 타거라.'},
  {who:'마부',text:'삼 년 만의 고향이라 했지? 달빛 여관부터 들르거라. 이 길로 드는 사람은 다 거기서 짐을 푼다.'},
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
  {who:'마부',text:'길 조심하거라. 요즘 평원 짐승들이 예전 같지 않다.'},
 ],
 'inn-arrive':[
  {who:'나',text:'아버지 기별을 받고 왔어요. 교회 편지도 같이요. 엘레나 성녀님이 여섯 달째 소식이 없대요.'},
  {who:'여관 주인',text:'…그 이름 오랜만에 듣는다. 네가 떠난 이듬해에 이 마을에 온 아이다. 다친 사람 곁을 밤새 지키곤 했지.'},
  {who:'여관 주인',text:'난 장부만 들여다보는 사람이라 그날 일은 모른다. 네 아버지부터 뵈어라. 기별을 넣은 것도 그 양반이다.'},
  {who:'여관 주인',text:'2층 끝방을 치워 두마. 쉬고 싶으면 언제든 말하고.',effects:['rest']},
 ],
 'inn-idle':[
  {who:'여관 주인',text:'좀 쉬었다 가라. 오늘 일은 장부에 적어 두마.',effects:['rest']},
 ],
 'chief-request':[
  {who:'나',text:'성녀님 일을 여쭤보러 왔어요. 아버지가 촌장님께 먼저 가 보라고 하셔서요.'},
  {who:'촌장',text:'…성녀님이라. 묻는 거야 말리지 않네. 다만 지금 이 마을엔 옛이야기를 할 여유가 없어.'},
  {who:'촌장',text:'평원 짐승들이 길까지 내려오고 있네. 마차가 당한 건 자네도 겪었지.'},
  {who:'촌장',text:'세 마리만 쫓아내 주게. 그러면 나도 아는 걸 말해 주지.'},
 ],
 'chief-report':[
  {who:'촌장',text:'길이 좀 조용해졌군. 고맙네. 약속은 약속이니 말하지.'},
  {who:'촌장',text:'성녀님은 요아힘이라는 젊은이와 가까웠네. 둘이 늘 같이 다녔지.'},
  {who:'촌장',text:'요아힘이 죽고 나서 성녀님이 사라졌네. 내가 아는 건 거기까지야.'},
  {who:'나',text:'그게 다예요? 그날 무슨 일이 있었는지는요?'},
  {who:'촌장',text:'…모른다고 했네. 이만 가 보게.'},
  {who:'나',text:'(뭔가 숨기는 눈치야. 아버지께 다시 여쭤봐야겠어.)'},
 ],
 'raid-start':[
  {who:'제프리',text:'누나, 고블린이에요! 목책 쪽으로 몰려와요!'},
  {who:'나',text:'(마을 안으로 들이면 안 돼.)'},
 ],
 'youth-goblin':[
  {who:'제프리',text:'막았다… 누나, 저것들 그냥 고블린이 아니에요. 덩치 큰 놈이 뒤에서 지휘하는 걸 봤어요.'},
  {who:'제프리',text:'홉고블린이요. 요아힘 형이 마지막으로 나가던 날도 숲에서 그놈 얘기를 했었어요.'},
  {who:'제프리',text:'형은 곰한테 죽은 게 아니에요. 숲에… 마물의 숲에 뭔가 있어요.'},
  {who:'나',text:'(보랏빛 쇠붙이, 홉고블린, 그리고 숲. 성녀가 사라진 곳도 그쪽이겠지.)'},
 ],
 'driver-alpha':[
  {who:'마부',text:'오, 왔구나! 덕분에 마차 수리가 다 끝났다. 언덕의 곰도 네가 잡았다면서?'},
  {who:'마부',text:'그런데 큰일이다. 초원 한복판에 우두머리 늑대가 무리를 끌고 나타났어. 덩치가 곰만 하더구나.'},
  {who:'마부',text:'그놈이 무리를 끌고 다니는 한 마차는 한 발짝도 못 움직인다. 미안하다만 부탁 좀 하자.'},
  {who:'나',text:'(무리를 이끄는 놈이라… 짐승들이 사나워진 이유도 거기 있을지 몰라.)'},
 ],
 'alpha-start':[
  {who:'나',text:'(저 눈빛… 곰 목에 박혀 있던 것과 같은 보랏빛이야.)'},
 ],
 'forest-camp':[
  {who:'나',text:'(나무 사이로 연기가 올라와. 고블린 야영지야.)'},
  {who:'나',text:'(목책을 넘던 놈들도 여기서 왔겠지.)'},
 ],
 'inn-ending':[
  {who:'여관 주인',text:'…돌아왔구나. 얼굴 보니 찾긴 찾은 모양이다.'},
  {who:'나',text:'성녀 엘레나는… 동굴 깊은 곳에 있었어요. 더는 사람이 아니었어요.'},
  {who:'여관 주인',text:'…그랬구나. 그 아이가 사라지기 전날 밤, 방에 늦게까지 불이 켜져 있었다. 내가 본 건 그게 다다.'},
  {who:'여관 주인',text:'그 방은 그대로 뒀다. 일지가 한 권 남아 있을 거다. 읽고 말고는 네 몫이다.'},
  {who:'나',text:'(그녀가 왜 그렇게 됐는지, 남긴 걸 읽어 봐야겠어.)'},
 ],
 'chief-idle':[
  {who:'촌장',text:'목책 고칠 일손이 모자라네. 힘쓸 사람이면 언제든 환영일세.'},
 ],
 'elder-idle':[
  {who:'노년 여성',text:'목책 밖은 요즘 해만 지면 무섭다우. 일찍 들어오너라.'},
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
 'herbalist-idle':[
  {who:'약초사',text:'숲 근처에 가시면 물은 절대 마시지 마세요.'},
 ],
 'youth-idle':[
  {who:'제프리',text:'정찰 나갈 때마다 짐승 발자국이 늘어요. 누나도 조심해요.'},
 ],
 // 2026-11-24 homecoming: first greetings (NPCS greet) and the optional errands (ERRANDS).
 'instructor-idle':[
  {who:'양아버지',text:'앉았다 가거라. 날이 무디면 대장간에 들르고. 검은 손질하는 만큼 버틴다.'},
 ],
 'chief-greet':[
  {who:'촌장',text:'자네로군. 삼 년 만인가. 용병단에 들어갔다더니 제법 태가 나는구먼.'},
  {who:'나',text:'촌장님도 평안하셨어요?'},
  {who:'촌장',text:'평안할 틈이 있었겠나. 마을 사정이 좋지 않네. …그래도 잘 왔네.'},
 ],
 'elder-greet':[
  {who:'노년 여성',text:'아이고, 이게 누구야! 삼 년 만에 키만 훌쩍 커서 왔구먼. 밥은 먹었니?'},
  {who:'나',text:'할머니도 참. 오자마자 밥 얘기부터 하세요.'},
  {who:'노년 여성',text:'밥 얘기 말고 할 얘기가 뭐 있누. 그 먼 데서 몸 성히 왔으면 됐지. 배부터 채워라.'},
 ],
 'herbalist-greet':[
  {who:'약초사',text:'어머, 돌아오셨네요! 삼 년 만이죠? 몰라볼 뻔했어요.'},
  {who:'약초사',text:'아버님이 요즘 부쩍 문 쪽을 보시더니, 기다리셨나 봐요. 다친 데는 없으세요?'},
  {who:'나',text:'멀쩡해요. 약방은 그대로네요.'},
  {who:'약초사',text:'길 떠나실 거면 물약 챙겨 가세요. 사 가셔도 되고, 재료가 있으면 여기서 만들어도 돼요.'},
 ],
 'youth-greet':[
  {who:'제프리',text:'누나! 진짜 누나 맞아요? 삼 년 만이잖아요. 용병단 들어갔다더니, 검 차고 오니까 딴사람 같네요!'},
  {who:'나',text:'제프리? 목책에 매달려 놀던 녀석이 언제 이렇게 컸어.'},
  {who:'제프리',text:'저 이제 마을 정찰병이에요. 평원이고 숲 어귀고 제가 제일 많이 돌아요.'},
  {who:'제프리',text:'요즘은 짐승들이 이상하게 사나워서 하루도 편할 날이 없지만요.'},
 ],
 'smith-greet':[
  {who:'대장장이',text:'손잡이 감은 매듭을 보니 네 검이구나. 삼 년 만이냐.'},
  {who:'대장장이',text:'어릴 적엔 저 모루에도 손이 안 닿더니. 용병단 밥이 맞았나 보다.'},
  {who:'대장장이',text:'자, 어디 한번 보자. 날 상했으면 언제든 가져와라.'},
 ],
 'youth-errand':[
  {who:'제프리',text:'누나, 부탁 하나만 해도 돼요? 울타리 밖에 짐승 발자국이 잔뜩이에요.'},
  {who:'제프리',text:'정찰 나갈 때마다 자꾸 따라붙어서요. 대평원 쪽에서 두 마리만 쫓아내 주세요.'},
  {who:'나',text:'알았어. 쓸 만한 가죽이나 송곳니가 나오면 챙겨 둘게.'},
 ],
 'youth-errand-wait':[
  {who:'제프리',text:'울타리 밖 놈들, 아직 기웃거려요. 대평원 쪽이에요.'},
 ],
 'youth-errand-done':[
  {who:'제프리',text:'벌써요? 역시 누나네요.'},
  {who:'제프리',text:'요아힘 형도 이런 부탁은 두말없이 들어줬어요. 다녀와서는 꼭 성녀님한테 다친 데를 보여 줬고요.'},
  {who:'제프리',text:'둘이 나란히 목책에 앉아 있던 게 엊그제 같은데…'},
  {who:'나',text:'(제프리도 아직 그날에서 벗어나지 못했구나.)'},
 ],
 // Jeffrey's defense errand (W01, defense-waves.js): offer, the start of a stage by band
 // (2–4 / 5–7 / 8–9 / 10), after a lost stage, a talk during one, the last report.
 'jeffrey-waves-offer':[
  {who:'제프리',text:'누나, 큰일이에요. 숲 쪽 마물들이 목책으로 몰려오고 있어요. 막을 때마다 다음엔 더 많이, 더 세게 와요.'},
  {who:'제프리',text:'저 혼자선 못 버텨요. 목책을 같이 지켜 주세요. …저기, 벌써 오고 있어요!'},
  {who:'나',text:'(마을 안으로는 한 마리도 들이지 않는다.)'},
 ],
 'jeffrey-waves-early':[
  {who:'제프리',text:'또 와요! 이번엔 수가 더 많아요. 목책 앞에서 막아 주세요!'},
 ],
 'jeffrey-waves-mid':[
  {who:'제프리',text:'놈들 움직임이 달라졌어요. 활 든 놈들이 뒤에서 쏘고, 덩치 큰 놈까지 섞였어요.'},
  {who:'제프리',text:'화살이 날아오면 옆으로 피하세요. 준비됐죠? 가요!'},
 ],
 'jeffrey-waves-late':[
  {who:'제프리',text:'이젠 숲이 통째로 내려오는 것 같아요… 그래도 누나가 있으니까 버틸 수 있어요.'},
  {who:'제프리',text:'물약 챙겼죠? 목책 무너지기 전에 끝내요!'},
 ],
 'jeffrey-waves-last':[
  {who:'제프리',text:'이번이 마지막 큰 무리예요. 홉고블린이 둘이나 보여요.'},
  {who:'제프리',text:'이것만 막으면 숲도 한동안 조용할 거예요. 누나, 부탁해요!'},
 ],
 'jeffrey-waves-retry':[
  {who:'제프리',text:'누나, 괜찮아요? 놈들은 일단 물러났어요. 숨 고르고 다시 가요.'},
 ],
 'jeffrey-waves-hold':[
  {who:'제프리',text:'목책이에요! 놈들이 아직 남았어요!'},
 ],
 'jeffrey-waves-done':[
  {who:'제프리',text:'…다 막았어요. 열 번을, 정말로 다요.'},
  {who:'제프리',text:'요아힘 형이 지키던 목책을 누나가 지켜 줬네요. 고마워요, 누나.'},
  {who:'나',text:'(이 마을의 목책은 아직 무너지지 않았다.)'},
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
  {who:'노년 여성',text:'얘야, 이 빈 광주리 좀 들어 주라. 짐승들이 밭을 헤집는 통에 곳간이 텅 비었지 뭐유.'},
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
  {who:'촌장',text:'…숲으로 간다지. 마을 일로 하나만 부탁하세. 숲 어귀에서 고블린 궁수들이 길 가는 사람을 노린다네.'},
  {who:'촌장',text:'거리를 두고 쏘아 대니 마을 사람들은 손을 못 써. 궁수 둘만 정리해 주게.'},
  {who:'나',text:'화살은 피하고, 가까이 붙어서 끝낼게요.'},
 ],
 'chief-errand-wait':[
  {who:'촌장',text:'궁수들은 숲 야영지 근처에 있다네. 화살이 날아오면 옆으로 피하게.'},
 ],
 'chief-errand-done':[
  {who:'촌장',text:'길이 한결 낫겠군. 고맙네.'},
  {who:'촌장',text:'…지난번엔 언성을 높였네. 아들 얘기만 나오면 나도 모르게 그렇게 되네.'},
  {who:'촌장',text:'자네가 무얼 찾든 말리지 않겠네. 다만 마을 사람들까지 다치게 하진 말게.'},
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
  {who:'대장장이',text:'누가 입던 건지는 모른다. 내가 아는 건 쇠뿐이야. 숲 물은 손대지 마라. 약초사 말이 맞다.'},
 ],
 // 2026-11-27 homecoming line (1127-story): reunions, the new main steps, the forest clues, the driver's alpha errand.
 'village-return':[
  {who:'나',text:'(삼 년 만이네. 목책도, 여관 불빛도 그대로야.)'},
 ],
 'inn-greet':[
  {who:'여관 주인',text:'…이게 누구야. 문소리가 낯익다 했더니.'},
  {who:'여관 주인',text:'삼 년이다. 편지 한 장 없이 삼 년. 살아는 있었구나.'},
  {who:'나',text:'용병단 일이 바빠서요. 아저씨는 그대로시네요.'},
  {who:'여관 주인',text:'나야 장부랑 같이 늙지. 앉아라, 따뜻한 거 한 잔 내주마.'},
 ],
 'inn-menu':[
  {who:'여관 주인',text:'왔냐. 쉬어 갈 거냐, 할 얘기가 있냐?'},
 ],
 'instructor-greet':[
  {who:'양아버지',text:'문밖에서 네 발소리가 들리더구나. 삼 년이 지났는데도 오른발을 조금 끄는 건 그대로구나.'},
  {who:'나',text:'그걸 듣고 저인 줄 아셨어요?'},
  {who:'양아버지',text:'그 발걸음을 누가 가르쳤는데. …얼굴 좀 보자. 많이 탔구나. 어디 다친 데는 없고?'},
  {who:'나',text:'멀쩡해요. 아버지야말로 다리는 좀 어떠세요?'},
  {who:'양아버지',text:'보다시피다. 이리 와 앉아라. 오늘은 검 내려놓고.'},
 ],
 'instructor-call':[
  {who:'양아버지',text:'기별 받고 바로 왔구나. 요즘 짐승들이 울타리 코앞까지 내려온다. 이 다리로는 목책에 설 수가 없어서 너를 불렀다.'},
  {who:'나',text:'교회 편지도 받았어요. 엘레나 성녀님이 여섯 달째 소식이 없대요. 무슨 일이 있었던 거예요?'},
  {who:'양아버지',text:'나도 끝난 뒤에 들은 게 전부다. 들은 말을 옮기면 너만 헷갈린다.'},
  {who:'양아버지',text:'촌장부터 찾아가라. 마을 일은 그 사람이 제일 잘 안다. 짐승 일로도 네 손이 필요할 게다.'},
 ],
 'instructor-joachim':[
  {who:'나',text:'촌장님은 성녀님이 요아힘이라는 사람과 가까웠고, 그가 죽은 뒤 사라졌다고만 하셨어요. 뭔가 숨기시는 것 같았어요.'},
  {who:'양아버지',text:'…그날 나는 이 다리로 집에 누워 있었다. 다 끝난 뒤에야 이야기를 들었지.'},
  {who:'양아버지',text:'요아힘은 네가 떠난 뒤에 내가 받은 제자다. 검은 누구보다 빨리 늘었고, 성품은 나보다 나았다.'},
  {who:'양아버지',text:'그런 아이가 고블린 몇 마리에… 아직도 믿기지가 않는다.'},
  {who:'양아버지',text:'제프리를 찾아가 봐라. 요아힘, 성녀님과 가장 가까웠던 녀석이다. 지금은 마을 정찰을 맡고 있다.'},
 ],
 'jeffrey-bear':[
  {who:'제프리',text:'누나, 아버님이 보내셨어요? …요아힘 형 얘기 때문이죠.'},
  {who:'제프리',text:'다 말해 줄게요. 그런데 그 전에 부탁이 있어요. 평원 언덕에 곰이 한 마리 눌러앉았어요.'},
  {who:'제프리',text:'그냥 곰이 아니에요. 나무를 상대로 주먹질을 하는데, 꼭 격투술을 수련하는 것 같아요. 저 혼자서는 어림도 없어요.'},
  {who:'제프리',text:'그놈 때문에 정찰로를 못 돌고 있어요. 도와주면 뭐든 대답할게요.'},
  {who:'나',text:'알았어. 언덕이라고 했지?'},
 ],
 'jeffrey-truth':[
  {who:'제프리',text:'그 곰을 잡았다고요? …역시 누나네요. 약속대로 다 말할게요.'},
  {who:'제프리',text:'그날 고블린들이 목책으로 몰려왔어요. 요아힘 형이라면 혼자서도 여유롭게 막았을 놈들이었어요.'},
  {who:'제프리',text:'그런데 형이 이상했어요. 무언가에 마비된 것처럼 몸이 굼떴어요. 그러다 고블린들한테 치명상을 입고…'},
  {who:'제프리',text:'성녀님이 형을 한참 끌어안고 울면서 회복 기도를 올렸어요. 하지만 형은 이미 숨이 멎어 있었어요.'},
  {who:'제프리',text:'그리고… 성녀님이 갑자기 격분해서 촌장님 아들, 할리안 형한테 달려들려다가 멈췄어요. 그런 성녀님은 처음 봤어요.'},
  {who:'나',text:'(마비된 것 같은 굼뜬 움직임… 짐작 가는 곳이 있어. 약초사에게 물어보자.)'},
 ],
 'herbalist-poison':[
  {who:'나',text:'요아힘이 쓰러지던 날, 마비된 것처럼 몸이 굼떴대요. 그런 걸 일으키는 게 있을까요?'},
  {who:'약초사',text:'…마비독 같아요. 숲에 나는 독초 중에 몸을 굳게 하는 게 있어요. 고블린들이 그걸 쓴다는 얘기를 들은 적이 있고요.'},
  {who:'약초사',text:'다만 들은 얘기라 장담은 못 해요.'},
  {who:'약초사',text:'그리고 하나 이상한 게 있어요. 성녀님이 할리안 씨한테 화를 내셨다는 거요.'},
  {who:'약초사',text:'제가 아는 성녀님은 누구한테도 언성 한 번 높인 적이 없는 분이었어요. 그 얘기만은 아무리 생각해도 이해가 안 돼요.'},
  {who:'나',text:'(촌장님께 직접 여쭤봐야겠어.)'},
 ],
 'chief-halian':[
  {who:'나',text:'촌장님. 그날 성녀님이 할리안에게 달려들려 했다고 들었어요. 무슨 일이 있었던 거예요?'},
  {who:'촌장',text:'…누구한테 들었나. 제프리 녀석인가.'},
  {who:'촌장',text:'나도 피해자일세. 그 싸움 며칠 뒤, 마물들이 다시 내려와 내 아들을 데려갔어. 시신조차 찾지 못했네.'},
  {who:'촌장',text:'그런데 자네는 지금… 내 아들이 요아힘을 죽인 범인이라고 말하고 싶은 건가.'},
  {who:'나',text:'…그런 말은 하지 않았어요.'},
  {who:'촌장',text:'그럼 이 얘기는 여기서 끝내세. 돌아가게.'},
  {who:'나',text:'(의심은 가는데 증거가 없어. 고블린들이 내려온 곳, 마물의 숲을 조사해 보자.)'},
 ],
 'clue-poison':[
  {who:'나',text:'(고블린들이 두고 간 작은 약병이야. 바닥에 끈적한 게 말라붙어 있어.)'},
  {who:'나',text:'(무기에 바르는 거겠지. 약초사가 말한 마비독이 이건가.)'},
 ],
 'clue-sword':[
  {who:'나',text:'(이 검… 손잡이에 감긴 붉은 끈. 할리안이 어릴 때부터 차고 다니던 검이야.)'},
  {who:'나',text:'(마물이 시신을 가져갔다고 했지. 그런데 왜 검이 고블린 야영지에 있지?)'},
 ],
 'clue-armor':[
  {who:'나',text:'(가죽 갑옷이야. 어깨에 새긴 마을 문장… 할리안이 즐겨 입던 거야.)'},
  {who:'나',text:'(가죽이 그을리고 찢겨 있어. 여기서 무슨 일이 있었던 걸까.)'},
 ],
 'hobgoblin-start':[
  {who:'나',text:'(저 덩치… 고블린들을 부리던 놈이야.)'},
 ],
 'clue-cave':[
  {who:'나',text:'(고블린과 홉고블린까지 쓰러뜨렸는데, 할리안의 흔적은 더 없어.)'},
  {who:'나',text:'(발자국이 숲 안쪽 동굴로 이어져. 동굴 입구에서 검은 기운이 새어 나오고 있어.)'},
  {who:'나',text:'(아무것도 모르고 들어가기엔 위험해. 숲을 아는 제프리에게 먼저 물어보자.)'},
 ],
 'jeffrey-witch':[
  {who:'제프리',text:'숲에 다녀왔어요? 얼굴을 보니 뭘 찾긴 찾았네요.'},
  {who:'나',text:'할리안의 검이랑 갑옷이 고블린 야영지에 있었어. 흔적은 숲 안쪽 동굴로 이어졌고.'},
  {who:'제프리',text:'그 동굴… 저도 숲 깊숙이는 못 들어가 봤어요. 그런데 멀리서 본 게 있어요.'},
  {who:'제프리',text:'거기 홉고블린들은 누군가의 명령을 따르고 있었어요. 마치… 마녀 같은 모습이었어요.'},
  {who:'제프리',text:'숲 마물들이 대평원까지 내려온 것도 그 마녀 때문이 아닐까 싶어요.'},
  {who:'제프리',text:'누나, 그 동굴은 혼자 가기엔 너무 위험해요. 가지 마세요.'},
  {who:'나',text:'(요아힘의 죽음, 사라진 성녀, 할리안의 검… 모든 실마리가 그 마녀를 가리켜. 확인해야 해.)'},
 ],
 'driver-alpha-wait':[
  {who:'마부',text:'우두머리 늑대는 초원 한가운데를 돌아다닌다. 무리째 덤비니 조심하거라.'},
 ],
 'driver-alpha-done':[
  {who:'마부',text:'우두머리 늑대를…! 이제야 길이 트이겠구나.'},
  {who:'마부',text:'마을 오가는 길도 한결 편해지겠어. 정말 고맙다. 이건 내 성의다.'},
  {who:'나',text:'(평원도 조금은 조용해지겠지.)'},
 ],
});

// Step types: defeat {kind,count,map,at,summon,tune,intro,arrival,early} (at: lead there; summon: call story foes once the player is inside — omit it to fight the map's own resident; tune: 0.3 balance for foes of that kind; early: a resident of that kind already felled on this visit counts) · turnIn marks a report (! instead of ?) · talk {targets:[npc],dialogues:{npc:id}} · reach {map,reading}
// 2026-11-27 homecoming line (user flow, 1127-story): inn → father → chief (three beasts) →
// father → Jeffrey (bear) → herbalist → chief → the forest → Jeffrey → the witch's cave.
// Ids that kept their meaning kept their id (rewards, receipts); old saves: quest-migration.js.
export const QUESTS=Object.freeze([
 {id:'M00',reward:{gold:30,potions:1},title:'늑대와 마차',steps:[
  // A record continued during this fight has no ambush wolf (the opening stages it only for a new game,
  // and the roaming packs wait for M00): the story calls one in next to the player, anywhere on the plains (2026-11-27 playtest).
  {id:'fight',text:'늑대를 물리치기',type:'defeat',count:1,map:'great-plains',at:{x:OPENING_STAGE.x,z:OPENING_STAGE.z,radius:120},summon:{kind:'gray-wolf',count:1}},
  {id:'wagon',text:'마부를 도와 마차 세우기',type:'talk',targets:['driver'],dialogues:{driver:'driver-wagon'}},
  {id:'driver',text:'마부와 이야기하기',type:'talk',targets:['driver'],turnIn:true,dialogues:{driver:'driver-thanks'}},
  {id:'road',text:'길을 따라 몬트하임 마을로 가기',type:'reach',map:'village',reading:'village-return'},
 ]},
 {id:'M01',reward:{potions:1},title:'달빛 여관',steps:[
  {id:'inn',text:'여관 주인과 이야기하기',type:'talk',targets:['innkeeper'],dialogues:{innkeeper:'inn-arrive'}},
 ]},
 {id:'M10',reward:{gold:10},title:'양아버지의 집',steps:[
  {id:'father',text:'양아버지 찾아뵙기',type:'talk',targets:['foster-father'],dialogues:{'foster-father':'instructor-call'}},
 ]},
 {id:'M03',reward:{gold:60,potions:1},title:'마을의 부탁',steps:[
  {id:'ask',text:'촌장 찾아가기',type:'talk',targets:['chief'],dialogues:{chief:'chief-request'}},
  {id:'hunt',text:'윈드몬 대평원의 짐승 쫓아내기',type:'defeat',map:'great-plains',count:3},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-report'}},
 ]},
 {id:'M04',reward:{gold:120,armor:'leather'},title:'대평원의 곰',steps:[
  {id:'father',text:'양아버지에게 그날 일 여쭙기',type:'talk',targets:['foster-father'],dialogues:{'foster-father':'instructor-joachim'}},
  {id:'ask',text:'정찰병 제프리 찾아가기',type:'talk',targets:['youth'],dialogues:{youth:'jeffrey-bear'}},
  {id:'bear',text:'평원 언덕의 곰 쓰러뜨리기',type:'defeat',kind:'bear',count:1,map:'great-plains',at:{x:-25,z:-16,radius:15},tune:{hp:650,damage:.7},arrival:'대평원의 곰이 모습을 드러냈다'},
  {id:'report',text:'제프리에게 알리기',type:'talk',targets:['youth'],turnIn:true,dialogues:{youth:'jeffrey-truth'}},
 ]},
 {id:'M11',reward:{gold:40},title:'마비된 듯한 움직임',steps:[
  {id:'herbalist',text:'약초사에게 묻기',type:'talk',targets:['herbalist'],dialogues:{herbalist:'herbalist-poison'}},
  {id:'chief',text:'촌장에게 할리안의 일 묻기',type:'talk',targets:['chief'],turnIn:true,dialogues:{chief:'chief-halian'}},
 ]},
 {id:'M07',reward:{gold:200,potions:1},title:'마물의 숲',steps:[
  {id:'forest',text:'평원 동쪽 끝에서 마물의 숲으로 들어가기',type:'reach',map:'monster-forest'},
  {id:'goblins',text:'숲의 두 야영지에서 고블린 물리치기',type:'defeat',kind:'goblin',count:5,map:'monster-forest',at:{x:0,z:1,radius:10},intro:'forest-camp',arrival:'고블린 야영지다!'},
  {id:'clues',text:'야영지 주변 살펴보기',type:'talk',targets:['clue-poison','clue-sword','clue-armor'],dialogues:{'clue-poison':'clue-poison','clue-sword':'clue-sword','clue-armor':'clue-armor'}},
  {id:'hobgoblin',text:'숲 안쪽의 홉고블린 쓰러뜨리기',type:'defeat',kind:'hobgoblin-boss',count:1,map:'monster-forest',at:{x:26,z:-32,radius:12},early:true,intro:'hobgoblin-start',arrival:'홉고블린이 앞을 막아선다'},
  {id:'trace',text:'동굴 쪽으로 이어진 흔적 살피기',type:'talk',targets:['clue-cave'],dialogues:{'clue-cave':'clue-cave'}},
  {id:'report',text:'마을로 돌아가 제프리에게 묻기',type:'talk',targets:['youth'],turnIn:true,dialogues:{youth:'jeffrey-witch'}},
 ]},
 {id:'M12',reward:{gold:50},title:'마녀의 동굴 조사',steps:[
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
 {id:'S01',giver:'youth',after:'M04',reward:{gold:25},title:'울타리 밖 발자국',offer:'youth-errand',wait:'youth-errand-wait',done:'youth-errand-done',steps:[
  {id:'hunt',text:'대평원에서 짐승 두 마리 쫓아내기',type:'defeat',map:'great-plains',count:2},
  {id:'report',text:'제프리에게 알리기',type:'talk',targets:['youth'],turnIn:true},
 ]},
 {id:'S02',giver:'herbalist',after:'M10',reward:{gold:10,potions:1},title:'물약 한 병',offer:'herbalist-errand',wait:'herbalist-errand-wait',done:'herbalist-errand-done',steps:[
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
 {id:'S05',giver:'chief',after:'M11',reward:{gold:60},title:'숲 어귀의 궁수',offer:'chief-errand',wait:'chief-errand-wait',done:'chief-errand-done',steps:[
  {id:'archers',text:'마물의 숲에서 고블린 궁수 둘 쓰러뜨리기',type:'defeat',kind:'goblin-archer',map:'monster-forest',count:2},
  {id:'report',text:'촌장에게 알리기',type:'talk',targets:['chief'],turnIn:true},
 ]},
 {id:'S06',giver:'smith',after:'M07',reward:{gold:50},title:'구울의 사슬',offer:'smith-chain',wait:'smith-chain-wait',done:'smith-chain-done',steps:[
  {id:'link',text:'구울 사슬 고리 하나를 대장장이에게 가져가기',type:'deliver',item:'ghoul-mail',count:1,targets:['smith']},
 ]},
 // The alpha wolf: main quest M06 until 2026-11-27, now the driver's errand once his wagon is
 // mended (after the bear). Same id and gold ledger entry, so an old save is never paid twice.
 {id:'M06',giver:'driver',after:'M04',goldSource:'v03-quest-M06',reward:{gold:250},title:'우두머리 늑대',offer:'driver-alpha',wait:'driver-alpha-wait',done:'driver-alpha-done',steps:[
  {id:'alpha',text:'초원 한가운데의 우두머리 늑대 쓰러뜨리기',type:'defeat',kind:'wolf',count:1,map:'great-plains',at:{x:29,z:37,radius:28}},
  {id:'report',text:'마부에게 알리기',type:'talk',targets:['driver'],turnIn:true},
 ]},
 // Jeffrey's defense errand (2026-11-27, user): ten stronger stages at the palisade, each started by
 // talking to him; a lost stage goes back to before that talk (defense-waves.js). kinds: the foe of each
 // column; elite scale on top of the stage's hp/damage (WAVE_ELITE). Stage 10 pays the errand's reward
 // (500 gold) when it is reported to him.
 {id:'W01',giver:'youth',after:'M04',reward:{gold:500},title:'마물들이 몰려오고 있어요',offer:'jeffrey-waves-offer',wait:'jeffrey-waves-hold',done:'jeffrey-waves-done',steps:[
  {id:'waves',text:'목책에서 몰려오는 마물 막아내기',type:'waves',map:'village',targets:['youth'],at:{x:0,z:28,radius:11},from:{x:-1.2,z:58},maxAlive:6,
   kinds:{goblin:'goblin-warrior',archer:'goblin-archer',elite:'hobgoblin-boss'},lines:{retry:'jeffrey-waves-retry'},stages:[
   {goblin:3,archer:0,elite:0,hp:1,damage:1,gold:60,line:'jeffrey-waves-early'},
   {goblin:4,archer:0,elite:0,hp:1,damage:1,gold:80,line:'jeffrey-waves-early'},
   {goblin:4,archer:1,elite:0,hp:1.1,damage:1,gold:100,potions:1,line:'jeffrey-waves-early'},
   {goblin:5,archer:2,elite:0,hp:1.15,damage:1.05,gold:120,line:'jeffrey-waves-early'},
   {goblin:4,archer:2,elite:1,hp:1.2,damage:1.1,gold:140,line:'jeffrey-waves-mid'},
   {goblin:6,archer:2,elite:0,hp:1.3,damage:1.15,gold:160,potions:1,line:'jeffrey-waves-mid'},
   {goblin:6,archer:3,elite:0,hp:1.35,damage:1.2,gold:180,line:'jeffrey-waves-mid'},
   {goblin:7,archer:3,elite:1,hp:1.45,damage:1.25,gold:200,line:'jeffrey-waves-late'},
   {goblin:8,archer:4,elite:0,hp:1.5,damage:1.3,gold:220,potions:1,line:'jeffrey-waves-late'},
   {goblin:8,archer:4,elite:2,hp:1.6,damage:1.35,gold:0,line:'jeffrey-waves-last'},
  ]},
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
 {id:'potion',when:'low-hp',title:'물약',target:'#potion-button',keys:'숫자 1~4로 해당 슬롯의 물약을 사용합니다.',touch:'짧게 눌러 쓰고, 길게 눌러 종류를 고릅니다.',text:'가방에서 물약을 슬롯에 등록할 수 있습니다.'},
 {id:'boss',when:'step:M04/bear',title:'큰 짐승',keys:'Space로 피하고 F를 길게 눌러 막으세요.',touch:'장화로 피하고 방패를 길게 눌러 막으세요.',text:'젖히면 강공격, 끝나면 반격하세요.'},
 {id:'talk',when:'near-npc',title:'대화',keys:'가까이에서 E 키로 말을 겁니다.',touch:'가까이 가면 뜨는 버튼으로 말을 겁니다.',text:'전투 중에는 대화할 수 없습니다.'},
 {id:'sprint',when:'step:M00/road',title:'질주',keys:'Space를 길게 누르면 달립니다.',touch:'회피 버튼을 길게 누르면 달립니다.',text:'스태미나를 씁니다. 목표·지도를 따라가세요.'},
 {id:'stamina',when:'low-stamina',title:'스태미나',keys:'노란 막대가 스태미나입니다.',touch:'노란 막대가 스태미나입니다.',text:'공격·회피·방패·질주에 쓰고, 멈추면 찹니다.'},
 {id:'rest',when:'effect:rest',title:'휴식과 기록',keys:'여관 주인에게 말을 걸면 쉴 수 있습니다.',touch:'여관 주인에게 말을 걸면 쉴 수 있습니다.',text:'체력·회복약이 차고 여정이 기록됩니다.'},
 {id:'clues',when:'step:M07/clues',title:'살펴보기',keys:'수상한 물건 가까이에서 E 키로 살펴봅니다.',touch:'가까이 가면 뜨는 버튼으로 살펴봅니다.',text:'찾은 것은 목표에 표시됩니다.'},
]);
