import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {StaminaNoticeAnchor} from '../src/stamina-notice-anchor.js';

test('stamina warning stays centered without projecting or following the moving player',()=>{
 const {document}=parseHTML('<div id="toast" class="stamina-notice" hidden></div>'),element=document.getElementById('toast'),anchor=new StaminaNoticeAnchor(element);
 const projection={project(){throw Error('must not project');}},actor={position:{x:0,y:0,z:0}};
 anchor.show();assert.equal(element.hidden,false);for(let n=0;n<100;n++){actor.position.x=n;assert.equal(anchor.update(projection,actor),true);}
 assert.equal(element.style.getPropertyValue('--stamina-notice-x'),'');assert.equal(element.style.getPropertyValue('--stamina-notice-y'),'');
 const css=readFileSync(new URL('../src/mobile-ui.css',import.meta.url),'utf8');assert.match(css,/#app>#toast\.stamina-notice\{top:50%;bottom:auto;left:50%;/);assert.match(css,/transform:translate\(-50%,-50%\)/);
 anchor.reset();assert.equal(element.hidden,true);anchor.show();anchor.dispose();assert.equal(element.hidden,true);assert.equal(anchor.show(),false);
});
test('replacing the warning with a normal toast does not hide it',()=>{
 const {document}=parseHTML('<div class="stamina-notice"></div>'),element=document.querySelector('div'),anchor=new StaminaNoticeAnchor(element);anchor.show();element.classList.remove('stamina-notice');element.textContent='다른 메시지';assert.equal(anchor.update(),false);assert.equal(element.hidden,false);assert.equal(element.textContent,'다른 메시지');
});
