import {CHAPTERS} from './chapter-progress.js';
import {language,t} from './i18n.js';

const WORDS={
 ko:{menu:'장 선택',resume:'이어하기',newSlot:'새 모험',complete:'완료 · 자유 탐험',locked:'이전 장 클리어 후',later:'준비 중',reset:'이 슬롯에서 처음부터',again:'다시 플레이',chapters:['전사 편','엘레나 편','마왕성','비비앙 편','되감긴 선택','인연의 식탁','에필로그']},
 en:{menu:'Chapters',resume:'Continue',newSlot:'Begin',complete:'Cleared · Explore',locked:'Clear the previous chapter',later:'Coming later',reset:'Start over in this slot',again:'Replay',chapters:['The Warrior','Elena','The Demon King’s Castle','Vivian','A Choice Rewound','The Table of Bonds','Epilogue']},
 ja:{menu:'章を選ぶ',resume:'続きから',newSlot:'はじめる',complete:'クリア済み・自由探索',locked:'前章クリアで解放',later:'準備中',reset:'このスロットで最初から',again:'再プレイ',chapters:['戦士編','エレナ編','魔王城','ヴィヴィアン編','巻き戻された選択','絆の食卓','エピローグ']},
 zh:{menu:'章节选择',resume:'继续',newSlot:'开始冒险',complete:'已通关 · 自由探索',locked:'通关上一章后解锁',later:'尚未开放',reset:'在此存档重新开始',again:'重玩',chapters:['战士篇','艾莲娜篇','魔王城','薇薇安篇','回溯的抉择','羁绊的餐桌','尾声']},
 vi:{menu:'Chọn chương',resume:'Tiếp tục',newSlot:'Bắt đầu',complete:'Đã xong · Khám phá',locked:'Hoàn thành chương trước',later:'Sắp ra mắt',reset:'Chơi lại từ đầu ở ô này',again:'Chơi lại',chapters:['Nữ chiến binh','Elena','Lâu đài Ma Vương','Vivian','Lựa chọn được tua lại','Bàn tiệc duyên phận','Vĩ thanh']},
};
export const chapterWords=(lang=language())=>WORDS[lang]??WORDS.en;
export function chapterPanel({doc,box,close,progress,used}){
 const words=chapterWords();
 const node=(tag,cls,text)=>{const el=doc.createElement(tag);el.className=cls;el.textContent=text;return el;};
 box.append(node('h2','v03-panel-title',words.menu));
 const list=node('div','v03-slots','');
 for(const chapter of CHAPTERS){
  const id=chapter.id,allowed=progress.available(id);
  const title=words.chapters[id-1],action=node('button','v03-slot','');action.type='button';action.dataset.chapter=String(id);
  const detail=!chapter.entry?words.later:!allowed?words.locked:progress.done.has(id)?words.complete:used&&id===progress.id?words.resume:words.newSlot;
  action.disabled=!allowed;action.append(node('span','v03-slot-number',id===7?'·':String(id)),node('strong','v03-slot-title',title),node('small','v03-slot-detail',detail));
  action.addEventListener('click',()=>close({id}));list.append(action);
  if(progress.done.has(id)&&allowed){
   const replay=node('button','v03-panel-back',words.again+' · '+title);replay.type='button';replay.dataset.replay=String(id);replay.addEventListener('click',()=>close({id,replay:true}));list.append(replay);
  }
 }
 box.append(list);
 if(used){const reset=node('button','v03-panel-back',words.reset);reset.type='button';reset.dataset.resetSlot='1';reset.addEventListener('click',()=>close({reset:true,id:1}));box.append(reset);}
 const back=node('button','v03-panel-back',t('panel.back'));back.type='button';back.addEventListener('click',()=>close(null));box.append(back);
}
