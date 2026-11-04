export const CINEMATIC_CHANNEL='moonforest-cinematic-studio';
const commands=['load','save-scene','play','pause','resume','seek','stop','loop','capture-camera','status'];
export function parseCinematicCommand(event,{source,origin}){
  if(event.source!==source||event.origin!==origin)return null;
  const value=event.data;
  if(!value||typeof value!=='object'||Array.isArray(value)||value.channel!==CINEMATIC_CHANNEL||value.version!==1||!commands.includes(value.command)||typeof value.requestId!=='string'||!/^[A-Za-z0-9._:-]{1,80}$/.test(value.requestId))return null;
  const allowed=['channel','version','requestId','command',...(['load','save-scene'].includes(value.command)?['document']:value.command==='seek'?['time']:value.command==='loop'?['loop']:[])];
  if(Object.keys(value).some(key=>!allowed.includes(key)))return null;
  if(['load','save-scene'].includes(value.command)&&(!value.document||typeof value.document!=='object'||Array.isArray(value.document)))return null;
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
