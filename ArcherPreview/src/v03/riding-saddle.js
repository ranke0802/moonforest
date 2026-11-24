import { Color3, Mesh, StandardMaterial, VertexData } from '@babylonjs/core';
export const SADDLE_PAD_HEIGHT=.078;

// A riding saddle replaces the cart collar on the personal mount. Its profile
// follows cross-sections of the shipped horse. All leather, binding and irons
// share one vertex-coloured mesh and one draw without a texture or bones.
export function createRidingSaddle(root) {
  const scene=root.getScene(), mesh=new Mesh('v03-riding-saddle',scene);
  const points=[], indices=[], colors=[], normals=[];
  const leather=[.30,.17,.105], pad=[.25,.18,.22], piping=[.46,.30,.18], iron=[.46,.42,.34];
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
  // Width and height across the horse at the new seat location, in metres.
  // Taper the corners around the croup and withers so the blanket sits flat.
  const span=[0,.3,.55,.74,.89,1], across=[-5,-4,-3,-2,-1,0,1,2,3,4,5];
  const blanket=[
    [-.275,.275,[.036,.034,.009,-.018,-.067,-.108]],
    [-.226,.300,[.023,.019,-.009,-.031,-.071,-.164]],
    [-.120,.320,[.002,-.005,-.029,-.070,-.125,-.183]],
    [0,.335,[-.007,-.015,-.040,-.084,-.151,-.224]],
    [.150,.310,[.051,.022,-.047,-.090,-.144,-.201]],
    [.220,.273,[.096,.068,.015,-.074,-.133,-.174]]
  ].map(([z,width,heights])=>across.map(i=>{
    const rim=span[Math.abs(i)];
    return [Math.sign(i)*width*rim,heights[Math.abs(i)],z-Math.sign(z)*.07*rim*rim];
  }));
  strip(blanket,pad);
  for(const [from,to] of [[0,1],[5,4]]){
    strip([.18,.36].map(t=>blanket[from].map((a,i)=>{
      const b=blanket[to][i];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t+.003,a[2]+(b[2]-a[2])*t];
    })),piping);
  }
  // A shallow pocket with raised cantle and pommel. The seat stays within
  // the inner thighs. The long leather panels follow the outside of the ribs.
  // Sections follow the underside of the clothed pelvis and both thighs.
  // A relief under the back tab lets that hanging cloth drape behind the seat.
  const widths=[0,.055,.10,.135,.175,.21];
  const seat=[
    [-.21,.66,[.105,.10,.088,.074,.054,.026]],
    [-.15,.87,[.142,.131,.108,.085,.062,.026]],
    [-.096,.94,[.058,.05,.046,.064,.060,.028]],
    [-.073,.98,[.012,.002,.012,.066,.050,.027]],
    [-.056,1,[.032,.019,.045,SADDLE_PAD_HEIGHT-.0003,.070,.040]],
    [-.050,1,[.105,.096,.088,SADDLE_PAD_HEIGHT-.0003,.078,.054]],
    [-.03,1,[.157,.142,.137,.125,.108,.062]],
    [0,1,[.154,.138,.109,.098,.079,.052]],
    [.038,.98,[.158,.139,.105,.084,.052,.032]],
    [.083,.94,[.173,.152,.112,.085,.051,.030]],
    [.131,.86,[.091,.10,.094,.087,.069,.038]],
    [.17,.62,[.095,.089,.081,.072,.063,.039]]
  ];
  const panels=seat.map(([z,scale,heights])=>across.map(i=>
    [Math.sign(i)*widths[Math.abs(i)]*scale,heights[Math.abs(i)],z]));
  strip(panels,leather);
  const bottom=([x,,z])=>[x*.97,.004-.050*(Math.abs(x)/.21)**2+Math.max(0,z)*.21,z];
  for(const i of [0,panels[0].length-1])strip(panels.map(row=>[bottom(row[i]),row[i]]),leather);
  for(const row of [panels[0],panels.at(-1)])strip([row.map(bottom),row],leather);
  for(const side of [-1,1]){
    strip([[-.17,.154,.012],[-.03,.199,-.028],[.09,.272,-.084],[.16,.306,-.14],[.20,.328,-.206]].map(([a,x,y])=>
      [[side*x,y,a-.11],[side*(x+.014),y+.004,a+.026],[side*x,y,a+.07]]),leather);
    const strap=(x,y,z,w)=>[[side*x,y,z-w],[side*x,y,z+w]];
    strip([strap(.25,-.03,.045,.013),strap(.333,-.13,.08,.012),strap(.413,-.263,.153,.010)],leather);
    // The iron opens fore/aft, with a tread under the ball of the boot.
    const loop=[[.401,-.26],[.355,-.294],[.351,-.385],[.364,-.405],
      [.459,-.405],[.476,-.388],[.472,-.299],[.426,-.26],[.401,-.26]];
    strip(loop.map(([x,y])=>[[side*x,y,.145],[side*x,y,.188]]),iron);
  }
  VertexData.ComputeNormals(points,indices,normals,{useRightHandedSystem:scene.useRightHandedSystem});
  const data=new VertexData();data.positions=points;data.indices=indices;data.normals=normals;data.colors=colors;data.applyToMesh(mesh);
  const material=new StandardMaterial('v03-riding-leather',scene);
  material.diffuseColor=Color3.White();material.specularColor=Color3.Black();material.emissiveColor=new Color3(.16,.14,.13);
  material.backFaceCulling=false;mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.parent=root;
  mesh.onDisposeObservable.addOnce(()=>material.dispose());
  return mesh;
}
