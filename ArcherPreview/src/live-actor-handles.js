// Session IDs follow actual root identity. No rig, renderer, model request or
// persistent placement key is created by this shared nearby/editor inventory.
const identities=new WeakMap();let serial=0;
export function listEditableActorHandles(world,battle){
 const seen=new Set(),rows=[],population=world.developmentActors?.population?.entries??[];
 const add=(encounter,source)=>{const root=encounter?.actor;if(!root||seen.has(root)||root.isDisposed?.()||!root.isEnabled?.()||encounter.corpseGone||encounter.active===false&&source!=='npc')return;seen.add(root);root.computeWorldMatrix?.(true);let id=identities.get(root);if(!id){id='live-actor:'+(++serial);identities.set(root,id);}const rotation=root.rotationQuaternion?.asArray?.()??null;rows.push({id,instanceId:id,name:encounter.displayName??encounter.config?.name??(source==='npc'?'NPC':encounter.kind==='goblin'?'고블린':encounter.kind==='bear'?'곰':'몬스터'),label:encounter.displayName??encounter.config?.name??(source==='npc'?'NPC':'몬스터'),root,encounter,kind:'actor',source,mapId:world.mapId,position:root.getAbsolutePosition?.().asArray?.()??root.position.asArray(),rotation,scale:root.scaling.x});};
 for(const encounter of battle?.encounters??[])add(encounter,encounter.type==='npc'||encounter.category==='npc'||encounter.config?.npc?'npc':'monster');
 for(const encounter of world.trainingTargets?.editableEncounters?.()??[])add(encounter,'training');
 for(const encounter of world.questProps?.editableEncounters?.()??[])add(encounter,'quest-chest');
 for(const record of population){if(!['active','dying','corpse'].includes(record.state))continue;add(record.adapter?.encounter,record.category==='npc'?'npc':'monster');}
 return rows;
}
