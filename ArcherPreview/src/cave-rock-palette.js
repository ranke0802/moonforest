// Broad, low-contrast mineral planes. Texture detail stays in the original UV
// of each authored rock; a packed UV atlas is never tiled across world space.
export const CAVE_ROCK_UV_DETAIL=.25;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function caveRockAlbedo(position,normal={x:0,y:1,z:0}){
 const p=position,s=.5+.5*Math.sin(p.y*.28+p.x*.08+p.z*.04),w=.5+.5*Math.sin(p.x*.11-p.z*.09+p.y*.035);
 const blend=s*.55+w*.2,n=Math.hypot(normal.x,normal.y,normal.z)||1;
 const facing=(-.35*normal.x+.78*normal.y-.52*normal.z)/(Math.hypot(-.35,.78,-.52)*n);
 const band=.62+.27*smooth(-.32,.18,facing)+.19*smooth(.32,.72,facing);
 return [.24+(.30-.24)*blend,.23+(.275-.23)*blend,.235+(.25-.235)*blend].map(v=>v*band);
}
export const CAVE_ROCK_PALETTE_GLSL=`
#ifndef CAVE_ROCK_SURFACE
#define CAVE_ROCK_SURFACE
vec3 caveRockAlbedo(vec3 p,vec3 normal){
 float strata=.5+.5*sin(p.y*.28+p.x*.08+p.z*.04);
 float weather=.5+.5*sin(p.x*.11-p.z*.09+p.y*.035);
 vec3 rock=mix(vec3(.24,.23,.235),vec3(.30,.275,.25),strata*.55+weather*.2);
 float facing=dot(normalize(normal),normalize(vec3(-.35,.78,-.52)));
 float band=.62+.27*smoothstep(-.32,.18,facing)+.19*smoothstep(.32,.72,facing);
 return rock*band;
}
// Preserve authored UV colour variation without letting baked black cavities
// read as a field of drilled holes. The bound is relative to the broad plane,
// so a lamp still reveals geometry, not an unlit flat replacement wallpaper.
vec3 caveRockPaintedDetail(vec3 broad,vec3 painted){
 return max(painted,broad*.55);
}
// Used only for unsubmitted-room enclosure/memory after image processing.
// Actual visible rock uses linear albedo and the static lamp illumination.
vec3 caveRockShade(vec3 p,vec3 normal,float explored){
 return caveRockAlbedo(p,normal)*mix(.12,.17,smoothstep(.05,.95,explored));
}
#endif
`;
