// A small environment-only lantern contribution. This changes no Babylon
// light, shadow, texture, material colour or player/boss style option.
export const CAVE_PLAYER_FILL=Object.freeze({radius:5.5,core:.75,color:Object.freeze([.90,.66,.38]),visibleStart:.92,visibleFull:.995});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function cavePlayerFillFactor(position,player,lanternVisibility=0){
 if(!player||!(player.w>0)||![position.x,position.y,position.z,player.x,player.y,player.z,lanternVisibility].every(Number.isFinite))return [0,0,0];
 const c=CAVE_PLAYER_FILL,d=Math.hypot(position.x-player.x,position.y-player.y,position.z-player.z);
 const weight=(1-smooth(c.core,c.radius,d))*smooth(c.visibleStart,c.visibleFull,lanternVisibility);
 return c.color.map(value=>value*weight);
}
export const CAVE_PLAYER_FILL_GLSL=`
vec3 cavePlayerFillFactor(vec3 p,float lanternVisibility){
 if(cavePaintPlayer.w<.5)return vec3(0.);
 float distanceToPlayer=length(p-cavePaintPlayer.xyz);
 float strength=(1.-smoothstep(${CAVE_PLAYER_FILL.core.toFixed(2)},${CAVE_PLAYER_FILL.radius.toFixed(1)},distanceToPlayer))*smoothstep(${CAVE_PLAYER_FILL.visibleStart.toFixed(2)},${CAVE_PLAYER_FILL.visibleFull.toFixed(3)},lanternVisibility);
 return vec3(.90,.66,.38)*strength;
}
`;
