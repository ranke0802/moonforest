// The camera guard keeps the eye inside the chamber. Only a narrow emergency
// sight line remains; zoom and a giant boss never carve a tunnel through rooms.
export const CAVE_FOG_START=22;
export const CAVE_FOG_END=48;
export const CAVE_VIEW_UNIFORMS='uniform vec4 cavePlayerView;uniform vec4 caveBossView;';
export const CAVE_VIEW_GLSL=`
bool caveViewCorridor(vec3 point,vec3 eye,vec3 focus,float endRadius,float floorDepth){
 vec3 sight=focus-eye;float length2=max(dot(sight,sight),.001);
 float along=dot(point-eye,sight)/length2;
 if(along<.0001||along>.98||point.y<focus.y-floorDepth)return false;
 float radius=mix(.25,endRadius,along);
 return distance(point,eye+sight*along)<radius;
}
bool caveForegroundCutaway(vec3 point,vec3 eye,vec3 focus){
 vec3 player=cavePlayerView.w>.5?cavePlayerView.xyz:focus;
 return caveViewCorridor(point,eye,player,.65,.55);
}
bool caveTerrainCutaway(vec3 point,vec3 normal,vec3 eye,vec3 focus){
 return abs(normalize(normal).y)<.45&&caveForegroundCutaway(point,eye,focus);
}`;
export function caveViewCorridor(point,eye,focus,endRadius,floorDepth){
 const x=focus.x-eye.x,y=focus.y-eye.y,z=focus.z-eye.z;
 const along=((point.x-eye.x)*x+(point.y-eye.y)*y+(point.z-eye.z)*z)/Math.max(x*x+y*y+z*z,.001);
 if(along<.0001||along>.98||point.y<focus.y-floorDepth)return false;
 const radius=.25+(endRadius-.25)*along;
 return Math.hypot(point.x-eye.x-x*along,point.y-eye.y-y*along,point.z-eye.z-z*along)<radius;
}
export function caveForegroundCutaway(point,eye,focus,{player=focus,boss=null}={}){
 return caveViewCorridor(point,eye,player,.65,.55);
}
export function caveTerrainCutaway(point,normal,eye,focus,options){
 return Math.abs(normal.y)/Math.max(1e-10,Math.hypot(normal.x,normal.y,normal.z))<.45&&caveForegroundCutaway(point,eye,focus,options);
}
