import {ITEM_DROP_MODELS} from './item-drop-data.js';
import {LOOT_RARITIES,chestRewards} from './loot-rarity.js';

// Existing ChapterJourney inventory items only; no invented equipment or stats.
export const CHEST_REWARD_CHOICES=Object.freeze(Object.entries({
 apple:'붉은 사과',pie:'따뜻한 애플파이',feed:'반려동물 먹이',herb:'달이슬풀',
 cargo:'상품 꾸러미',locket:'초상화 펜던트','goblin-iron':'고블린 철붙이',
 potion:'회복약',bandage:'치료 붕대',antidote:'해독제',gold:'골드',
 'key-2':'II등급 열쇠','key-3':'III등급 열쇠','equipment-voucher':'정제 장비 교환권',
 'armor-voucher':'방어구 보강권','antidote-charm':'해독 부적','church-seal':'교회 인장',
 ...Object.fromEntries(LOOT_RARITIES.map(grade=>[grade.item,grade.itemName])),
}).map(([id,name])=>Object.freeze({id,name})));
const ids=new Set(CHEST_REWARD_CHOICES.map(item=>item.id));
export const CHEST_ITEM_LIMIT=16;
export const CHEST_ITEM_COUNT_LIMIT=9999;

export function normalizeChestItems(value){
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>CHEST_ITEM_LIMIT)throw Error('상자 아이템은 최대 16종까지 설정할 수 있습니다.');
 const seen=new Set();
 return value.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['id','count'].includes(key))||!ids.has(item.id)||seen.has(item.id))throw Error('등록된 아이템을 중복 없이 선택해 주세요.');
  if(!Number.isSafeInteger(item.count)||item.count<1||item.count>CHEST_ITEM_COUNT_LIMIT)throw Error('아이템 수량은 1~9,999개로 설정해 주세요.');
  seen.add(item.id);return {id:item.id,count:item.count};
 });
}

export function resolveChestRewards(point){
 const rewards=chestRewards(point?.tier);if(!rewards)return null;
 if(point.chestItems!==undefined)return Object.fromEntries(normalizeChestItems(point.chestItems).map(item=>[item.id,item.count]));
 if(point.rewardItem&&Object.hasOwn(ITEM_DROP_MODELS,point.rewardItem)){for(const item of Object.keys(rewards))if(item!=='gold')delete rewards[item];rewards[point.rewardItem]=1;}
 if(point.id==='lookout-chest')rewards['equipment-voucher']=1;
 if(['goblin-relic','village-relief'].includes(point.id))rewards['key-3']=1;
 const bonus=Object.entries(ITEM_DROP_MODELS).find(([,asset])=>asset===point.dropAssetId)?.[0];if(bonus)rewards[bonus]=(rewards[bonus]??0)+1;
 return rewards;
}

export function chestRewardDrops(point){
 const rewards=resolveChestRewards(point);if(!rewards)return null;
 if(!Object.keys(rewards).length)return [];
 // Keep legacy bundles exactly as they were. Explicit lists display one model
 // per item kind, not one mesh per quantity, with non-model rewards attached.
 if(point.chestItems===undefined){const item=Object.keys(rewards).find(id=>ITEM_DROP_MODELS[id]);return [{model:point.dropAssetId||ITEM_DROP_MODELS[item]||'clue-satchel',rewards}];}
 const parts=[],attached={};
 for(const [id,count] of Object.entries(rewards)){
  if(ITEM_DROP_MODELS[id])parts.push({model:ITEM_DROP_MODELS[id],rewards:{[id]:count}});
  else attached[id]=count;
 }
 if(!parts.length)parts.push({model:'clue-satchel',rewards:{}});
 Object.assign(parts[0].rewards,attached);return parts;
}
