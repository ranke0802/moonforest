using UnityEngine;
namespace WitchPlayground {
public sealed partial class RpgUI {
 static readonly Color FocusInk=new Color(.13f,.035f,.23f,1);
 static readonly Color FocusLight=new Color(.24f,1f,.85f,1);
 static readonly Color FocusWhite=new Color(.94f,1f,.98f,1);
 void FocusFill(Rect r,Color c){GUI.color=c;GUI.DrawTexture(r,Texture2D.whiteTexture);}
 void FocusStroke(Rect r,float width,Color c){
  FocusFill(new Rect(r.x,r.y,r.width,width),c);FocusFill(new Rect(r.x,r.yMax-width,r.width,width),c);
  FocusFill(new Rect(r.x,r.y+width,width,r.height-width*2),c);FocusFill(new Rect(r.xMax-width,r.y+width,width,r.height-width*2),c);
 }
 void DrawFocusFrame(Rect r,bool card){
  Color old=GUI.color;
  var outer=new Rect(r.x-7,r.y-7,r.width+14,r.height+14);
  FocusStroke(outer,9,FocusInk);
  FocusStroke(new Rect(r.x-4,r.y-4,r.width+8,r.height+8),4,FocusLight);
  if(card){
   // Pixel jewel corners and a labeled tab remain legible against gold parchment artwork.
   for(int x=0;x<2;x++)for(int y=0;y<2;y++){
    float px=x==0?r.x:r.xMax,py=y==0?r.y:r.yMax;
    FocusFill(new Rect(px-8,py-8,16,16),FocusInk);
    FocusFill(new Rect(px-5,py-5,10,10),FocusLight);
    FocusFill(new Rect(px-2,py-2,4,4),FocusWhite);
   }
   var tab=new Rect(r.center.x-67,r.y-20,134,29);
   FocusFill(tab,FocusInk);FocusStroke(tab,2,FocusLight);
   GUI.color=Color.white;
   var style=new GUIStyle(center){fontSize=14};style.normal.textColor=FocusWhite;
   Text(tab,Loc.T("선택 중 · E/J","SELECTED · E/J","選択中 · E/J"),style);
  }else{
   FocusStroke(new Rect(r.x,r.y,r.width,r.height),1,FocusWhite);
  }
  GUI.color=old;
 }
 void DrawCardFocus(Rect card,Rect button){
  if(menuCollect&&GUI.enabled&&menuFocused&&SameRect(button,menuFocus)&&Event.current.type==EventType.Repaint)DrawFocusFrame(card,true);
 }
}
}
