export const UI_TEST_SAVE='journey-v1';
export const UI_TEST_QUESTS={
 main:{name:'사람들이 기억하는 성녀',type:'주요 의뢰',story:'엘레나가 머물렀던 마을. 주민들은 그녀의 친절을 기억하지만, 떠나던 날에 대해서는 말을 아낀다.',reward:'경험치 100 · 교회 문장 붕대'},
 apple:{name:'문 앞에 놓인 애플파이',type:'주민의 부탁',story:'과수원을 돌보는 루미가 따뜻한 파이를 구우려 한다. 사과 네 개를 모아 건네주자.',reward:'애플파이 × 2 · 동물 먹이 × 2 · 경험치 70'},
 smith:{name:'빼앗긴 쇠를 다시 벼리다',type:'주민의 부탁',story:'대장장이에게 흩어진 쇳조각 세 개를 가져다주자. 이번 UI 검수에서는 재료를 바로 준비할 수 있다.',reward:'경험치 80 · 수리 기록'},
};
const initial=()=>({version:1,accepted:false,apple:0,appleDone:false,clue:false,smithDone:false,iron:0,pie:2,feed:0,xp:0,tracked:'main',quick:false,largeText:false});
const count=(n,max)=>Number.isSafeInteger(n)&&n>=0?Math.min(n,max):0;
export class UiTestJourney {
 constructor(storage){this.storage=storage;this.value=initial();try{const v=JSON.parse(storage?.getItem(UI_TEST_SAVE)??'null');if(v?.version===1){for(const k of ['accepted','appleDone','clue','smithDone','quick','largeText'])this.value[k]=v[k]===true;for(const [k,max] of [['apple',4],['iron',3],['pie',20],['feed',2],['xp',250]])this.value[k]=count(v[k],max);if(Object.hasOwn(UI_TEST_QUESTS,v.tracked))this.value.tracked=v.tracked;}}catch{} }
 save(){try{this.storage?.setItem(UI_TEST_SAVE,JSON.stringify(this.value));}catch{} }
 reset(){this.value=initial();this.save();}
 accept(){if(this.value.appleDone)return false;this.value.accepted=true;this.value.tracked='apple';this.save();return true;}
 collect(){const v=this.value;if(!v.accepted||v.appleDone||v.apple>=4)return false;v.apple++;this.save();return true;}
 turnIn(){const v=this.value;if(!v.accepted||v.appleDone||v.apple!==4)return false;v.apple=0;v.appleDone=true;v.pie+=2;v.feed=2;v.xp+=70;this.save();return true;}
 learn(){if(this.value.clue)return false;this.value.clue=true;this.value.xp+=100;this.save();return true;}
 prepareIron(){if(this.value.smithDone)return false;this.value.iron=3;this.value.tracked='smith';this.save();return true;}
 turnInIron(){const v=this.value;if(v.smithDone||v.iron!==3)return false;v.smithDone=true;v.iron=0;v.xp+=80;this.save();return true;}
 track(key){if(!Object.hasOwn(UI_TEST_QUESTS,key))return;this.value.tracked=key;this.save();}
 usePie(heal){if(this.value.pie<1)return 0;const gained=heal(120);if(!Number.isFinite(gained)||gained<=0)return 0;this.value.pie--;this.save();return gained;}
 objective(key=this.value.tracked){const v=this.value;return key==='apple'?(v.appleDone?'루미의 부탁 완료':!v.accepted?'농부 루미에게 부탁 받기':v.apple===4?'루미에게 사과 건네기':`사과 모으기 · ${v.apple} / 4`):key==='smith'?(v.smithDone?'대장장이의 부탁 완료':v.iron===3?'대장장이에게 쇳조각 건네기':`쇳조각 모으기 · ${v.iron} / 3`):v.clue?'교회 문장 붕대 기록 확인':'농부에게 성녀의 마지막 행방 묻기';}
}
