using UnityEngine;
using System;
using System.Collections;
using System.Linq;
namespace WitchPlayground {
public sealed partial class AudioVerification {
 bool CueActive(string key)=>sound.GetComponentsInChildren<AudioSource>().Any(s=>s.clip&&s.clip.name==key&&s.isPlaying);
 IEnumerator Hold(bool keyboard,bool mouse,float seconds,Vector3 target){float until=Time.time+seconds;while(Time.time<until){p.ProcessButtons(keyboard,mouse,false,target);yield return null;}}
 IEnumerator InputAudit(){
  yield return Reset(2);var enemy=Spawn(5);yield return Wait(.1f);enemy.ResetMonster();enemy.enabled=false;
  int draws=sound.Count("bow_draw"),shots=sound.Count("bow_release");
  p.ProcessButtons(false,true,false,enemy.HitPoint);
  Check(p.IsCharging&&sound.Count("bow_draw")==draws+1,"Input: bow draw sound starts in the accepted press event");
  yield return Wait(.12f);p.ProcessButtons(false,false,false,enemy.HitPoint);
  Check(!p.IsCharging&&!CueActive("bow_draw")&&sound.Count("bow_release")==shots,"Input: early mouse release stops preparation without firing");
  yield return Wait(.8f);draws=sound.Count("bow_draw");shots=sound.Count("bow_release");int ready=sound.Count("charge_ready");
  yield return Hold(false,true,1.25f,enemy.HitPoint);
  Check(p.IsCharging&&sound.Count("bow_draw")==draws+1&&sound.Count("charge_ready")==ready+1&&sound.Count("bow_release")==shots,"Input: holding fully drawn mouse bow has one ready cue and no premature shot");
  p.ProcessButtons(false,false,false,enemy.HitPoint);
  Check(sound.Count("bow_release")==shots+1,"Input: mouse release fires exactly once");
  yield return Wait(.35f);draws=sound.Count("bow_draw");shots=sound.Count("bow_release");
  yield return Hold(true,false,2.6f,enemy.HitPoint);p.ProcessButtons(false,false,false,enemy.HitPoint);
  Check(sound.Count("bow_release")>=shots+3&&sound.Count("bow_draw")-draws>=sound.Count("bow_release")-shots&&sound.Count("bow_draw")-draws<=sound.Count("bow_release")-shots+1,"Input: held J chains bow cycles with a draw for every attempt");
  yield return Reset(2);enemy=Spawn(4);yield return Wait(.1f);enemy.ResetMonster();enemy.enabled=false;
  shots=sound.Count("bow_release");p.ProcessButtons(true,true,false,enemy.HitPoint);yield return Wait(.7f);
  p.ProcessButtons(true,false,false,enemy.HitPoint);Check(sound.Count("bow_release")==shots,"Input: releasing one of two held attack inputs does not fire twice");
  p.ProcessButtons(false,false,false,enemy.HitPoint);Check(sound.Count("bow_release")==shots+1,"Input: releasing the final held input fires one mouse arrow");
  yield return Reset(2);p.ProcessButtons(false,true,false,arena+Vector3.forward*4);yield return Wait(.1f);RpgUI.Instance.Open(RpgUI.Window.Bag);
  Check(!p.IsCharging&&!CueActive("bow_draw"),"Input: opening a menu immediately stops bow preparation");
  yield return Wait(.15f);RpgUI.Instance.Close();RpgUI.Instance.ReleaseInputForTest();yield return Wait(.1f);
  Check(!CueActive("bow_draw"),"Input: closing a menu does not resume cancelled draw audio");
  yield return Reset(0);p.ProcessButtons(false,true,false,arena+Vector3.forward*5);yield return Wait(.12f);p.CancelCharge();
  Check(!CueActive("charge_loop"),"Input: witch charge cancellation stops the loop in the same event");
  yield return Reset(0);int light=sound.Count("energy_light");p.ProcessButtons(false,true,false,arena+Vector3.forward*5);p.ProcessButtons(false,false,false,arena+Vector3.forward*5);
  Check(sound.Count("energy_light")==light+1&&!CueActive("charge_loop"),"Input: a quick witch tap fires once without a stranded loop");
  yield return Reset(0);stats.TrySkill(SpellId.Meteor,arena+Vector3.forward*4);yield return Wait(2.35f);p.HandleChannelInput(Vector2.up,false);
  Check(!p.IsChanneling&&!CueActive("channel_fire")&&!CueActive("meteor_fall"),"Input: late meteor movement cancel immediately stops channel and descent audio");
  yield return Reset(2);stats.TrySkill(SpellId.Heal,arena+Vector3.forward*4);yield return Wait(.3f);p.HandleChannelInput(Vector2.zero,true);
  Check(!p.IsChanneling&&!CueActive("channel_rain"),"Input: a new action cancels rain preparation immediately");
  yield return Reset(1);int slash=sound.Count("slash"),heavy=sound.Count("slash_heavy");
  yield return Hold(true,false,1.9f,arena+Vector3.forward*3);p.ProcessButtons(false,false,false,Vector3.zero);yield return Wait(.25f);
  Check(sound.Count("slash")==slash+2&&sound.Count("slash_heavy")==heavy+1,"Input: held warrior J produces one sound for each of three combo contacts");
  yield return Reset(1);slash=sound.Count("slash");p.ProcessButtons(false,true,false,arena+Vector3.forward*3);yield return Wait(.1f);p.TakeDamage(10000);yield return Wait(.3f);
  Check(sound.Count("slash")==slash,"Input: interrupted sword wind-up emits no delayed swing");
  yield return Reset(1);enemy=Spawn();yield return Wait(.1f);enemy.maxHealth=1;stats.GainXP(stats.NeededXP-enemy.XPReward);enemy.ResetMonster();enemy.enabled=false;slash=sound.Count("slash");
  p.ProcessButtons(true,false,false,enemy.HitPoint);yield return Wait(.4f);
  Check(stats.PendingChoices>0&&sound.Count("slash")==slash+1,"Input: the strike that opens level-up choices still emits its attack sound");
  yield return Reset(0);stats.ranks[1]=0;int error=sound.Count("ui_error");stats.TrySkill(SpellId.Frost);
  Check(sound.Count("ui_error")==error+1,"Input: an unlearned skill has failure feedback rather than silence");
  yield return Reset(0);yield return Wait(1.5f);sound.StopWorld();
  string[] crowd={"ambient_wind","ambient_crickets","torch_fire","bee_buzz","burn","slime_death","boss_hit"};
  for(int batch=0;batch<3;batch++){foreach(string cue in crowd)ForestSound.Play(cue,arena,.1f);yield return Wait(.085f);}
  Check(sound.ActiveVoices==sound.VoiceLimit,"Input: crowd stress reaches the voice budget");
  Check(ForestSound.Play("slash",arena,.8f),"Input: local attack feedback survives a saturated crowd voice pool");
  sound.StopWorld();yield return Reset(1);slash=sound.Count("slash");heavy=sound.Count("slash_heavy");
  yield return Hold(false,true,1.9f,arena+Vector3.forward*3);p.ProcessButtons(false,false,false,Vector3.zero);yield return Wait(.25f);
  Check(sound.Count("slash")==slash+2&&sound.Count("slash_heavy")==heavy+1,"Input: held mouse warrior attack has the same three contact cues as J");
  yield return Reset(2);p.ProcessButtons(false,true,false,arena+Vector3.forward*4);yield return Wait(.1f);p.TakeDamage(10);
  Check(!p.IsCharging&&!CueActive("bow_draw"),"Input: incoming damage cuts off interrupted bow preparation");
  for(int hero=0;hero<3;hero++){
   yield return Reset(hero);int rolls=sound.Count("roll");bool accepted=p.Combat.TryEvade(Vector2.right);
   Check(accepted&&sound.Count("roll")==rolls+1,"Input: class "+hero+" accepted dodge emits exactly one roll cue");
   p.Combat.TryEvade(Vector2.right);Check(sound.Count("roll")==rolls+1,"Input: class "+hero+" rejected repeat dodge emits no extra roll cue");
   yield return Reset(hero);string cue=hero==0?"blink":hero==1?"shield_up":"backstep";int backs=sound.Count(cue);
   accepted=p.Combat.TryEvade(Vector2.down);Check(accepted&&sound.Count(cue)==backs+1,"Input: class "+hero+" backward action uses its own cue");
  }
  yield return Reset(0);int jumps=sound.Count("jump"),lands=sound.Count("land");p.ProcessButtons(false,false,true,arena);
  yield return Wait(.85f);Check(sound.Count("jump")==jumps+1&&sound.Count("land")==lands+1,"Input: a stationary Space press produces one takeoff and one landing cue");
  yield return Reset(0);int steps=sound.Count("foot_0")+sound.Count("foot_1")+sound.Count("foot_2");yield return Wait(.5f);
  Check(sound.Count("foot_0")+sound.Count("foot_1")+sound.Count("foot_2")==steps,"Input: standing still does not generate phantom footsteps");
  yield return Reset(0);stats.TrySkill(SpellId.Meteor,arena+Vector3.forward*4);yield return Wait(.2f);RpgUI.Instance.Open(RpgUI.Window.Pause);yield return null;
  var loop=sound.GetComponentsInChildren<AudioSource>().FirstOrDefault(a=>a.clip&&a.clip.name=="channel_fire");
  Check(loop&&loop.volume==0,"Input: opening pause immediately silences the active channel loop");
  RpgUI.Instance.Close();RpgUI.Instance.ReleaseInputForTest();yield return Wait(.1f);p.CancelChannel();
  Check(!CueActive("channel_fire"),"Input: cancelling after resume leaves no channel loop");
  yield return Reset(0);
 }
}
}
