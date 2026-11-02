// A small environment-only lantern contribution. This changes no Babylon
// light, shadow, texture, material colour or player/boss style option.
export const CAVE_PLAYER_FILL=Object.freeze({radius:6.5,core:.75,range:10.5,coneCore:2,innerCos:Math.cos(28*Math.PI/180),outerCos:Math.cos(50*Math.PI/180),color:Object.freeze([.90,.66,.38]),visibleStart:.92,visibleFull:.995});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function cavePlayerFillFactor(position,player,lanternVisibility=0,forward={x:0,z:1}){
 if(!player||!(player.w>0)||![position.x,position.y,position.z,player.x,player.y,player.z,lanternVisibility].every(Number.isFinite))return [0,0,0];
 const c=CAVE_PLAYER_FILL,d=Math.hypot(position.x-player.x,position.y-player.y,position.z-player.z);
 const dx=position.x-player.x,dz=position.z-player.z,flat=Math.hypot(dx,dz),length=Math.hypot(forward.x,forward.z);
 const cosine=flat>.001&&length>.001?(dx*forward.x+dz*forward.z)/(flat*length):0;
 const cone=(1-smooth(c.coneCore,c.range,d))*smooth(c.outerCos,c.innerCos,cosine);
 const weight=Math.max(1-smooth(c.core,c.radius,d),cone)*smooth(c.visibleStart,c.visibleFull,lanternVisibility);
 return c.color.map(value=>value*weight);
}
export const CAVE_PLAYER_FILL_GLSL=`
vec3 cavePlayerFillFactor(vec3 p,float lanternVisibility){
 if(cavePaintPlayer.w<.5)return vec3(0.);
 float distanceToPlayer=length(p-cavePaintPlayer.xyz);
 vec2 offset=p.xz-cavePaintPlayer.xz;
 float direction=dot(offset,cavePaintForward.xz)/max(.001,length(offset));
 float cone=(1.-smoothstep(${CAVE_PLAYER_FILL.coneCore.toFixed(1)},${CAVE_PLAYER_FILL.range.toFixed(1)},distanceToPlayer))*smoothstep(${CAVE_PLAYER_FILL.outerCos.toFixed(8)},${CAVE_PLAYER_FILL.innerCos.toFixed(8)},direction);
 float strength=max(1.-smoothstep(${CAVE_PLAYER_FILL.core.toFixed(2)},${CAVE_PLAYER_FILL.radius.toFixed(1)},distanceToPlayer),cone)*smoothstep(${CAVE_PLAYER_FILL.visibleStart.toFixed(2)},${CAVE_PLAYER_FILL.visibleFull.toFixed(3)},lanternVisibility);
 return vec3(.90,.66,.38)*strength;
}
`;
