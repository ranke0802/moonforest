using UnityEngine;
using System.Collections;
namespace WitchPlayground {
public sealed partial class AdventureVerification {
 void MenuKey(RpgUI ui,KeyCode key){ui.MenuKeyEvent(new Event{type=EventType.KeyDown,keyCode=key});ui.MenuKeyEvent(new Event{type=EventType.KeyUp,keyCode=key});}
 IEnumerator FreeMenuVerification(){session.NewGame("JournalTest",0);p.TestControl=true;a.TestFreezeEnemies=true;SafeMenus();yield return Wait(.3f);var ui=RpgUI.Instance;
  a.TalkGuide();yield return Wait(.2f);ui.ConfirmMenu();yield return Wait(.2f);Check(a.State.mainAccepted&&ui.ActiveWindow==RpgUI.Window.None,"Default journal action accepts Lumi's request with one confirmation");
  ui.OpenJournal(1);yield return Wait(.2f);ui.ConfirmMenu();yield return Wait(.2f);Check(a.Quests.State.jobs[0].active,"Hunt acceptance works through default keyboard focus");ui.NavigateMenu(Vector2.down);yield return Wait(.1f);ui.NavigateMenu(Vector2.down);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(a.Quests.State.jobs[1].active,"WASD/arrow navigation can accept a second hunt");ui.Close();
  stats.GainXP(stats.NeededXP);yield return Wait(.2f);Check(!RpgUI.Blocking,"Stored growth does not block movement");ui.TryOpenGrowth();yield return Wait(.2f);MenuKey(ui,KeyCode.D);yield return Wait(.1f);yield return Shot("growth-wasd");MenuKey(ui,KeyCode.J);yield return Wait(.2f);Check(stats.PendingChoices==0&&ui.ActiveWindow==RpgUI.Window.None,"D and J choose a stored level-up and resume play");
  a.State.relicRewards=1;a.ApplyWorld();ui.OpenJournal(2);yield return Wait(.2f);MenuKey(ui,KeyCode.D);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(a.Relics.Owns(1),"Relic card navigation selects the second reward");ui.Close();
  ui.Open(RpgUI.Window.Bag);yield return Wait(.2f);bool equipped=stats.Equipped;ui.ConfirmMenu();yield return Wait(.2f);Check(stats.Equipped!=equipped,"Existing inventory equipment selection still works");ui.Close();
  ui.Open(RpgUI.Window.Pause);yield return Wait(.2f);ui.ConfirmMenu();yield return Wait(.2f);Check(ui.ActiveWindow==RpgUI.Window.None,"Existing pause default resumes game");Finish(null);
 }
 IEnumerator NativeFreeMenu(){session.NewGame("NativeHunt",0);ClearUI();p.TestControl=false;a.TestFreezeEnemies=true;SafeMenus();p.Teleport(AdventureProgress.Safe(a.Guide+Vector3.right*1.2f));yield return Wait(.5f);Debug.Log("NATIVE_WORLD_E_READY node="+(a.Near?a.Near.Id:"none")+" npc="+(p.GetComponent<ForestInteraction>().Near?p.GetComponent<ForestInteraction>().Near.Name:"none"));float end=Time.realtimeSinceStartup+25;while(!a.State.mainAccepted&&Time.realtimeSinceStartup<end)yield return null;Check(a.State.mainAccepted,"Physical E opens Lumi, then fresh E accepts survey");
  SafeMenus();p.Teleport(a.Camp+Vector3.left*6);stats.GainXP(stats.NeededXP);yield return Wait(.4f);Debug.Log("NATIVE_GROWTH_READY");end=Time.realtimeSinceStartup+20;while(stats.PendingChoices>0&&Time.realtimeSinceStartup<end)yield return null;Check(stats.PendingChoices==0,"Physical E opens stored growth, D/A/right/J chooses it");yield return Wait(.3f);Check(p.ShotsFired==0,"Menu confirmation does not leak into attacks");yield return Shot("native-journal");Finish(null);
 }
}
}
