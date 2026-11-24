import {JOURNAL_QUEST_IDS} from '../chapter-progress.js';

// Playable selections from Elena's recovered journal, in the order its pages are read.
// The warrior retraces the places; Elena narrates the pages in first person.
const langIndex={ko:0,en:1,ja:2,zh:3,vi:4};
const titles=[
 ['불이 켜진 창','A Light in the Window','灯りのともる窓','亮着灯的窗','Ô cửa sáng đèn'],
 ['성소에 남은 목소리','A Voice in the Sanctuary','聖所に残る声','圣所里的余音','Tiếng vọng nơi thánh điện'],
];
const lines={
 heal:[
  ['치료를 마치고 보니 벌써 아침이었다. 문밖에는 아직 눈을 뜨지 못한 아이의 어머니가 앉아 있었다.','When I finished dressing the wound, it was morning. Outside sat the mother of a child who had yet to wake.','手当てが済む頃には朝だった。扉の外では、まだ目を覚まさない子の母親が待っていた。','包扎完伤口，天已经亮了。门外坐着一位母亲，她的孩子还没有醒。','Khi tôi băng xong vết thương thì trời đã sáng. Ngoài cửa, người mẹ vẫn chờ con mình tỉnh lại.'],
  ['물을 데워 온 전사는 자기 몫의 의자를 그분께 내주었다. 그날 처음 그의 이름을 물었다. 요아힘.','The warrior who brought hot water gave her his chair. That was the day I asked his name. Joachim.','湯を運んできた戦士が、自分の椅子をその人に譲った。その日初めて彼の名前を聞いた。ヨアヒム。','送来热水的战士把椅子让给了她。那天我第一次问他的名字。约阿希姆。','Người chiến binh mang nước ấm đến rồi nhường ghế cho bà. Hôm ấy tôi mới hỏi tên anh. Joachim.'],
 ],
 loss:[
  ['습격이 끝나 가는데 요아힘이 갑자기 무릎을 꿇었다. 나는 목책 뒤에서 날아온 가느다란 침을 보았다.','The raid was nearly over when Joachim fell to his knees. I saw the thin dart fly from behind the palisade.','襲撃が収まる寸前、ヨアヒムが膝をついた。柵の後ろから飛んだ細い針を、私は見ていた。','袭击快要结束时，约阿希姆突然跪倒。我看见一枚细针从木栅后飞来。','Khi trận tập kích sắp kết thúc, Joachim chợt quỵ xuống. Tôi đã thấy chiếc kim mảnh bay ra từ sau hàng rào.'],
  ['기도를 끝내도 그의 손은 차가웠다. 이 글을 교회에 보낼 수 있을까. 누군가 문밖에 있다.','When my prayer ended, his hand was still cold. Can I get this letter to the church? Someone is outside.','祈り終えても、その手は冷たかった。この手紙を教会に届けられるだろうか。扉の外に誰かいる。','祷告结束，他的手依然冰冷。这封信能送到教会吗？门外有人。','Lời nguyện dứt, bàn tay anh vẫn lạnh. Liệu tôi có gửi được lá thư này đến giáo hội? Có người ngoài cửa.'],
 ],
 keep:[
  ['약병 밑의 흙이 검게 죽었다. 하류에도 사람이 산다는 걸 안다. 오늘은 물길을 막았다.','The earth beneath the vials has turned black. I know people live downstream. Today I blocked the channel.','薬瓶の下で土が黒く死んだ。下流にも人が暮らしている。今日は水路をせき止めた。','药瓶下的泥土已经发黑。我知道下游有人居住。今天我堵住了水渠。','Đất dưới những lọ thuốc đã hóa đen. Tôi biết dưới hạ lưu vẫn có người sống. Hôm nay tôi chặn dòng nước.'],
  ['움직이는 것만으로는 돌아왔다고 할 수 없다. 안쪽 방의 요아힘에게는 이 약을 쓰지 않겠다. 그런데도 나는 내일 약을 다시 끓일 것이다.','Movement alone is not a return. I will not give this to Joachim in the inner room. Even so, tomorrow I will brew it again.','動くことは、戻ってきたことではない。奥の部屋のヨアヒムにはこの薬を使わない。それでも明日、また薬を煮る。','能动并不等于归来。我不会给内室的约阿希姆用这种药。可明天，我仍会再熬一锅。','Cử động chưa có nghĩa là đã trở về. Tôi sẽ không cho Joachim ở phòng trong dùng thuốc này. Thế mà ngày mai tôi vẫn sẽ sắc thuốc tiếp.'],
 ],
 close:[
  ['마지막 장에는 날짜가 없다. “이 방에 들어온다면, 내게 남은 전부를 걸고 막겠다.”','There is no date on the last page. “If they enter this room, I will stop them with all I have left.”','最後のページに日付はない。「この部屋に入るなら、残ったすべてを懸けて止める」','末页没有日期。“谁要是踏进这个房间，我就用最后的一切挡住他。”','Trang cuối không ghi ngày. “Nếu họ bước vào căn phòng này, ta sẽ dùng tất cả những gì còn lại mà ngăn họ.”'],
  ['전사는 일지를 덮는다. 이제 그날 성소에서 마주한 마녀의 마지막 말이 다르게 들린다.','The warrior closes the journal. Now she hears the witch’s last words in the sanctuary differently.','戦士は日誌を閉じる。あの日、聖所で聞いた魔女の最後の言葉が今は違って聞こえる。','战士合上日记。如今再想起那天在圣所听到的最后一句话，已是另一番滋味。','Nữ chiến binh gấp nhật ký lại. Giờ cô mới hiểu khác đi lời cuối của phù thủy hôm ấy trong thánh điện.'],
 ],
};
const objectives=[
 ['여관에서 일지의 첫 장 읽기','Read the first page at the inn','宿で日誌の最初の頁を読む','到旅店读日记的第一页','Đọc trang đầu tại quán trọ'],
 ['목책을 지키던 청년에게 다음 장 건네받기','Collect the next page from the young guard','柵を守る若者から次の頁を受け取る','向守木栅的青年领取下一页','Nhận trang tiếp theo từ chàng trai gác rào'],
 ['동굴로 돌아가 실험 기록 찾기','Return to the cave for the laboratory notes','洞窟へ戻り実験記録を探す','回到洞穴寻找实验记录','Trở lại hang tìm ghi chép thí nghiệm'],
 ['성소에서 비탄의 마녀와의 전투 되짚기','Relive the encounter with the Mourning Witch','聖所で悲嘆の魔女との戦いを追体験する','在圣所重温与悲恸魔女的战斗','Sống lại trận chiến với Phù thủy Bi ai'],
 ['여관에서 일지의 마지막 장 덮기','Close the last page at the inn','宿で日誌の最後の頁を閉じる','到旅店合上日记的末页','Khép trang cuối tại quán trọ'],
];
const caption=['엘레나의 일지','Elena’s Journal','エレナの日誌','艾莲娜的日记','Nhật ký của Elena'];
const end=['2장 끝 · 엘레나의 일지','Chapter 2 complete · Elena’s Journal','第2章 完 · エレナの日誌','第二章 完 · 艾莲娜的日记','Hết chương 2 · Nhật ký của Elena'];
const pictures={heal:new URL('../prologue/01.webp',import.meta.url).href,loss:new URL('../prologue/03.webp',import.meta.url).href,keep:new URL('../prologue/04.webp',import.meta.url).href};
export function elenaJournal(lang){
 const i=langIndex[lang]??1;
 const speak=(key)=>lines[key].map((words,j)=>({who:key==='close'&&j===1?'':caption[i],text:words[i],illustration:pictures[key]}));
 const talk=(id,target,key,n)=>({id,type:'talk',targets:[target],dialogues:{[target]:key},text:objectives[n][i]});
 return {PROPS:[],COMBAT_HINTS:[],TIPS:[],QUESTS:[
  {id:JOURNAL_QUEST_IDS[0],title:titles[0][i],steps:[talk('inn','innkeeper','journal-heal',0),talk('palisade','youth','journal-loss',1)]},
  {id:JOURNAL_QUEST_IDS[1],title:titles[1][i],steps:[{id:'cave',type:'reach',map:'witch-cave',reading:'journal-lab',text:objectives[2][i]},
   {id:'sanctuary',type:'defeat',map:'witch-cave',kind:'elena',phase:2,count:1,at:{x:39,z:-19,radius:18},text:objectives[3][i]},
   {...talk('last-page','innkeeper','journal-end',4),turnIn:true}]},
 ],DIALOGUES:{'journal-heal':speak('heal'),'journal-loss':speak('loss'),'journal-lab':speak('keep'),'journal-end':speak('close')},CHAPTER_END_NOTE:end[i]};
}
