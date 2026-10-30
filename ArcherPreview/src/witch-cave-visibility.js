// A perspective-scaled opening protects the play area as the camera pulls back.
// Only foreground fragments are cut; FoW still rejects the rooms behind them.
export const CAVE_FOG_START=22;
export const CAVE_FOG_END=48;
export const CAVE_VIEW_UNIFORMS='uniform vec4 cavePlayerView;uniform vec4 caveBossView;';
export const CAVE_VIEW_GLSL=`
bool caveViewCorridor(vec3 point,vec3 eye,vec3 focus,float endRadius,float floorDepth){
 vec3 sight=focus-eye;float length2=max(dot(sight,sight),.001);
 float along=dot(point-eye,sight)/length2;
 if(along<.0001||along>.98||point.y<focus.y-floorDepth)return false;
 float radius=mix(.85,endRadius,along);
 return distance(point,eye+sight*along)<radius;
}
bool caveForegroundCutaway(vec3 point,vec3 eye,vec3 focus){
 vec3 player=cavePlayerView.w>.5?cavePlayerView.xyz:focus;
 float radius=clamp(length(player-eye)*.24,2.2,12.);
 if(caveViewCorridor(point,eye,player,radius,.65))return true;
 return caveBossView.w>0.&&caveViewCorridor(point,eye,caveBossView.xyz,caveBossView.w,caveBossView.w*.55);
}`;
export function caveViewCorridor(point,eye,focus,endRadius,floorDepth){
 const x=focus.x-eye.x,y=focus.y-eye.y,z=focus.z-eye.z;
 const along=((point.x-eye.x)*x+(point.y-eye.y)*y+(point.z-eye.z)*z)/Math.max(x*x+y*y+z*z,.001);
 if(along<.0001||along>.98||point.y<focus.y-floorDepth)return false;
 const radius=.85+(endRadius-.85)*along;
 return Math.hypot(point.x-eye.x-x*along,point.y-eye.y-y*along,point.z-eye.z-z*along)<radius;
}
export function caveForegroundCutaway(point,eye,focus,{player=focus,boss=null}={}){
 const radius=Math.max(2.2,Math.min(12,Math.hypot(player.x-eye.x,player.y-eye.y,player.z-eye.z)*.24));
 return caveViewCorridor(point,eye,player,radius,.65)||!!(boss?.w>0&&caveViewCorridor(point,eye,boss,boss.w,boss.w*.55));
}
