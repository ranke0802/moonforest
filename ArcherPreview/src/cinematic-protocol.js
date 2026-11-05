export const CINEMATIC_CHANNEL='moonforest-cinematic-studio';
const commands=['load','patch-document','save-scene','select-actor','focus-actor','camera-mode','path-visibility','list-existing','play','pause','resume','seek','stop','loop','capture-camera','status'];
export function parseCinematicCommand(event,{source,origin}){
  if(event.source!==source||event.origin!==origin)return null;
  const value=event.data;
  if(!value||typeof value!=='object'||Array.isArray(value)||value.channel!==CINEMATIC_CHANNEL||value.version!==1||!commands.includes(value.command)||typeof value.requestId!=='string'||!/^[A-Za-z0-9._:-]{1,80}$/.test(value.requestId))return null;
  const documentCommand=['load','patch-document','save-scene'].includes(value.command),actorCommand=['select-actor','focus-actor'].includes(value.command);
  const allowed=['channel','version','requestId','command',...(documentCommand?['document',...(value.command==='load'?['preserveCamera']:[])]:actorCommand?['actorId']:value.command==='camera-mode'?['mode']:value.command==='path-visibility'?['visible']:value.command==='seek'?['time']:value.command==='loop'?['loop']:[])];
  if(Object.keys(value).some(key=>!allowed.includes(key)))return null;
  if(documentCommand&&(!value.document||typeof value.document!=='object'||Array.isArray(value.document)))return null;
  if(value.command==='load'&&value.preserveCamera!==undefined&&typeof value.preserveCamera!=='boolean')return null;
  if(actorCommand&&(typeof value.actorId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value.actorId)))return null;
  if(value.command==='camera-mode'&&!['orbit','pan'].includes(value.mode))return null;
  if(value.command==='path-visibility'&&typeof value.visible!=='boolean')return null;
  if(value.command==='seek'&&(typeof value.time!=='number'||!Number.isFinite(value.time)))return null;
  if(value.command==='loop'&&typeof value.loop!=='boolean')return null;
  return value;
}
export function cinematicCommand(command,requestId,payload={}){return {channel:CINEMATIC_CHANNEL,version:1,requestId,command,...payload};}
export function cinematicReply(requestId,{ok=true,...payload}={}){return {channel:CINEMATIC_CHANNEL,version:1,requestId,reply:true,ok,...payload};}
export function parseCinematicReply(event,{source,origin}){
  const value=event.data;
  return event.source===source&&event.origin===origin&&value?.channel===CINEMATIC_CHANNEL&&value.version===1&&value.reply===true&&typeof value.requestId==='string'&&typeof value.ok==='boolean'?value:null;
}
