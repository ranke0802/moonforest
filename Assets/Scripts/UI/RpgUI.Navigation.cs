using UnityEngine;
using System.Collections.Generic;
namespace WitchPlayground {
public sealed partial class RpgUI {
 struct MenuItem {public Rect rect;public bool close,slider;public MenuItem(Rect r,bool c,bool s){rect=r;close=c;slider=s;}}
 readonly List<MenuItem> menuItems=new List<MenuItem>(),lastMenuItems=new List<MenuItem>();
 string menuContext="",pendingContext="";Rect menuFocus,pendingRect;bool menuFocused,menuConfirm,menuCollect;float menuAdjust;Vector2 previousMenuMouse;
 bool MenuActive=>!session.Playing||ActiveWindow!=Window.None||stats.PendingChoices>0||player.IsDead;
 string MenuContext=>session.Playing+"/"+session.Creating+"/"+ActiveWindow+"/"+stats.PendingChoices+"/"+player.IsDead+"/"+(Adventure?Adventure.Stage.ToString():"");
 public bool NameEditing=>session.Creating&&nameFocused;
 public static bool MenuInputConsumed=>Instance&&Instance.menuInputFrame==Time.frameCount;
 int menuInputFrame=-1;
 bool SameRect(Rect a,Rect b)=>(a.center-b.center).sqrMagnitude<1&&Mathf.Abs(a.width-b.width)<1;
 static readonly KeyCode[] menuKeys={KeyCode.LeftArrow,KeyCode.RightArrow,KeyCode.UpArrow,KeyCode.DownArrow,KeyCode.W,KeyCode.A,KeyCode.S,KeyCode.D,KeyCode.E,KeyCode.J,KeyCode.Return,KeyCode.KeypadEnter};
 readonly HashSet<KeyCode> heldMenuKeys=new HashSet<KeyCode>();
 void MenuInput(){
  foreach(var key in menuKeys){if(Input.GetKeyUp(key))heldMenuKeys.Remove(key);if(Input.GetKeyDown(key))DispatchMenuKey(key);}
 }
 void DispatchMenuKey(KeyCode key){
  if(!MenuActive||DeveloperPanel.InputCaptured||NameEditing||!heldMenuKeys.Add(key))return;
  if(key==KeyCode.LeftArrow||key==KeyCode.A)NavigateMenu(Vector2.left);
  else if(key==KeyCode.RightArrow||key==KeyCode.D)NavigateMenu(Vector2.right);
  else if(key==KeyCode.UpArrow||key==KeyCode.W)NavigateMenu(Vector2.up);
  else if(key==KeyCode.DownArrow||key==KeyCode.S)NavigateMenu(Vector2.down);
  else ConfirmMenu();
 }
 // IMGUI can receive a native key event without a matching Update key-down sample.
 // Route both through one edge latch: never discard an unhandled menu key or confirm twice.
 public void MenuKeyEvent(Event e){
  if(System.Array.IndexOf(menuKeys,e.keyCode)<0)return;
  if(e.type==EventType.KeyUp){heldMenuKeys.Remove(e.keyCode);return;}
  if(e.type!=EventType.KeyDown||!MenuActive||NameEditing||DeveloperPanel.InputCaptured)return;
  DispatchMenuKey(e.keyCode);e.Use();
 }
 void OnApplicationFocus(bool focused){if(!focused)heldMenuKeys.Clear();}
 public void NavigateMenu(Vector2 direction){
  if(!MenuActive||lastMenuItems.Count==0||MenuContext!=menuContext)return;menuInputFrame=Time.frameCount;
  int current=lastMenuItems.FindIndex(v=>SameRect(v.rect,menuFocus));if(current<0)current=0;
  if(lastMenuItems[current].slider&&direction.x!=0){menuAdjust=direction.x*.1f;pendingContext=menuContext;return;}
  Vector2 screenDirection=new Vector2(direction.x,-direction.y);int best=-1;float score=float.MaxValue;
  for(int i=0;i<lastMenuItems.Count;i++){if(i==current)continue;Vector2 delta=lastMenuItems[i].rect.center-lastMenuItems[current].rect.center;float forward=Vector2.Dot(delta,screenDirection);if(forward<2)continue;float sideways=Mathf.Abs(delta.x*screenDirection.y-delta.y*screenDirection.x);float value=forward+sideways*3;if(value<score){score=value;best=i;}}
  if(best<0)best=(current+(direction.x<0||direction.y>0?-1:1)+lastMenuItems.Count)%lastMenuItems.Count;
  menuFocus=lastMenuItems[best].rect;menuFocused=true;GUI.FocusControl(null);ForestSound.Play("ui_select",null,.45f);
 }
 public void ConfirmMenu(){if(!MenuActive||!menuFocused||MenuContext!=menuContext)return;pendingRect=menuFocus;pendingContext=menuContext;menuConfirm=true;menuInputFrame=Time.frameCount;}
 void BeginMenu(){
  if(menuContext!=MenuContext){menuContext=MenuContext;menuFocused=false;menuConfirm=false;menuAdjust=0;lastMenuItems.Clear();}
  menuItems.Clear();menuCollect=MenuActive;
  MenuKeyEvent(Event.current);
 }
 bool MenuControl(Rect r,bool close=false,bool slider=false){
  if(!menuCollect||!GUI.enabled)return false;menuItems.Add(new MenuItem(r,close,slider));
  if((Event.current.type==EventType.MouseMove||Event.current.type==EventType.MouseDown)&&(Event.current.mousePosition-previousMenuMouse).sqrMagnitude>1&&r.Contains(Event.current.mousePosition)){menuFocus=r;menuFocused=true;}
  bool focused=menuFocused&&SameRect(r,menuFocus);
  if(focused&&Event.current.type==EventType.Repaint)DrawFocusFrame(r,false);
  if(focused&&menuConfirm&&pendingContext==menuContext&&SameRect(r,pendingRect)&&Event.current.type==EventType.Repaint){menuConfirm=false;suppressClick=true;return true;}return false;
 }
 bool MenuButton(Rect r,bool close=false){bool mouse=GUI.Button(r,GUIContent.none,GUIStyle.none);bool keyboard=MenuControl(r,close);return mouse||keyboard;}
 float MenuSlider(Rect r,float value){float result=GUI.HorizontalSlider(r,value,0,1);MenuControl(r,false,true);if(SameRect(r,menuFocus)&&pendingContext==menuContext&&Event.current.type==EventType.Repaint&&menuAdjust!=0){result=Mathf.Clamp01(result+menuAdjust);menuAdjust=0;}return result;}
 void EndMenu(){
  if(MenuActive){Color old=GUI.color;GUI.color=new Color(.16f,.065f,.22f,.97f);GUI.DrawTexture(new Rect(w/2-325,h-72,650,37),Texture2D.whiteTexture);GUI.color=old;Text(new Rect(w/2-310,h-66,620,25),NameEditing?Loc.T("이름 입력 후 Enter · 방향키/WASD로 이동","Enter after typing · Arrows/WASD to navigate","名前を入力してEnter · 矢印/WASDで選択"):Loc.T("방향키 / WASD 선택 · E / J 확정 · Esc 뒤로","Arrows / WASD: select · E / J: confirm · Esc: back","矢印 / WASDで選択 · E / Jで決定 · Escで戻る"),new GUIStyle(center){fontSize=14},true);}
  Text(new Rect(w-190,2,180,20),"v"+Application.version,new GUIStyle(small){alignment=TextAnchor.MiddleRight},true);
  if(Event.current.type==EventType.Repaint){lastMenuItems.Clear();lastMenuItems.AddRange(menuItems);if(!menuFocused||!menuItems.Exists(v=>SameRect(v.rect,menuFocus))){int first=menuItems.FindIndex(v=>!v.close);if(first<0&&menuItems.Count>0)first=0;if(first>=0){menuFocus=menuItems[first].rect;menuFocused=true;}}previousMenuMouse=Event.current.mousePosition;}
 }
}
}
