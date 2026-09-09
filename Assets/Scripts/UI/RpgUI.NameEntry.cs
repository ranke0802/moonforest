using UnityEngine;
namespace WitchPlayground {
public sealed partial class RpgUI {
 string submittedName,visibleName,pendingName,pendingBase;bool nameFocused;
 public static string ComposeName(string text,string composition,int cursor,int selection){text=text??"";if(string.IsNullOrEmpty(composition))return text;int start=Mathf.Clamp(Mathf.Min(cursor,selection),0,text.Length),end=Mathf.Clamp(Mathf.Max(cursor,selection),start,text.Length);return text.Remove(start,end-start).Insert(start,composition);}
 // macOS clears composition before IMGUI receives the click. Retain it until committed or explicitly cancelled.
 void TrackName(string composition,int cursor,int selection,bool cancel){
  if(cancel){pendingName=pendingBase=null;}
  if(!string.IsNullOrEmpty(composition)){pendingBase=entered;pendingName=ComposeName(entered,composition,cursor,selection);}
  else if(pendingName!=null&&entered!=pendingBase){pendingName=pendingBase=null;}
  visibleName=pendingName??entered;
 }
 void DrawNameEntry(Rect rect,Rect submit,GUIStyle style){
  var e=Event.current;bool exit=nameFocused&&e.type==EventType.KeyDown&&(e.keyCode==KeyCode.Return||e.keyCode==KeyCode.KeypadEnter||e.keyCode==KeyCode.Tab||e.keyCode==KeyCode.UpArrow||e.keyCode==KeyCode.DownArrow);
  if(exit){entered=pendingName??visibleName??entered;pendingName=pendingBase=null;visibleName=entered;nameFocused=false;GUI.FocusControl(null);Input.imeCompositionMode=IMECompositionMode.Off;menuFocus=submit;menuFocused=true;e.Use();}
  if(e.type==EventType.MouseDown&&submit.Contains(e.mousePosition))submittedName=pendingName??visibleName??entered;
  bool cancel=e.type==EventType.KeyDown&&(e.keyCode==KeyCode.Escape||e.keyCode==KeyCode.Backspace||e.keyCode==KeyCode.Delete);
  GUI.SetNextControlName("character_name");entered=GUI.TextField(rect,entered,12,style);nameFocused=GUI.GetNameOfFocusedControl()=="character_name";
  if(nameFocused){var editor=(TextEditor)GUIUtility.GetStateObject(typeof(TextEditor),GUIUtility.keyboardControl);TrackName(Input.compositionString,editor.cursorIndex,editor.selectIndex,cancel);Input.compositionCursorPos=new Vector2(rect.x*scale,rect.yMax*scale);}
  else if(submittedName==null){TrackName("",0,0,false);}
  if(MenuControl(rect)){GUI.FocusControl("character_name");nameFocused=true;Input.imeCompositionMode=IMECompositionMode.On;}
 }
 string ConfirmedName(){string name=submittedName??pendingName??visibleName??entered;submittedName=pendingName=pendingBase=null;entered=visibleName=name;nameFocused=false;GUI.FocusControl(null);Input.imeCompositionMode=IMECompositionMode.Off;return name;}
}
}
