using UnityEngine;
namespace WitchPlayground {
public sealed partial class RpgUI {
 string pendingName,pendingBase;bool nameFocused;TextEditor nameEditor;bool swallowNameExitKey;
 public static string ComposeName(string text,string composition,int cursor,int selection){text=text??"";if(string.IsNullOrEmpty(composition))return text;int start=Mathf.Clamp(Mathf.Min(cursor,selection),0,text.Length),end=Mathf.Clamp(Mathf.Max(cursor,selection),start,text.Length);return text.Remove(start,end-start).Insert(start,composition);}
 // macOS may clear composition before the mouse/submit event reaches IMGUI.
 // Keep the marked text until the editor commits it, or the user explicitly deletes/cancels it.
 void TrackName(string composition,int cursor,int selection,bool cancel){
  if(cancel){pendingName=pendingBase=null;}
  if(!string.IsNullOrEmpty(composition)){pendingBase=entered;pendingName=ComposeName(entered,composition,cursor,selection);}
  else if(pendingName!=null&&entered!=pendingBase){pendingName=pendingBase=null;}
 }
 void CommitNameEdit(bool blur){
  string value=pendingName??entered;
  pendingName=pendingBase=null;
  if(blur){GUI.FocusControl(null);GUIUtility.keyboardControl=0;nameFocused=false;Input.imeCompositionMode=IMECompositionMode.Off;}
  // Updating only the submitted value leaves the IMGUI editor one character behind.
  // Synchronize its backing text as well, so refocusing and further edits retain the name.
  entered=value;
  if(nameEditor!=null){nameEditor.text=value;nameEditor.cursorIndex=nameEditor.selectIndex=value.Length;}
 }
 static bool NameExitKey(KeyCode key)=>key==KeyCode.Return||key==KeyCode.KeypadEnter||key==KeyCode.Tab||key==KeyCode.UpArrow||key==KeyCode.DownArrow;
 void PrepareNameEntry(Rect rect,Rect submit){
  var e=Event.current;
  // macOS sends Tab twice: a key event followed by a character event (keyCode None).
  bool exitKey=e.rawType==EventType.KeyDown&&(NameExitKey(e.keyCode)||e.character=='\t'||e.character=='\r'||e.character=='\n');
  bool exit=nameFocused&&exitKey;
  bool pointer=e.rawType==EventType.MouseDown;
  bool outside=(nameFocused||pendingName!=null)&&pointer&&!rect.Contains(e.mousePosition);
  if(exit||outside){CommitNameEdit(true);if(exit){swallowNameExitKey=true;menuFocus=submit;menuFocused=true;}}
  else if(nameFocused&&pointer&&pendingName!=null&&string.IsNullOrEmpty(Input.compositionString))CommitNameEdit(false);
  if(swallowNameExitKey&&exitKey)e.Use();
  if(e.rawType==EventType.KeyUp&&NameExitKey(e.keyCode))swallowNameExitKey=false;
 }
 void DrawNameEntry(Rect rect,Rect submit,GUIStyle style){
  var e=Event.current;bool wasFocused=nameFocused;
  bool cancel=e.type==EventType.KeyDown&&(e.keyCode==KeyCode.Escape||e.keyCode==KeyCode.Backspace||e.keyCode==KeyCode.Delete);
  GUI.SetNextControlName("character_name");entered=GUI.TextField(rect,entered,12,style);nameFocused=GUIUtility.keyboardControl!=0&&GUI.GetNameOfFocusedControl()=="character_name";
  if(wasFocused&&!nameFocused&&pendingName!=null)CommitNameEdit(true);
  if(nameFocused){nameEditor=(TextEditor)GUIUtility.GetStateObject(typeof(TextEditor),GUIUtility.keyboardControl);TrackName(Input.compositionString,nameEditor.cursorIndex,nameEditor.selectIndex,cancel);Input.compositionCursorPos=new Vector2(rect.x*scale,rect.yMax*scale);}
  if(MenuControl(rect)){GUI.FocusControl("character_name");nameFocused=true;Input.imeCompositionMode=IMECompositionMode.On;}
 }
 string ConfirmedName(){CommitNameEdit(true);return entered;}
}
}
