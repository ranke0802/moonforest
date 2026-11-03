// Existing route centre on the safe east approach to Elena's current dwelling.
// This is a destination only; teleporting here never resets or summons a boss.
export const ELENA_SANCTUARY_WAYPOINT=Object.freeze({
 id:'elena-sanctuary',map:'witch-cave',character:'warrior-v5',label:'비탄의 성소',
 position:Object.freeze({x:39,z:-19}),
});

export function travelWaypoint(url){
 const params=typeof url==='string'?new URL(url).searchParams:url?.searchParams;
 return params?.get('character')===ELENA_SANCTUARY_WAYPOINT.character&&params.get('waypoint')===ELENA_SANCTUARY_WAYPOINT.id?ELENA_SANCTUARY_WAYPOINT:null;
}
