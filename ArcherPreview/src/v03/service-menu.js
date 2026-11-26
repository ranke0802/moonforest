// What the smith and the herbalist offer when spoken to (2026-11-26, user): talk first,
// then their services, and always last, ending the talk. The ids are the views
// town-services.openShop() takes ('shop', 'forge'); 'talk' and 'leave' belong to the story.
import {t} from './i18n.js';
export const SERVICE_MENUS=Object.freeze({smith:Object.freeze(['shop','forge']),herbalist:Object.freeze(['shop'])});
// pending: a quest or errand line is waiting with this person (the talk entry is marked).
export function serviceMenu(npc,pending=false){
 const services=SERVICE_MENUS[npc];
 if(!services)return null;
 return [{id:'talk',label:t('talk.menu.talk'),mark:!!pending},...services.map(id=>({id,label:t('talk.menu.'+id)})),{id:'leave',label:t('talk.menu.leave')}];
}
