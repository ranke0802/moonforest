using UnityEngine;
using System.Collections.Generic;
using System.Linq;
namespace WitchPlayground {
public sealed class WorldPopulation:MonoBehaviour {
 public sealed class Slot {public SlimeMonster enemy;public Vector3 home;public int region,baseHP;public bool waiting,created;public float readyAt,hideAt;}
 public readonly List<Slot> Slots=new List<Slot>();AdventureProgress a;WitchPlayer player;float nextTick;
 public int ActiveCount=>Slots.Count(s=>s.enemy.gameObject.activeSelf&&!s.enemy.IsDead);
 public void Configure(AdventureProgress adventure,SlimeMonster slime,SlimeMonster bee){a=adventure;player=a.GetComponent<WitchPlayer>();
  Vector3[] anchors={new Vector3(5,0,18),new Vector3(8,0,15),new Vector3(12,0,12),new Vector3(14,0,9),new Vector3(11,0,3),new Vector3(9,0,0),new Vector3(2,0,-3),new Vector3(-3,0,-5),new Vector3(-8,0,-13)};
  for(int i=0;i<27;i++){int region=i/9;bool flying=region==0?i%5==4:i%2==1;Vector3 at=AdventureProgress.Safe(anchors[i/3]+Quaternion.Euler(0,(i%3)*120,0)*Vector3.forward*2.5f);var e=Instantiate(flying?bee:slime,at,Quaternion.identity);e.name="Forest population "+i;e.QuestId="wild"+i;e.persistentDefeat=true;e.Region=region;e.PopulationManaged=true;e.enabled=true;e.aggroRange=6;e.leashRange=10;var slot=new Slot{enemy=e,home=at,region=region,baseHP=(flying?55:40)+region*25};Slots.Add(slot);a.Enemies[e.QuestId]=e;}
 }
 public bool RespawnSafe(Vector3 point){if(ClassCombat.Flat(point-player.transform.position).magnitude<8||a.SafeZone(point))return false;var cam=Camera.main;var p=cam.WorldToViewportPoint(point+Vector3.up);return p.z<0||p.x<-.08f||p.x>1.08f||p.y<-.08f||p.y>1.08f;}
 public void ChangeTier(){foreach(var s in Slots){s.enemy.gameObject.SetActive(false);s.created=s.waiting=true;s.readyAt=Time.time;}Tick();}
 public void ResetPopulation(){foreach(var s in Slots){s.enemy.gameObject.SetActive(false);s.waiting=s.created=false;s.readyAt=0;}Tick(true);}
 public void Tick(bool initial=false){if(!a||!a.Ready)return;int active=0,budget=a.EventRunning?13:16;
  foreach(var s in Slots.OrderBy(s=>ClassCombat.Flat(s.home-player.transform.position).sqrMagnitude)){
   var e=s.enemy;float distance=ClassCombat.Flat(s.home-player.transform.position).magnitude;
   if(s.created&&e.IsDead&&!s.waiting){s.waiting=true;s.readyAt=Time.time+25+(Slots.IndexOf(s)%16);s.hideAt=Time.time+1.2f;}
   bool allowed=distance<28&&!a.SafeZone(s.home)&&(!a.BossActive||ClassCombat.Flat(s.home-a.Arena).magnitude>8);
   if(e.gameObject.activeSelf&&!e.IsDead&&(!allowed||active>=budget)){e.gameObject.SetActive(false);}
   if(e.gameObject.activeSelf&&!e.IsDead){active++;continue;}
   if(s.waiting){if(e.gameObject.activeSelf&&Time.time<s.hideAt)continue;e.gameObject.SetActive(false);if(Time.time<s.readyAt||!RespawnSafe(s.home))continue;}
   if(!allowed||active>=budget)continue;
   // Only first population placement may appear in the opening view; later spawns wait off camera.
   if(s.created&&!e.gameObject.activeSelf&&!RespawnSafe(s.home))continue;
   bool newLife=!s.created||s.waiting;e.maxHealth=Mathf.RoundToInt(s.baseHP*(1+(a.State.danger-1)*.45f));e.damageMultiplier=1+(a.State.danger-1)*.22f;e.TestIdle=a.TestFreezeEnemies;
   e.gameObject.SetActive(true);if(newLife){e.SetHome(s.home);e.ResetMonster();}s.created=true;s.waiting=false;active++;
  }
 }
 void Update(){if(!a||!RpgSession.Instance.Playing||Time.timeScale==0||Time.time<nextTick)return;nextTick=Time.time+.5f;Tick();}
 void OnDestroy(){foreach(var s in Slots)if(s.enemy)Destroy(s.enemy.gameObject);}
}
}
