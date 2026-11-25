import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import postcss from 'postcss';
import {createDialogue} from '../src/v03/dialogue.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const policy = read('../src/v03/game-viewport.js');
function event(target, type, properties = {}) {
  const doc = target.ownerDocument ?? target;
  const e = new doc.defaultView.Event(type, {bubbles:true, cancelable:true});
  Object.assign(e, properties);
  target.dispatchEvent(e);
  return e;
}
function install(doc) {
  assert.ok(doc.querySelector('head script[src="./src/v03/game-viewport.js"]'));
  assert.ok(doc.querySelector('head link[href="./src/v03/game-viewport.css"]'));
  vm.runInNewContext(policy, {document:doc});
}

test('0.3 suppresses native magnification from splash through play, with live clicks and canvas pointer/wheel delivery', () => {
  const {document} = parseHTML(read('../moonforest-0.3.html'));
  install(document);
  const canvas = document.querySelector('#viewport'), attack = document.querySelector('#attack-button');
  const field = document.querySelector('#diagnostic-detail-export');
  for (const target of [document, document.body, canvas, attack, field]) {
    for (const type of ['gesturestart', 'gesturechange']) assert.equal(event(target, type).defaultPrevented, true);
    assert.equal(event(target, 'wheel', {ctrlKey:true}).defaultPrevented, true);
    assert.equal(event(target, 'wheel').defaultPrevented, false);
  }
  let seen = 0;
  canvas.addEventListener('wheel', () => seen++);
  event(canvas, 'wheel', {ctrlKey:true});
  assert.equal(seen, 1);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'click', 'scroll', 'copy']) {
    assert.equal(event(attack, type).defaultPrevented, false, type);
  }
  assert.equal(event(field, 'keydown', {code:'KeyC', metaKey:true}).defaultPrevented, false);
  assert.equal(event(field, 'keydown', {code:'Equal', ctrlKey:true}).defaultPrevented, false);

  const dialogue = createDialogue({doc:document, blip:null, typewriter:{
    start(node, text) { node.textContent = text; }, complete() { return false; }, stop() {},
  }});
  dialogue.play([{text:'first'}, {text:'second'}]);
  const text = document.querySelector('.v03-dialogue-text');
  text.scrollTop = 40;
  assert.equal(event(text, 'touchmove').defaultPrevented, false);
  event(text, 'click');
  assert.equal(text.textContent, 'second');
  assert.equal(text.scrollTop, 0);
  event(document.querySelector('.v03-dialogue-next'), 'click');
  assert.equal(dialogue.open, false);
  dialogue.dispose();
});

test('the mobile shell locks its own viewport for 0.3 only, including the default route', () => {
  for (const [game, locked] of [['', true], ['moonforest-0.3.html', true], ['moonforest-0.4.html', false]]) {
    const {document} = parseHTML(read('../moonforest-shell.html'));
    const location = {search:game ? '?game=' + game : '', origin:'https://moonforest.test'};
    vm.runInNewContext(document.querySelector('#moonforest-shell').textContent, {
      document, location, URLSearchParams, navigator:{}, window:{addEventListener(){}},
    });
    install(document);
    assert.equal(document.documentElement.classList.contains('v03-viewport'), locked);
    assert.equal(document.querySelector('meta[name="viewport"]').content.includes('maximum-scale=1'), locked);
    assert.equal(event(document.body, 'gesturestart').defaultPrevented, locked);
    assert.equal(event(document.body, 'wheel', {ctrlKey:true}).defaultPrevented, locked);
  }
});

test('viewport CSS confines the document to the visible height and leaves inner scroll containers available', () => {
  const {document} = parseHTML(read('../moonforest-0.3.html'));
  const sheet = postcss.parse(read('../src/v03/game-viewport.css'));
  function properties(node) {
    const style = {};
    sheet.walkRules(rule => {
      if (node.matches(rule.selector)) rule.walkDecls(d => { style[d.prop] = d.value; });
    });
    return style;
  }
  for (const node of [document.documentElement, document.body, document.querySelector('#app')]) {
    const css = properties(node);
    assert.equal(css.height, '100dvh');
    assert.equal(css.overflow, 'clip');
    assert.equal(css['touch-action'], 'none');
    assert.equal(css['overscroll-behavior'], 'none');
  }
  assert.equal(properties(document.querySelector('#app'))['min-height'], '0');
  assert.equal(properties(document.querySelector('.action-controls'))['touch-action'], 'none');
  // No blanket descendant rule blocks one-finger scrolling in menus or text fields.
  for (const cls of ['mf-menu-card', 'diagnostic-detail-body', 'mf-shop-scroll', 'v03-panel-box', 'v03-dialogue-text']) {
    const panel = document.createElement('section');
    panel.className = cls;
    document.body.append(panel);
    assert.equal(properties(panel)['touch-action'], undefined, cls);
  }
  const dialogueCSS = postcss.parse(read('../src/v03/v03.css'));
  const textStyle = {};
  dialogueCSS.walkRules('.v03-dialogue-text', rule => rule.walkDecls(d => { textStyle[d.prop] = d.value; }));
  assert.equal(textStyle['touch-action'], 'pan-y');
  assert.equal(textStyle['overflow-y'], 'auto');
});
