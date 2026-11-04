// Metadata only: accessor counts/bounds and node transforms never decode model
// buffers, create textures, initialize Babylon or allocate GPU resources.
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function multiply(a,b){const out=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function matrix(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation??[0,0,0,1],[sx,sy,sz]=node.scale??[1,1,1],[tx,ty,tz]=node.translation??[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
const triangleCount=(gltf,primitive)=>{
  const count=gltf.accessors?.[primitive.indices??primitive.attributes?.POSITION]?.count??0,mode=primitive.mode??4;
  if(mode===4){if(count%3)throw new Error('Triangle primitive count is not divisible by3');return count/3;}
  return mode===5||mode===6?Math.max(0,count-2):0;
};
export function gltfCatalogMetadata(gltf){
  const meshes=gltf.meshes??[],nodes=gltf.nodes??[],skins=gltf.skins??[];
  const meshTriangles=meshes.map(mesh=>mesh.primitives.reduce((sum,p)=>sum+triangleCount(gltf,p),0));
  const positions=new Set(meshes.flatMap(mesh=>mesh.primitives.map(p=>p.attributes?.POSITION)).filter(i=>i!==undefined));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],seen=new Set();let triangles=0,renderNodes=0;
  const childNodes=new Set(nodes.flatMap(n=>n.children??[])),roots=gltf.scenes?.[gltf.scene??0]?.nodes??nodes.map((_,i)=>i).filter(i=>!childNodes.has(i));
  function visit(index,parent){
    if(seen.has(index))return;seen.add(index);const node=nodes[index];if(!node)return;
    const world=multiply(parent,matrix(node));
    if(node.mesh!==undefined){
      triangles+=meshTriangles[node.mesh]??0;renderNodes++;
      for(const primitive of meshes[node.mesh]?.primitives??[]){
        const a=gltf.accessors?.[primitive.attributes?.POSITION];if(!a?.min||!a?.max)continue;
        for(let bits=0;bits<8;bits++){
          const x=(bits&1)?a.max[0]:a.min[0],y=(bits&2)?a.max[1]:a.min[1],z=(bits&4)?a.max[2]:a.min[2];
          const point=[world[0]*x+world[4]*y+world[8]*z+world[12],world[1]*x+world[5]*y+world[9]*z+world[13],world[2]*x+world[6]*y+world[10]*z+world[14]];
          for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);}
        }
      }
    }
    for(const child of node.children??[])visit(child,world);
  }
  for(const root of roots)visit(root,identity());
  const bounds=min.every(Number.isFinite)&&max.every(Number.isFinite)?{min,max,size:max.map((v,i)=>v-min[i])}:null;
  const clipDurations=Object.fromEntries((gltf.animations??[]).filter(a=>a.name).map(a=>{
    const inputs=(a.samplers??[]).map(s=>gltf.accessors?.[s.input]),starts=inputs.map(i=>i?.min?.[0]).filter(Number.isFinite),ends=inputs.map(i=>i?.max?.[0]).filter(Number.isFinite);
    return [a.name,starts.length&&ends.length?Math.max(...ends)-Math.min(...starts):null];
  }));
  return {triangles:renderNodes?triangles:meshTriangles.reduce((a,b)=>a+b,0),uniqueMeshTriangles:meshTriangles.reduce((a,b)=>a+b,0),vertices:[...positions].reduce((sum,i)=>sum+(gltf.accessors[i]?.count??0),0),materials:(gltf.materials??[]).length,textures:(gltf.textures??[]).length,images:(gltf.images??[]).length,meshes:meshes.length,renderNodes,skinned:skins.length>0,skins:skins.length,bones:new Set(skins.flatMap(s=>s.joints??[])).size,clips:(gltf.animations??[]).length,clipNames:(gltf.animations??[]).map(a=>a.name??null),clipDurations,morphTargets:Math.max(0,...meshes.flatMap(m=>m.primitives.map(p=>p.targets?.length??0))),bounds};
}

const editableProps=new Set(['handcart','firewood','crate-barrel-cluster']);
export function catalogPlacementPolicy({assetId,category,reviewStatus,skinned=false,structural=false,baked=false}){
  const supported=editableProps.has(assetId)&&reviewStatus==='approved'&&!skinned&&!structural&&!baked;
  return {supported,collision:supported?'independent-static':structural||baked?'structural-baked':'none',baked:!!baked,scaleMin:.1,scaleMax:10,surfaces:supported?['ground','wall','ceiling','free']:[],solidSurfaces:supported?['ground']:[],reason:supported?null:skinned?'Animated actors use the actor definition/battle lifecycle, not static placement.':reviewStatus!=='approved'?'No explicit visual approval is recorded in this runtime manifest.':structural||baked?'Structural collision, support or terrain pads require a certified derived-data rebuild.':'This asset is outside the three independently certified MVP prop types.'};
}
export function catalogReductionPolicy({assetId,category,skinned=false}){
  const protectedType=['building','tree','rock','wall','fence','defense'].includes(category)||/house|chapel|tree|rock|wall|palisade|timber|wood-|fence/i.test(assetId);
  return {locked:protectedType||skinned,reason:protectedType?'Houses, trees, rocks and wooden/structural walls are excluded from reduction.':skinned?'Approved actor anatomy, skin, morphs and motion require a separate reviewed derivative.':'Any reduction must use a separate candidate ID/version and pass equivalent-view review; the approved runtime is never replaced automatically.'};
}
