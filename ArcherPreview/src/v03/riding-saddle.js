import { Color3, Mesh, StandardMaterial, VertexData } from '@babylonjs/core';
export const SADDLE_PAD_HEIGHT=.128;

// A riding saddle replaces the cart collar on the personal mount. Its profile
// follows cross-sections of the shipped horse. All leather, binding and irons
// share one vertex-coloured mesh and one draw without a texture or bones.
export function createRidingSaddle(root) {
  const scene=root.getScene(), mesh=new Mesh('v03-riding-saddle',scene);
  const points=[], indices=[], colors=[], normals=[];
  const leather=[.30,.14,.078], pad=[.25,.18,.22], piping=[.46,.30,.18], iron=[.46,.42,.34];
  function strip(rows, color) {
    const start=points.length/3, width=rows[0].length;
    for(const row of rows)for(const point of row){
      points.push(...point);colors.push(...color,1);
    }
    for(let r=1;r<rows.length;r++)for(let c=1;c<width;c++){
      const i=start+r*width+c;
      indices.push(i-width-1,i-1,i,i-width-1,i,i-width);
    }
  }
  // Each pair describes width and height above the animated back contact.
  const cross=[[0,.028],[.10,.023],[.19,-.006],[.25,-.06],[.30,-.12],[.334,-.22]];
  function blanketPoint(z,index) {
    const [x,y]=cross[Math.abs(index)], rim=x/.334, forward=Math.max(0,z);
    return [Math.sign(index)*x, y+forward*.55*(1-rim)+Math.max(0,-z-.16)*.15,
      z+Math.sign(z)*-.07*rim*rim];
  }
  const blanket=[-.28,-.23,-.12,0,.15,.23].map(z=>[-5,-4,-3,-2,-1,0,1,2,3,4,5].map(i=>blanketPoint(z,i)));
  strip(blanket,pad);
  for(const z of [-.263,.202]){
    strip([z,z+.014].map(at=>[-5,-4,-3,-2,-1,0,1,2,3,4,5].map(i=>{
      const [x,y,zz]=blanketPoint(at,i);return [x*1.006,y+.004,zz];
    })),piping);
  }
  // A shallow pocket with raised cantle and pommel. The seat stays within
  // the inner thighs. The long leather panels follow the outside of the ribs.
  const seat=[[-.233,.077,.035],[-.18,.151,.047],[-.11,.109,.047],
    [-.045,.048,.081],[.043,.048,.081],[.091,.104,.069],[.14,.165,.043],[.177,.132,.022]];
  const profile=[[0,0],[.045,.25],[.10,.96],[.18,1],[.216,.58]];
  const panels=seat.map(([z,base,thickness])=>[-4,-3,-2,-1,0,1,2,3,4].map(i=>{
    const [x,factor]=profile[Math.abs(i)];
    return [Math.sign(i)*x,base+thickness*factor,z];
  }));
  strip(panels,leather);
  const bottom=([x,,z])=>[x*.97,.012-.047*(Math.abs(x)/.216)**2+Math.max(0,z)*.46,z];
  for(const i of [0,8])strip(panels.map(row=>[bottom(row[i]),row[i]]),leather);
  for(const row of [panels[0],panels.at(-1)])strip([row.map(bottom),row],leather);
  for(const side of [-1,1]){
    strip([[-.17,.154,.012],[-.03,.199,-.028],[.09,.272,-.084],[.16,.306,-.14],[.20,.328,-.206]].map(([a,x,y])=>
      [[side*x,y,a-.11],[side*(x+.014),y+.004,a+.026],[side*x,y,a+.07]]),leather);
    const strap=(x,y,z,w)=>[[side*x,y,z-w],[side*x,y,z+w]];
    strip([strap(.26,-.027,.045,.014),strap(.32,-.09,.058,.013),strap(.40,-.134,.075,.012)],leather);
    // The iron opens fore/aft, with a tread under the ball of the boot.
    const loop=[[.403,-.128],[.367,-.168],[.372,-.25],[.385,-.273],
      [.478,-.273],[.493,-.25],[.492,-.171],[.436,-.128],[.403,-.128]];
    strip(loop.map(([x,y])=>[[side*x,y,.06],[side*x,y,.105]]),iron);
  }
  VertexData.ComputeNormals(points,indices,normals,{useRightHandedSystem:scene.useRightHandedSystem});
  const data=new VertexData();data.positions=points;data.indices=indices;data.normals=normals;data.colors=colors;data.applyToMesh(mesh);
  const material=new StandardMaterial('v03-riding-leather',scene);
  material.diffuseColor=Color3.White();material.specularColor=Color3.Black();material.emissiveColor=new Color3(.16,.14,.13);
  material.backFaceCulling=false;mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.parent=root;
  mesh.onDisposeObservable.addOnce(()=>material.dispose());
  return mesh;
}
