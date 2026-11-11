import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
import {parseHTML} from 'linkedom';

const css=readFileSync(new URL('../src/cinematic-studio.css',import.meta.url),'utf8'),sheet=postcss.parse(css),help=readFileSync(new URL('../public/moonforest-help.html',import.meta.url),'utf8');
function applies(node,width,height){for(let parent=node.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='media'){for(const [,kind,axis,value]of parent.params.matchAll(/(min|max)-(width|height):\s*(\d+)px/g)){const actual=axis==='width'?width:height;if(kind==='max'?actual>Number(value):actual<Number(value))return false;}}return true;}
function style(selector,width=1440,height=900){const result={};sheet.walkRules(rule=>{const selectors=rule.selectors.filter(value=>!value.includes('data-preview-fullscreen')&&!value.includes('data-studio-mode=mobile')).map(value=>value.replace('#cinematic-studio[data-studio-mode=desktop]','#cinematic-studio')).map(value=>selector==='#cinematic-studio'?value:value.replace(/^#cinematic-studio\s+/,''));if(selectors.includes(selector)&&applies(rule,width,height))rule.walkDecls(decl=>result[decl.prop]=decl.value);});return result;}

test('stylesheet parses as a single resource-free workspace with bounded desktop panel ownership',()=>{
 assert.equal(sheet.nodes.filter(node=>node.type==='atrule'&&['import','font-face'].includes(node.name)).length,0);assert.doesNotMatch(css,/url\s*\(/i);
 const root=style('#cinematic-studio'),main=style('.studio-main');assert.equal(root.height,'100dvh');assert.equal(root.overflow,'hidden');assert.equal(root['grid-template-rows'],'auto auto minmax(0,1fr) auto auto');assert.equal(main['grid-template-areas'],"'library preview inspector'");assert.equal(main['grid-template-columns'],'250px minmax(0,1fr) 290px');
 for(const selector of ['.studio-main','.panel','.preview','.preview-workspace']){assert.equal(style(selector)['min-width'],'0',selector);assert.equal(style(selector)['min-height'],'0',selector);}assert.equal(style('.panel').overflow,'auto');assert.equal(style('.library-panel')['grid-area'],'library');assert.equal(style('.inspector-panel')['grid-area'],'inspector');
});

test('explicit PC mode keeps the original columns at narrow widths and short desktop workspaces still grow safely',()=>{
 assert.equal(style('.studio-main',1000)['grid-template-areas'],"'library preview inspector'");assert.equal(style('#cinematic-studio',1000)['overflow-x'],'auto');assert.equal(style('#cinematic-studio',1000)['grid-template-columns'],'minmax(1080px,1fr)');
 for(const height of [600,681,768,800]){assert.equal(style('#cinematic-studio',1440,height).height,'auto');assert.equal(style('#cinematic-studio',1440,height).overflow,'visible');assert.equal(style('.studio-main',1440,height).height,'470px');assert.equal(style('.timeline',1440,height).position,'sticky');}for(const height of [801,900]){assert.equal(style('#cinematic-studio',1440,height).height,'100dvh');assert.equal(style('#cinematic-studio',1440,height).overflow,'hidden');}
 for(const width of [320,390,760]){assert.equal(style('.studio-main',width)['grid-template-areas'],"'library preview inspector'");assert.equal(style('.preview-stage',width)['min-height'],'0');assert.equal(style('.preview-stage',width).height,'100%');assert.equal(style('.preview-dock',width).position,'absolute');assert.equal(style('.panel',width).overflow,'auto');assert.equal(style('#cinematic-studio',width)['overflow-x'],'auto');}
});

test('embedded viewport has no transformed CSS ancestor and dock wrappers never steal camera/subtitle gestures',()=>{
 const ancestors=new Set(['*','body','#cinematic-studio','.studio-main','.preview','.preview-workspace','.preview-stage','.preview iframe']);sheet.walkRules(rule=>{if(rule.selectors.some(selector=>ancestors.has(selector)))rule.walkDecls(decl=>{if(['transform','scale','rotate','translate','filter','perspective'].includes(decl.prop))assert.equal(decl.value,'none',rule.selector+' '+decl.prop);});});
 for(const width of [390,1000,1440]){assert.equal(style('.preview-dock',width)['pointer-events'],'none');assert.equal(style('.preview-dock button',width)['pointer-events'],'auto');assert.equal(style('.preview-dock button',width)['min-height'],'40px');assert.equal(style('.preview iframe',width).width,'100%');assert.equal(style('.preview iframe',width).height,'100%');}
 assert.equal(style('.preview-dock [data-action=capture-current]')['font-weight'],'700');
});

test('separate timeline lanes keep labels while their items scroll; controls and dialogs remain keyboard reachable',()=>{
 assert.equal(style('.timeline-lane')['grid-template-columns'],'62px minmax(0,1fr)');assert.equal(style('.timeline-items')['overflow-x'],'auto');assert.equal(style('.timeline-items')['min-width'],'0');assert.equal(style('.timeline-lanes').overflow,'auto');assert.match(style('.timeline-lanes')['max-height'],/^clamp/);assert.equal(style('.timeline-row')['min-height'],'40px');
 assert.equal(style('button')['min-height'],'40px');assert.equal(style('dialog').overflow,'auto');assert.equal(style('dialog')['max-height'],'90dvh');assert.equal(style('.dialog-tools')['flex-wrap'],'wrap');assert.ok(style('button:focus-visible').outline);assert.ok(style('textarea:focus-visible').outline);assert.equal(style('[hidden]').display,'none');
 const hidden=[];sheet.walkDecls('display',decl=>{if(decl.parent.selector==='[hidden]')hidden.push(decl.important);});assert.deepEqual(hidden,[true]);
});

test('guide identifies selected-editor regions, timeline navigation, current-time capture and separate file saving',()=>{
 const {document}=parseHTML(help),text=document.body.textContent;for(const phrase of ['왼쪽 목록','가운데 미리보기','오른쪽 선택 편집','아래 타임라인','현재 …초에 시점 저장','작업 전체를 파일로 보관하려면','위쪽의 되돌리기','Ctrl','각각 스크롤'])assert.ok(text.includes(phrase),phrase);assert.doesNotMatch(text,/영상 오른쪽 아래의 되돌리기/);assert.equal(document.querySelector('html').lang,'ko');assert.ok(document.querySelector('meta[name=viewport]'));
});
