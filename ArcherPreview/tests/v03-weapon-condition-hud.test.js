import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {createCharacterMenu} from '../src/v03/character-menu.js';
import {MAX_TOTAL_XP} from '../src/v03/character-progression.js';
import {t} from '../src/v03/i18n.js';
import {setupTownServices} from '../src/v03/town-services.js';
import {createTownShop} from '../src/v03/town-shop.js';

function fixture(){
 const {document,window}=parseHTML('<html><body><main><section id="player-hud"></section></main></body></html>');
 const root=document.querySelector('main');
 window.ResizeObserver=class{observe(){}disconnect(){}};
 window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
 function enableDialog(dialog){
  dialog.showModal=()=>{dialog.open=true;};
  dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 }
 const wallet={balance:100,town:{bag:{'goblin-cleaver':1},equipped:{sword:'goblin-cleaver'},condition:{'goblin-cleaver':{level:10,hp:1}}},
  tradeTown(delta,next){if(this.balance+delta<0)return false;this.balance+=delta;this.town=structuredClone(next);return true;}};
 const services=setupTownServices({root,world:{mapId:'village',v03:{playing:true}},wallet,legacy:()=>({}),
  player:()=>null,battle:()=>null,controls:()=>null,appearance:()=>null,canInteract:()=>true,onPause(){},notify(){},sound(){}});
 services.apply();
 const read=()=>({gold:wallet.balance,tradeBag:services.bag(),progression:services.economy.progression,
  hp:100,maxHp:100,stamina:100,maxStamina:100,attackBonus:services.economy.attack,defense:services.economy.defense});
 const menu=createCharacterMenu({root,read,subject:()=>null,onPause(){}});
 enableDialog(root.querySelector('.mf-character-menu'));
 return {root,menu,services,enableDialog,destroy(){menu.dispose();services.dispose();}};
}

test('HUD, bag and smith follow the equipped sword through fractional wear, breakage, switching, repair and save reload',async()=>{
 const {root,menu,services,enableDialog,destroy}=fixture();
 const hud=root.querySelector('.mf-weapon-condition'),icon=hud.firstElementChild,valueText=hud.lastElementChild.firstChild;
 assert.equal(icon.dataset.itemIcon,'goblin-cleaver');assert.equal(hud.textContent,'1/32');
 services.apply();
 for(let swing=1;swing<10;swing++)assert.equal(services.weaponHit(swing),false);
 assert.equal(hud.lastElementChild.firstChild,valueText,'unchanged durability does not rewrite the DOM');
 assert.equal(services.weaponHit(10),true);
 assert.equal(hud.firstElementChild,icon,'wear reuses the bag art element');
 assert.equal(hud.textContent,'0/32');assert.ok(hud.hasAttribute('data-broken'));
 assert.ok(hud.getAttribute('aria-label').includes(t('char.gearBroken')));
 services.economy.flush();services.reset(true);assert.ok(hud.hasAttribute('data-broken'));
 assert.ok(services.equip('field-sword'));assert.equal(hud.firstElementChild.dataset.itemIcon,'field-sword');assert.ok(!hud.hasAttribute('data-broken'));
 menu.show('Inventory');
 const broken=root.querySelector('.mf-menu-grid button[data-broken]');assert.ok(broken);broken.click();
 assert.equal(broken.querySelector('[data-item-icon]').dataset.itemIcon,'goblin-cleaver');
 assert.equal(root.querySelector('.mf-menu-break-note').textContent,t('char.repairAtSmith'));menu.close();
 assert.ok(services.equip('goblin-cleaver'));assert.ok(hud.hasAttribute('data-broken'));
 const shop=createTownShop({root,economy:services.economy,onPause(){},onChange:services.apply});
 enableDialog(root.querySelector('.mf-town-shop'));
 const closed=shop.show('smith','forge');
 const repair=t('shop.repair',{cost:services.economy.repairCost('goblin-cleaver')});
 const repairButton=[...root.querySelectorAll('.mf-town-shop button')].find(button=>button.textContent===repair);
 assert.equal(repairButton.disabled,false);repairButton.click();shop.close();await closed;
 assert.equal(hud.textContent,'32/32');assert.ok(!hud.hasAttribute('data-broken'));
 menu.show('Inventory');assert.equal(root.querySelector('.mf-menu-grid button[data-broken], .mf-menu-break-note'),null);
 services.reset(true);assert.equal(hud.textContent,'32/32');shop.dispose();destroy();
 assert.equal(root.querySelector('.mf-weapon-condition'),null);
});

test('status shows real in-level XP up to level 20 and MAX at the cap',()=>{
 const {root,menu,services,destroy}=fixture();
 const row=key=>[...root.querySelectorAll('.mf-menu-stats dt')].find(label=>label.textContent===t(key)).nextElementSibling.textContent;
 services.economy.gainExperience(51);menu.show('Status');
 assert.equal(row('char.progressLevel'),'2');assert.equal(row('char.progressXp'),'11 / 50');
 services.economy.gainExperience(MAX_TOTAL_XP);menu.show('Status');
 assert.equal(row('char.progressLevel'),'20 (MAX)');assert.equal(row('char.progressXp'),'MAX');destroy();
});
