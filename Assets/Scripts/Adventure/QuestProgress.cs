using UnityEngine;
using System;
using System.Linq;
namespace WitchPlayground {
public sealed class QuestProgress:MonoBehaviour {
 [Serializable]public class Contract {public int serial,kind,region,count;public bool active;public int Target=>kind==0?12:kind==1?6:10;public bool Complete=>active&&count>=Target;}
 [Serializable]public class Data {public Contract[] jobs;public int tracked;}
 public Data State=new Data();AdventureProgress a;
 void Awake(){a=GetComponent<AdventureProgress>();}
 public void Import(Data data){State=data??new Data();if(State.jobs==null||State.jobs.Length!=3)State.jobs=new[]{new Contract{kind=0},new Contract{kind=1},new Contract{kind=2,region=1}};State.tracked=Mathf.Clamp(State.tracked,0,2);}
 public bool Accept(int i){if(i<0||i>2||!a.State.mainAccepted||State.jobs[i].active||State.jobs.Count(j=>j.active)>=2)return false;State.jobs[i].active=true;State.jobs[i].count=0;State.tracked=i;a.Save();return true;}
 public bool Abandon(int i){if(i<0||i>2||!State.jobs[i].active)return false;State.jobs[i].active=false;State.jobs[i].count=0;a.Save();return true;}
 public void OnKill(SlimeMonster e){foreach(var j in State.jobs)if(j.active&&!j.Complete&&(j.kind==0||j.kind==1&&e.isBee||j.kind==2&&e.Region==j.region))j.count=Mathf.Min(j.Target,j.count+1);}
 public bool Claim(int i){if(i<0||i>2||!State.jobs[i].Complete||!a.CanManage)return false;var old=State.jobs[i];int oldKey=old.kind<2?old.kind:old.region+2,key=oldKey;for(int n=1;n<=5;n++){int candidate=(oldKey+n)%5;if(candidate==oldKey||State.jobs.Where((j,index)=>index!=i).Any(j=>(j.kind<2?j.kind:j.region+2)==candidate))continue;key=candidate;break;}State.jobs[i]=new Contract{serial=old.serial+1,kind=key<2?key:2,region=key<2?0:key-2};a.AddEssence(8);GetComponent<RpgProgress>().GainXP(old.kind==0?24:old.kind==1?24:28);a.Save();return true;}
 public bool HasReward=>State.jobs.Any(j=>j.Complete);
 public string Title(Contract j)=>j.kind==0?AdventureProgress.T("어떤 적이든 사냥","Hunt any enemies","敵を倒す"):j.kind==1?AdventureProgress.T("꿀벌 사냥","Hunt bees","蜂を倒す"):AdventureProgress.RegionName(j.region)+AdventureProgress.T(" 사냥"," hunt","の狩り");
 public Contract Tracked=>State.jobs[State.tracked].active?State.jobs[State.tracked]:State.jobs.FirstOrDefault(j=>j.active);
 public string TrackedLabel=>Tracked==null?AdventureProgress.T("L · 사냥 의뢰 선택","L · Choose a hunt","L · 狩りを選ぶ"):Title(Tracked)+" "+Tracked.count+" / "+Tracked.Target;
}
}
