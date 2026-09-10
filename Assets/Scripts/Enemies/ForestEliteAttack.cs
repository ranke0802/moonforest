using UnityEngine;
using System.Collections;
namespace WitchPlayground {
public sealed class ForestEliteAttack:MonoBehaviour {
 SlimeMonster enemy;WitchPlayer player;float next;RasterEffect mark;
 void OnEnable(){enemy=GetComponent<SlimeMonster>();player=FindAnyObjectByType<WitchPlayer>();next=Time.time+3;}
 void Update(){if(!enemy||enemy.IsDead||enemy.TestIdle||enemy.Windup||enemy.Frozen||enemy.HardStunned||Time.time<next||Time.timeScale==0||!player||player.IsDead)return;if(ClassCombat.Flat(player.transform.position-transform.position).magnitude<6)StartCoroutine(Pulse());}
 IEnumerator Pulse(){enemy.Windup=true;Vector3 target=GroundSpellTravel.GroundPosition(player.transform.position,.12f);float radius=enemy.isBee?2.2f:1.7f;mark=ElementalSpells.Sprite(target,0,radius*2,1,true);mark.loop=true;mark.tint=enemy.isBee?new Color(1,.3f,.7f):new Color(.3f,.8f,1);ForestSound.Play("boss_warning",target,.4f);float t=0;while(t<1){if(enemy.IsDead||enemy.HardStunned||enemy.Frozen){Clear();next=Time.time+4;yield break;}t+=Time.deltaTime;yield return null;}
  if(mark)Destroy(mark.gameObject);mark=null;RpgVFX.Sprite(target,1,radius*2,.5f,true);if(ClassCombat.Flat(player.transform.position-target).magnitude<radius)player.TakeDamage(Mathf.RoundToInt(18*enemy.damageMultiplier),false,enemy);enemy.Windup=false;next=Time.time+6;
 }
 void Clear(){if(mark)Destroy(mark.gameObject);mark=null;if(enemy)enemy.Windup=false;}
 void OnDisable(){StopAllCoroutines();Clear();}
}
}
