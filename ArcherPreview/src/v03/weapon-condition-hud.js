import {townItemIcon} from './town-item-art.js';
import {itemName} from './town-items.js';
import {language,t} from './i18n.js';

// One indicator inside the health HUD. It updates on equipment/wear/repair
// events so the render loop has no DOM or inventory work to do.
export function createWeaponConditionHud(host){
 const doc=host.ownerDocument,el=doc.createElement('span'),value=doc.createElement('span');
 el.className='mf-weapon-condition';el.setAttribute('role','img');el.hidden=true;
 el.append(value);host.append(el);
 let item=null,hp=null,max=null,lang=null;
 return {
  update(id,condition){
   if(!condition||!id){el.hidden=true;item=null;return;}
   const locale=language();
   if(item===id&&hp===condition.hp&&max===condition.max&&lang===locale)return;
   if(item!==id)el.replaceChildren(townItemIcon(doc,id),value);
   item=id;hp=condition.hp;max=condition.max;lang=locale;
   const broken=hp===0;
   value.textContent=hp+'/'+max;
   el.toggleAttribute('data-broken',broken);
   el.setAttribute('aria-label',[itemName(id),t('char.durability',{hp,max}),...(broken?[t('char.gearBroken')]:[])].join(' · '));
   el.hidden=false;
  },
  dispose(){el.remove();},
 };
}
