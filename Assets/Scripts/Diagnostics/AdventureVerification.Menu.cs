using UnityEngine;
using System;
using System.Collections;
namespace WitchPlayground {
public sealed partial class AdventureVerification {
 void MenuKey(RpgUI ui,KeyCode key){ui.MenuKeyEvent(new Event{type=EventType.KeyDown,keyCode=key});ui.MenuKeyEvent(new Event{type=EventType.KeyUp,keyCode=key});}
 IEnumerator MenuVerification(){
  session.NewGame("MenuTest",0);ClearUI();p.TestControl=true;var ui=RpgUI.Instance;yield return Wait(.25f);
  a.TalkGuide();yield return Wait(.2f);ui.ConfirmMenu();yield return Wait(.2f);Check(a.Stage==AdventureStage.Road&&ui.ActiveWindow==RpgUI.Window.None,"E/J confirmation accepts guide quest and closes dialogue");
  // Exercise the event path independently of Input.GetKeyDown, including held-key repetition.
  stats.GainXP(stats.NeededXP);yield return Wait(.2f);
  ui.MenuKeyEvent(new Event{type=EventType.KeyDown,keyCode=KeyCode.RightArrow});
  ui.MenuKeyEvent(new Event{type=EventType.KeyUp,keyCode=KeyCode.RightArrow});
  ui.MenuKeyEvent(new Event{type=EventType.KeyDown,keyCode=KeyCode.J});yield return Wait(.2f);
  Check(stats.PendingChoices==0,"IMGUI-only arrow and J events advance level-up without a polled key-down");
  stats.GainXP(stats.NeededXP);yield return Wait(.2f);
  ui.MenuKeyEvent(new Event{type=EventType.KeyDown,keyCode=KeyCode.J});yield return Wait(.2f);
  Check(stats.PendingChoices==1,"Held confirmation cannot choose again in a newly opened menu");
  ui.MenuKeyEvent(new Event{type=EventType.KeyUp,keyCode=KeyCode.J});
  ui.MenuKeyEvent(new Event{type=EventType.KeyDown,keyCode=KeyCode.J});yield return Wait(.2f);
  ui.MenuKeyEvent(new Event{type=EventType.KeyUp,keyCode=KeyCode.J});
  Check(stats.PendingChoices==0,"Releasing and pressing confirmation advances the next choice");
  ui.Open(RpgUI.Window.Status);yield return Wait(.2f);ui.ConfirmMenu();yield return Wait(.2f);Check(ui.ActiveWindow==RpgUI.Window.None,"Status page closes through its keyboard-selected close button");
  ui.Open(RpgUI.Window.Bag);yield return Wait(.2f);bool equipped=stats.Equipped;ui.ConfirmMenu();yield return Wait(.2f);Check(stats.Equipped!=equipped,"Inventory equipment toggles through keyboard selection");ui.ConfirmMenu();yield return Wait(.2f);Check(stats.Equipped==equipped,"Inventory equipment can be re-equipped without mouse");ui.Close();
  stats.ranks=new[]{1,1,1,1};ui.Open(RpgUI.Window.Skills);yield return Wait(.2f);MenuKey(ui,KeyCode.S);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(stats.SelectedSkill==SpellId.Meteor&&ui.ActiveWindow==RpgUI.Window.None,"S navigates down to the next spell and confirms it");
  stats.GainXP(stats.NeededXP);yield return Wait(.25f);ui.NavigateMenu(Vector2.right);yield return Wait(.1f);yield return Shot("level-keyboard-selection");ui.ConfirmMenu();yield return Wait(.25f);Check(stats.PendingChoices==0,"Level-up choice is confirmed with keyboard navigation");
  ui.Open(RpgUI.Window.Audio);yield return Wait(.2f);var music=ForestMusic.Instance;music.SetVolume(.4f);MenuKey(ui,KeyCode.D);yield return Wait(.15f);Check(Mathf.Abs(music.Volume-.5f)<.01f,"D increases audio slider volume");MenuKey(ui,KeyCode.A);yield return Wait(.15f);Check(Mathf.Abs(music.Volume-.4f)<.01f,"A decreases audio slider volume");ui.Close();yield return Wait(.1f);
  a.State.stage=AdventureStage.Reward;a.State.rewardSource=0;a.ApplyWorld();ui.Open(RpgUI.Window.Adventure);yield return Wait(.25f);MenuKey(ui,KeyCode.D);yield return Wait(.1f);yield return Shot("relic-wasd-selection");ui.ConfirmMenu();yield return Wait(.2f);Check(a.Relics.Owns(1)&&a.Stage==AdventureStage.Camp,"D selects the next relic reward and confirmation equips it");
  a.TalkGuide();yield return Wait(.2f);ui.NavigateMenu(Vector2.down);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(a.Stage==AdventureStage.Elite,"Follow-up request can be chosen without mouse");
  ui.Open(RpgUI.Window.Pause);yield return Wait(.2f);int language=Loc.Language;ui.NavigateMenu(Vector2.down);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(Loc.Language!=language&&ui.ActiveWindow==RpgUI.Window.Pause,"Pause menu language selection preserves keyboard focus");MenuKey(ui,KeyCode.W);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(ui.ActiveWindow==RpgUI.Window.None,"W navigates back up to Resume");Loc.Language=0;
  session.ShowTitleForTest();session.Creating=false;yield return Wait(.2f);ui.ConfirmMenu();yield return Wait(.2f);Check(session.Creating,"Title Start button works with keyboard confirmation");ui.NavigateMenu(Vector2.right);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(roster.Selected==1,"Character selection supports horizontal arrows and confirmation");ui.NavigateMenu(Vector2.down);yield return Wait(.1f);ui.ConfirmMenu();yield return Wait(.2f);Check(ui.NameEditing,"Name field can be focused without a mouse");foreach(var key in new[]{KeyCode.W,KeyCode.A,KeyCode.S,KeyCode.D}){var e=new Event{type=EventType.KeyDown,keyCode=key};ui.MenuKeyEvent(e);Check(e.type==EventType.KeyDown&&ui.NameEditing,"Name editing keeps "+key+" as text input");}yield return Shot("name-keyboard-focus");
  Finish(null);
 }
 IEnumerator NativeMenuVerification(){
  session.NewGame("NativeMenu",0);ClearUI();p.TestControl=false;a.TestFreezeEnemies=true;a.ApplyWorld();p.Teleport(AdventureProgress.Safe(a.Guide+Vector3.right*1.2f));p.ProtectArrival();Camera.main.GetComponent<PlaygroundView>().Snap();yield return Wait(.4f);Debug.Log("NATIVE_WORLD_E_READY");
  float end=Time.realtimeSinceStartup+25;while(a.Stage==AdventureStage.Offer&&Time.realtimeSinceStartup<end)yield return null;
  Check(a.Stage==AdventureStage.Road,"Physical E opens NPC dialogue and a fresh E accepts quest");
  stats.GainXP(stats.NeededXP);yield return Wait(.3f);Debug.Log("NATIVE_LEVEL_READY");end=Time.realtimeSinceStartup+15;while(stats.PendingChoices>0&&Time.realtimeSinceStartup<end)yield return null;
  Check(stats.PendingChoices==0,"Physical right arrow and J choose level-up reward");yield return Wait(.4f);Check(p.ShotsFired==0,"J used for a menu does not leak into a combat attack");yield return Shot("native-menu-confirmed");Finish(null);
 }
}
}
