// Korean: the source language. Every ui key must exist here; other locales
// fall back to it key by key. Story text in Korean lives in data/chapter*.js.
import {particle} from '../korean.js';
export default {
 ui:{
  'title.aria':'MoonForest 시작 화면','title.kicker':'비탄의 마녀','title.sub':'인연의 식탁 · 제1막','title.menu':'시작 메뉴','title.drawing':'세계를 그리는 중',
  'menu.new':'새로하기','menu.load':'불러오기','menu.gallery':'갤러리','menu.settings':'설정','menu.quit':'끝내기',
  'time.hm':'{h}시간 {m}분','time.m':'{m}분',
  'slot.empty':'빈 기록','slot.emptyDetail':'새로운 여정을 시작합니다','slot.title':'{chapter}장 · {title}','slot.journey':'여정',
  'panel.newNote':'기록할 자리를 고르세요.','panel.loadNote':'이어서 할 기록을 고르세요.','panel.back':'돌아가기',
  'confirm.ok':'확인','confirm.cancel':'취소',
  'confirm.overwriteTitle':'기록 덮어쓰기','confirm.overwrite':'{slot}번 기록을 지우고 새로 시작합니다. 되돌릴 수 없습니다.','confirm.overwriteAccept':'새로 시작',
  'confirm.quitTitle':'끝내기','confirm.quit':'게임을 종료할까요?','confirm.quitAccept':'끝내기',
  'gallery.title':'갤러리','gallery.note':'여정에서 본 장면과 만난 존재가 이곳에 기록됩니다.','gallery.scenes':'장면','gallery.bestiary':'도감','gallery.titles':'칭호',
  'settings.title':'설정','settings.language':'언어','settings.game':'게임 설정','settings.languageNote':'언어를 바꾸면 화면을 다시 불러옵니다.',
  'toast.failed':'진행하지 못했습니다. 다시 시도해 주세요.','toast.noStorage':'저장소를 사용할 수 없어 기록을 열 수 없습니다.','toast.wipeFailed':'기록을 지우지 못했습니다.','toast.preparing':'세계를 준비하고 있습니다. 잠시만 기다려 주세요.',
  'meta.dream':'꿈',
  'place.warrior-v3':'숲의 경계 마을','place.warrior-plains':'대평원','place.warrior-v4':'마물의 숲','place.warrior-v5':'마녀의 동굴',
  'dialogue.next':'다음','dialogue.close':'닫기',
  'opening.skip':'건너뛰기',
  'opening.0':'상처 입은 손을 내미는 청년.\n내 손끝에서 번진 빛이 상처를 덮는다.',
  'opening.1':'나란히 걷던 마을 길.\n무슨 말을 했는지는 기억나지 않는다. 온기만 남았다.',
  'opening.2':'마물의 울음. 멀리서 그가 쓰러진다.\n손을 뻗지만, 닿지 않는다.',
  'opening.3':'어두운 곳에서 올리는 기도.\n응답은 없다.',
  'opening.4':'“그 아이를 찾아라.”',
  'scene.protect':'마부를 지켜라',
  'hud.main':'메인','hud.chapterNext':'이야기의 다음 장','hud.complete':'완료 · {done}','hud.completeNext':'완료 · {done}  →  {next}','hud.rested':'쉬었습니다 · 여정을 기록했습니다',
  'prompt.talkQuest':({name})=>particle(name,'과','와')+' 이야기하기',
  'prompt.talkIdle':({name})=>name+'에게 말 걸기',
 },
};
