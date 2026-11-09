import {validateStoryboard} from './storyboard-document.js';
const fingerprint=value=>{let hash=0x811c9dc5;for(const ch of JSON.stringify(value)){hash=Math.imul(hash^ch.codePointAt(0),0x01000193)>>>0;}return hash.toString(16).padStart(8,'0');};

// Opt-in storyboard control over the existing live game, with a small saved cursor.
export class StoryboardRunner{
 constructor({storage,host,onChange=()=>{}}){this.storage=storage;this.host=host;this.onChange=onChange;this.generation=0;this.status='idle';this.key=null;this.pending=false;}
 snapshot(){return {status:this.status,cardId:this.cardId??null,card:this.card??null,error:this.error??null,completed:[...(this.completed??[])]};}
 publish(){this.onChange(this.snapshot());}
 save(){if(!this.key)return;try{this.storage?.setItem(this.key,JSON.stringify({version:1,signature:this.signature,cardId:this.cardId,completed:[...this.completed]}));}catch(error){this.error='진행을 저장하지 못했습니다: '+error.message;this.publish();}}
 async start(input,{resume=false}={}){
  const result=validateStoryboard(input);if(!result.valid)throw Error(result.errors.join('\n'));
  await this.stop();this.document=result.document;this.signature=fingerprint(this.document);this.key='moonforest-storyboard-progress-v1:'+this.document.id;this.completed=[];this.cardId=this.document.entry;
  if(resume){let s;try{s=JSON.parse(this.storage?.getItem(this.key)??'null');}catch{throw Error('저장된 진행을 읽지 못했습니다.');}if(!s)throw Error('저장된 진행이 없습니다. 처음부터 실행해 주세요.');if(s.signature!==this.signature)throw Error('스토리보드가 저장 후 변경되었습니다. 처음부터 실행하거나 기존 파일을 다시 여세요.');if(s?.version===1&&(s.cardId===null||this.document.cards.some(c=>c.id===s.cardId))&&Array.isArray(s.completed)){this.cardId=s.cardId;this.completed=s.completed.filter(id=>this.document.cards.some(c=>c.id===id));}else throw Error('저장된 진행이 올바르지 않습니다.');}
  this.generation++;this.card=this.document.cards.find(c=>c.id===this.cardId)??null;this.status=this.card?'waiting':'complete';this.error=null;this.save();this.publish();return this.snapshot();
 }
 async stop(){const ownsScene=this.status==='scene'||this.status==='preparing'&&this.card?.type==='cinematic';this.generation++;this.pending=false;this.status='idle';this.card=null;this.cardId=null;this.error=null;this.publish();if(ownsScene)await this.host.stopScene?.();}
 async finish(){if(!this.card||this.pending||!['waiting','scene','bear'].includes(this.status))return false;const card=this.card,epoch=this.generation;this.pending=true;
  try{if(this.status==='scene')await this.host.stopScene?.();if(epoch!==this.generation)return false;this.completed=[...new Set([...this.completed,card.id])];this.cardId=card.next;this.card=this.document.cards.find(c=>c.id===this.cardId)??null;this.status=this.card?'waiting':'complete';this.error=null;this.save();this.publish();return true;}
  catch(error){if(epoch===this.generation){this.status='error';this.error=error.message;this.publish();}return false;}
  finally{if(epoch===this.generation)this.pending=false;}
 }
 async launch(kind){if(this.pending||this.status!=='waiting')return;const epoch=this.generation,card=this.card;this.pending=true;this.status='preparing';this.error=null;this.publish();
  try{if(kind==='cinematic'){const scene=this.document.scenes.find(s=>s.cutsceneId===card.sceneId);if(!scene)throw Error(`${card.title} (${card.id}): 컷씬 파일을 연결하세요.`);await this.host.playScene(scene,{isCurrent:()=>epoch===this.generation});if(epoch!==this.generation){await this.host.stopScene?.();return;}this.status='scene';}
   else{await this.host.summonBear();if(epoch!==this.generation)return;this.status='bear';}
  }catch(error){if(epoch===this.generation){this.status='error';this.error=error.message;}}
  finally{if(epoch===this.generation){this.pending=false;this.publish();}}
 }
 update({mapId,position,completedQuests=[],playerAlive=true,sceneState}={}){
  if(this.pending||!this.card)return;
  if(this.status==='scene'){if(sceneState==='completed')void this.finish();else if(sceneState==='error'||sceneState==='cancelled'){this.status='error';this.error='컷씬 재생이 중단되었습니다. 다시 시도하세요.';this.publish();}return;}
  if(this.status==='bear'){if(!playerAlive){this.status='retry';this.error='곰 전투 실패 · 부활 후 다시 시도하세요.';this.publish();}return;}
  if(this.status!=='waiting')return;
  const c=this.card;if(c.type==='zone'&&mapId===c.mapId&&position&&Math.hypot(position.x-c.zone.x,position.z-c.zone.z)<=c.zone.radius)void this.finish();
  else if(c.type==='quest'&&completedQuests.includes(c.questId))void this.finish();
  else if((c.type==='cinematic'||c.type==='bear')&&mapId===c.mapId)void this.launch(c.type);
 }
 async advance(){if(this.status==='waiting'&&this.card?.type==='manual')return this.finish();return false;}
 async skip(){if(this.status==='scene')return this.finish();return false;}
 defeat(kind){if(this.status==='bear'&&kind==='bear'){void this.finish();return true;}return false;}
 retry(){if(!['error','retry'].includes(this.status))return false;this.status='waiting';this.error=null;this.publish();return true;}
}
