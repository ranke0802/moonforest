// What the smith, the herbalist and the innkeeper offer when spoken to (2026-11-26, user): talk first,
// then their services, and always last, ending the talk. The ids are the views
// town-services.openShop() takes ('shop', 'forge'); 'talk' and 'leave' belong to the story.
import {t} from './i18n.js';
export const SERVICE_MENUS=Object.freeze({smith:Object.freeze(['shop','forge']),herbalist:Object.freeze(['shop']),innkeeper:Object.freeze(['rest'])});
// Services the story runs itself (no shop window): the innkeeper's night's rest (2026-11-27,
// user: talking to him used to rest at once; now resting is a choice like the shops).
export const STORY_SERVICES=Object.freeze(['rest']);
// pending: a quest or errand line is waiting with this person (the talk entry is marked).
export function serviceMenu(npc,pending=false){
 const services=SERVICE_MENUS[npc];
 if(!services)return null;
 return [{id:'talk',label:t('talk.menu.talk'),mark:!!pending},...services.map(id=>({id,label:t('talk.menu.'+id)})),{id:'leave',label:t('talk.menu.leave')}];
}
