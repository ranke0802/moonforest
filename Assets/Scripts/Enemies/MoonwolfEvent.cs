using UnityEngine;
using System.Collections;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed class MoonwolfEvent:MonoBehaviour {
 public static MoonwolfEvent Instance;public GameObject boss;public bool Summoned;void Awake(){Instance=this;}
 void Update(){if(AdventureProgress.Instance)return;if(RpgSession.Instance&&RpgSession.Instance.Playing&&RpgSession.Instance.Kills>=30&&!RpgSession.Instance.BossDefeated&&!Summoned)Summon();}
 public void ResetEncounter(){if(boss&&boss.activeSelf)boss.SetActive(false);Summoned=false;}
 public void SummonAt(Vector3 at){if(Summoned)return;Summoned=true;boss.transform.position=at;var h=boss.GetComponent<SlimeMonster>();h.TestIdle=AdventureProgress.Instance&&AdventureProgress.Instance.TestFreezeEnemies;boss.SetActive(true);h.maxHealth=1400;h.persistentDefeat=true;h.SetHome(at);h.ResetMonster();boss.GetComponent<MoonwolfBoss>().ResetEncounter();ForestSound.Play("boss_appear",at,.8f);}
 public void Summon(){if(Summoned||RpgSession.Instance.BossDefeated)return;Summoned=true;var p=RpgProgress.Instance.player;Vector3 spot=p.transform.position+Vector3.up*.04f;float best=-999;for(int i=0;i<16;i++){Vector3 dir=Quaternion.Euler(0,i*22.5f,0)*p.transform.forward;Vector3 candidate=p.transform.position+dir*6;if(!Physics.Raycast(candidate+Vector3.up*80,Vector3.down,out RaycastHit h,160,1<<10)||h.normal.y<.65f)continue;candidate=h.point+Vector3.up*.04f;if(Physics.CheckCapsule(candidate+Vector3.up*.7f,candidate+Vector3.up*2,.7f,(1<<11)|(1<<13)))continue;float score=Vector3.Dot(dir,p.transform.forward)-Mathf.Abs(candidate.y-p.transform.position.y)*.1f;if(score>best){best=score;spot=candidate;}}boss.transform.position=spot;boss.SetActive(true);ForestSound.Play("boss_appear",spot,.8f);RpgUI.Toast(Loc.T("필드 보스 · 은빛 달늑대 출현!","Field Boss · Silver Moonwolf appears!","フィールドボス · 銀月の狼が現れた！"));}
}
}
