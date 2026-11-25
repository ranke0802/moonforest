import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {GoldLoot} from '../src/gold-loot.js';
import {createCharacterMenu} from '../src/v03/character-menu.js';
import {t,useLanguage} from '../src/v03/i18n.js';
import {createTownEconomy} from '../src/v03/town-economy.js';

function openSkills(gold) {
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const wallet=new GoldLoot({storage});
  wallet.creditCumulative('fixture',gold);
  const economy=createTownEconomy(wallet);
  const {document,window}=parseHTML('<html lang="ko"><body><main></main></body></html>');
  const root=document.querySelector('main');
  window.ResizeObserver=class{observe(){} disconnect(){}};
  const menu=createCharacterMenu({root,subject:()=>null,onPause(){},
    read:()=>({gold:wallet.balance,progression:economy.progression,touch:true,allows:()=>false}),
    learnSkill:id=>economy.learnSkill(id),refundSkills:()=>economy.refundSkills()});
  const dialog=root.querySelector('dialog');
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  menu.show('Skills');
  return {root,economy,wallet,storage,menu};
}

test('the skill page invests a starting SP independently of story controls, then refunds and reallocates it once',()=>{
  const {root,economy,wallet,storage,menu}=openSkills(250);
  const node=id=>[...root.querySelectorAll('.mf-skill-node')].find(n=>n.querySelector('b')?.textContent===t('char.skill.'+id));
  const action=()=>root.querySelector('.mf-skill-invest'),reset=()=>root.querySelector('.mf-skill-training button');
  try{
    assert.ok(node('combo').classList.contains('is-locked'));
    assert.equal(root.querySelector('.mf-skill-detail h2').textContent,t('char.skill.weaponCare'));
    assert.equal(root.querySelector('.mf-skill-training output').textContent,t('char.skill.points',{n:1}));
    assert.equal(reset().disabled,true);
    const old=action();old.click();old.click();
    assert.equal(economy.progression.skills.weaponCare,1);assert.equal(wallet.balance,250);
    assert.equal(action().disabled,true);
    reset().click();root.querySelector('.mf-skill-training button:last-child').click();
    assert.equal(wallet.balance,250);assert.equal(economy.progression.spent,1);
    reset().click();const confirm=root.querySelector('.mf-skill-training button');
    confirm.click();confirm.click();
    assert.equal(wallet.balance,150);assert.equal(economy.progression.points,1);
    assert.equal(economy.progression.skills.weaponCare,0);assert.equal(reset().disabled,true);
    node('guardTraining').click();action().click();
    assert.equal(economy.progression.skills.guardTraining,1);
    const reload=createTownEconomy(new GoldLoot({storage}));
    assert.equal(reload.progression.skills.guardTraining,1);assert.equal(reload.gold,150);
    assert.ok(node('guard').classList.contains('is-locked'));
  }finally{menu.dispose();}
});

test('a refund cannot be accepted below its displayed price, and passive copy follows the selected locale',async()=>{
  const {root,economy,wallet,menu}=openSkills(99);
  try{
    root.querySelector('.mf-skill-invest').click();
    const reset=root.querySelector('.mf-skill-training button');
    assert.equal(reset.disabled,true);reset.click();
    assert.equal(root.querySelectorAll('.mf-skill-training button').length,1);
    assert.equal(wallet.balance,99);assert.equal(economy.progression.spent,1);
    for(const lang of ['en','ja','vi','zh','ko']){
      await useLanguage(lang);
      menu.show('Skills');
      assert.equal(root.querySelector('.mf-skill-detail h2').textContent,t('char.skill.weaponCare'));
      assert.ok(!root.textContent.includes('char.skill'));
      assert.ok(root.querySelector('.mf-skill-training button').textContent.includes('100'));
    }
  }finally{await useLanguage('ko');menu.dispose();}
});
