// A narrow foreground opening protects the player without making an entire
// rock transparent or revealing the room behind it. Shared by base and ink.
export const CAVE_FOG_START=22;
export const CAVE_FOG_END=48;
export const CAVE_VIEW_GLSL=`
bool caveForegroundCutaway(vec3 point,vec3 eye,vec3 focus){
 vec3 sight=focus-eye;float length2=max(dot(sight,sight),.001);
 float along=dot(point-eye,sight)/length2;
 if(along<.015||along>.98||point.y<focus.y-.65)return false;
 float radius=mix(.65,1.15,along);
 return distance(point,eye+sight*along)<radius;
}`;
export function caveForegroundCutaway(point,eye,focus){
 const x=focus.x-eye.x,y=focus.y-eye.y,z=focus.z-eye.z;
 const along=((point.x-eye.x)*x+(point.y-eye.y)*y+(point.z-eye.z)*z)/Math.max(x*x+y*y+z*z,.001);
 if(along<.015||along>.98||point.y<focus.y-.65)return false;
 return Math.hypot(point.x-eye.x-x*along,point.y-eye.y-y*along,point.z-eye.z-z*along)<.65+.5*along;
}
