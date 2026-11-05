import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {parseAst} from 'rolldown/parseAst';
import {createDeveloperToolSessions} from '../src/tool-visibility-settings.js';
import {setupDeveloperToolSettings} from '../src/tool-visibility-settings.js';

const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(t){
 const {document}=parseHTML('<main></main>'),root=document.querySelector('main'),enabled={authoring:true,nearby:true},events=[];
 let rollback=null;
 const tools=['placement','actor','cinema'].map(name=>{const panel=document.createElement('section');panel.hidden=true;root.append(panel);return {name,panel,hide(){events.push(name+':hide');panel.hidden=true;return rollback?.promise;}};});
 const sessions=createDeveloperToolSessions({getEnabled:owner=>enabled[owner],getTools:()=>[...tools,tools[0]]});
 t.after(()=>{rollback?.resolve();return sessions.dispose();});
 return {root,enabled,events,tools,sessions,setRollback:value=>rollback=value,show:label=>{for(const tool of tools){tool.panel.hidden=false;tool.panel.textContent=label;}},visible:()=>tools.some(tool=>!tool.panel.hidden)};
}

test('OFF hides each shared controller synchronously and only for its opening setting',async t=>{
 const f=fixture(t);let valid;
 await f.sessions.open('authoring',()=>true,async current=>{valid=current;f.show('authoring');});
 f.enabled.nearby=false;await f.sessions.close('nearby');assert.equal(f.visible(),true);assert.equal(valid(),true);assert.deepEqual(f.events,[]);
 f.enabled.authoring=false;const closing=f.sessions.close('authoring');assert.equal(valid(),false);assert.equal(f.visible(),false);assert.deepEqual(f.events,['placement:hide','actor:hide','cinema:hide']);await closing;
 await f.sessions.close('authoring');assert.equal(f.events.length,3,'duplicate OFF does not hide a newer/unowned controller');
});

test('rapid OFF/ON invalidates a pending old open without letting its late completion close the new session',async t=>{
 const f=fixture(t),gate=deferred();t.after(gate.resolve);let generation=1,oldValid,newStarted=false;
 const old=f.sessions.open('authoring',()=>generation===1,async valid=>{oldValid=valid;await gate.promise;if(valid())f.show('old');return valid();});
 await settle();assert.equal(oldValid(),true);
 f.enabled.authoring=false;await f.sessions.close('authoring');assert.equal(oldValid(),false);
 generation=2;f.enabled.authoring=true;
 const current=f.sessions.open('authoring',()=>generation===2,async valid=>{newStarted=true;assert.equal(valid(),true);f.show('new');});
 await settle();assert.equal(newStarted,true,'an unresolved stale loader does not block the new generation');await current;
 const hides=f.events.length;gate.resolve();assert.equal(await old,false);assert.equal(f.visible(),true);assert.ok(f.tools.every(tool=>tool.panel.textContent==='new'));assert.equal(f.events.length,hides);
});

test('reopening waits for rollback to finish while OFF removes visible panels immediately',async t=>{
 const f=fixture(t),rollback=deferred();t.after(rollback.resolve);
 await f.sessions.open('authoring',()=>true,async()=>f.show('before'));
 f.setRollback(rollback);f.enabled.authoring=false;const closing=f.sessions.close('authoring');assert.equal(f.visible(),false);
 f.enabled.authoring=true;let entered=false;
 const reopened=f.sessions.open('authoring',()=>true,async valid=>{assert.equal(valid(),true);entered=true;f.show('after');});
 await settle();assert.equal(entered,false);assert.equal(f.visible(),false);
 rollback.resolve();await closing;await reopened;assert.equal(entered,true);assert.equal(f.visible(),true);
});

test('dispose invalidates deferred entry and prevents any later open',async t=>{
 const f=fixture(t),gate=deferred();t.after(gate.resolve);let pendingValid,afterDispose=false;
 const pending=f.sessions.open('nearby',()=>true,async valid=>{pendingValid=valid;await gate.promise;if(valid())f.show('late');});
 await settle();const disposed=f.sessions.dispose();assert.equal(pendingValid(),false);assert.equal(f.visible(),false);gate.resolve();await pending;await disposed;
 await f.sessions.open('authoring',()=>true,async()=>{afterDispose=true;});assert.equal(afterDispose,false);assert.equal(f.visible(),false);
});

test('a stale caller or disabled preference cannot open a controller',async t=>{
 const f=fixture(t);let opened=0;
 await f.sessions.open('authoring',()=>false,async()=>opened++);
 f.enabled.nearby=false;await f.sessions.open('nearby',()=>true,async()=>opened++);assert.equal(opened,0);assert.equal(f.visible(),false);
});

test('actual settings OFF closes a shared editor even while its launcher mount is still pending',async t=>{
 const {document,window}=parseHTML('<main><dialog><div></div></dialog><section id="editor" hidden></section></main>'),root=document.querySelector('main'),dialog=root.querySelector('dialog'),host=dialog.querySelector('div'),panel=root.querySelector('#editor'),gate=deferred(),disabled=[];
 let settings,validAtMount,hideCount=0,launcherDisposals=0;
 const sessions=createDeveloperToolSessions({getEnabled:owner=>settings?.enabled(owner)===true,getTools:()=>[{hide(){hideCount++;panel.hidden=true;}}]});
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),nodes=[];const walk=node=>{if(!node||typeof node!=='object')return;if(node.type)nodes.push(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};walk(parseAst(main));
 const setup=nodes.find(node=>node.type==='CallExpression'&&node.callee?.name==='setupDeveloperToolSettings'),hook=setup?.arguments[0].properties.find(node=>node.key?.name==='onDisable')?.value;assert.ok(hook,'main wires the shared-session OFF callback');const disableFromMain=Function('toolSessions','return ('+main.slice(hook.start,hook.end)+');')(sessions);
 settings=setupDeveloperToolSettings({host,dialog,onDisable:owner=>{disabled.push(owner);return disableFromMain(owner);},mounts:{authoring:async({isCurrent})=>{
   await sessions.open('authoring',isCurrent,async valid=>{validAtMount=valid;panel.hidden=false;await gate.promise;if(valid())panel.hidden=false;});
   return {dispose(){launcherDisposals++;}};
 }}});
 t.after(()=>{gate.resolve();settings.dispose();return sessions.dispose();});
 const change=on=>{const input=host.querySelector('#developer-authoring-enabled');input.checked=on;input.dispatchEvent(new window.Event('change'));};
 change(true);await settle();assert.equal(panel.hidden,false);assert.equal(validAtMount(),true);
 change(false);assert.equal(disabled.at(-1),'authoring');assert.equal(panel.hidden,true,'shared UI closes before the unresolved mount can return its disposer');assert.equal(validAtMount(),false);assert.equal(hideCount,1);
 gate.resolve();await settle();assert.equal(panel.hidden,true);assert.equal(launcherDisposals,1);assert.equal(host.querySelector('[data-developer-tool-host="authoring"]').children.length,0);
});
