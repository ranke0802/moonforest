using UnityEngine;
using System;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.IO;
namespace WitchPlayground {
public sealed partial class AdventureVerification {
 [Serializable]class HuntSample {public int hero,kills;public float seconds;}
 [Serializable]class PopulationMetrics {public HuntSample[] attacks;public int width,height,peakPopulation;public float fps,p95FrameMs;}
 IEnumerator PopulationCombat(){var samples=new List<HuntSample>();
  for(int hero=0;hero<3;hero++){
   session.NewGame("Combat"+hero,hero);ClearUI();p.TestControl=true;a.TestFreezeEnemies=true;SafeMenus();yield return Wait(1.5f);
   float started=Time.realtimeSinceStartup;
   foreach(bool bee in new[]{false,true}){
    SafeMenus();var e=a.Population.Slots.First(s=>s.enemy.isBee==bee).enemy;
    var home=a.Regions[0];e.SetHome(home);e.maxHealth=bee?55:40;e.TestIdle=true;e.gameObject.SetActive(true);e.ResetMonster();p.Teleport(AdventureProgress.Safe(home+Vector3.forward*(hero==1?1.8f:4)));Camera.main.GetComponent<PlaygroundView>().Snap();yield return Wait(.3f);RpgUI.Instance.ReleaseInputForTest();
    float end=Time.realtimeSinceStartup+15;
    while(!e.IsDead&&Time.realtimeSinceStartup<end){p.ProcessButtons(hero!=0||!p.IsCharging||p.Charge01<.85f,false,false,e.HitPoint);yield return null;}
    p.ProcessButtons(false,false,false,e.HitPoint);yield return Shot("combat-"+hero+"-"+(bee?"bee":"slime"));Check(e.IsDead,"Hero "+hero+" held J hits and defeats ordinary "+(bee?"bee":"slime")+" through actual combat");
   }
   samples.Add(new HuntSample{hero=hero,kills=a.State.kills,seconds=Time.realtimeSinceStartup-started});
  }
  session.NewGame("Performance",0);ClearUI();p.TestControl=true;a.TestFreezeEnemies=false;a.Population.enabled=true;p.Teleport(a.Sites[0]);a.Population.ResetPopulation();a.StartEvent(0);Camera.main.GetComponent<PlaygroundView>().Snap();yield return Wait(3);
  var frames=new List<float>();int peak=0;float beganSample=Time.realtimeSinceStartup,previous=beganSample;while(Time.realtimeSinceStartup-beganSample<15){p.ProtectArrival();peak=Math.Max(peak,a.Enemies.Values.Count(e=>e.gameObject.activeSelf&&!e.IsDead));yield return null;float now=Time.realtimeSinceStartup;frames.Add(now-previous);previous=now;}
  float elapsed=Time.realtimeSinceStartup-beganSample;frames.Sort();var m=new PopulationMetrics{attacks=samples.ToArray(),width=Screen.width,height=Screen.height,peakPopulation=peak,fps=frames.Count/elapsed,p95FrameMs=frames[(int)(frames.Count*.95f)]*1000};File.WriteAllText(Path.Combine(folder,"population-metrics.json"),JsonUtility.ToJson(m,true));Check(peak<=16,"Ordinary population plus optional event obeys the 16-enemy budget");Check(!p.IsDead,"Performance scene stays active throughout sampling");yield return Shot("population-performance");Finish(null);
 }
}
}
