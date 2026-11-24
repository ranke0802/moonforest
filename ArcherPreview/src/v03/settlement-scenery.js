import {villageToPlains,VILLAGE_PLAINS_BOUNDARY} from '../village-plains-boundary.js';
import {villageHeight} from '../village-terrain.js';
import vistaModels from './gate-vista-assets.json' with {type:'json'};
import {COLLIDER_SHAPES} from '../village-layout-base.js';

// Seven cliff buttresses were planted at sea level. These four either pierce
// the bear's fighting shelf or place an invisible solid underneath its path.
// The three outlying buttresses and the independent cliff-edge guard remain.
const summitRocks = new Set(['lookout-rock-0','lookout-rock-1','lookout-rock-2','lookout-rock-5']);
const excludedVillagePlacements = new Set([
  'tree-01-round-oak-129','rail-fence-533','handcart-553', // Footprint of the inn addition.
  // All four shipped meshes of this vista copy are at least 2.57m below the outskirts terrain.
  'village-plains-outskirts-lookout-rock-5',
]);
const extensions = new WeakMap();
const immutableBases = new WeakMap();

// .moonmap revisions identify the exact editor layout. A gameplay-only overlay
// has the same base, but developer replacements and test maps keep their own.
export const settlementBase = placements => immutableBases.get(placements) ?? placements;

function structure(id,asset,x,z,yaw,kind,scale=1) {
  return {id,asset,x,z,yaw,kind,scale,...COLLIDER_SHAPES[asset]};
}

export const villageGate = [];
for (const side of [-1,1]) {
  const wing = side < 0 ? 'west' : 'east';
  villageGate.push(structure('v03-gate-'+wing+'-tower','watchtower',side*5.4,55.7,
    side*.13,'tower',.94));
  // Two slightly angled lengths turn back towards the forest and existing wall.
  for (const [index,distance,z,angle] of [[1,8.8,55.6,.15],[2,12.55,54.67,.33]]) {
    const section=structure('v03-gate-'+wing+'-stockade-'+index,'wood-01-palisade',
      side*distance,z,side*angle,'wall');
    section.length=4;
    section.footprint=[4,.64];
    villageGate.push(section);
  }
}

// The tall timber house becomes the guest wing of home-18's existing broad,
// low workshop roof. Its east-facing frontage opens onto the innkeeper's lane.
const inn = structure('v03-moonlight-inn-guest-wing','house-02-tall-home',-8.65,11.45,
  Math.PI/2,'building',1.05);
// The plains only ever instantiates the existing far meshes. Identical URLs
// at all three demand tiers are coalesced by hasVillageGeometry().
export const plainsGateAssets=Object.fromEntries(Object.entries(vistaModels).map(([id,{far,...shape}])=>{
  const lods=[0,1,2].map(level=>({...far,level}));
  return [id,{...shape,category:'background',geometryLod:true,lods,mobileNear:lods[0]}];
}));
const farGate = villageGate.map(p=>{
  const {x,z}=villageToPlains(p);
  const half=(p.length??0)/2,dx=Math.cos(p.yaw)*half,dz=-Math.sin(p.yaw)*half;
  const elevation=Math.min(villageHeight(p.x,p.z),villageHeight(p.x+dx,p.z+dz),villageHeight(p.x-dx,p.z-dz));
  return {...p,id:'vista-'+p.id,x,z,yaw:p.yaw+VILLAGE_PLAINS_BOUNDARY.yaw,elevation,
    decorative:true,background:true,colliderFootprint:undefined,colliderRadius:0};
});

export function settlementPlacements(mapId,base) {
  if(mapId!=='village'&&mapId!=='great-plains')return base;
  let result=extensions.get(base);
  if(!result) {
    result=mapId==='village'
      ? [...base.filter(p=>!excludedVillagePlacements.has(p.id)),inn,...villageGate]
      : [...base.filter(p=>!summitRocks.has(p.id)),...farGate];
    extensions.set(base,result);
    immutableBases.set(result,base);
  }
  return result;
}
