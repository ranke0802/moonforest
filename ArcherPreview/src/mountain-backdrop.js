import { Color3, Mesh, PBRMaterial, VertexData } from '@babylonjs/core';

const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, weight) => a.map((value, i) => value + (b[i] - value) * weight);
const grass = [.32, .40, .29], rock = [.53, .54, .49], distant = [.40, .51, .55];
// Irregular peak spacing leaves valleys and avoids enclosing the clearing with
// a continuous wall. Heights/widths are authored, not regenerated on each load.
const nearPeaks = [[.12,8,.28],[.73,6,.23],[1.22,10,.31],[1.95,6,.35],[2.43,9,.26],[3.18,7,.38],[3.81,9,.28],[4.4,5,.23],[4.88,8,.36],[5.54,6,.3],[6.04,7,.21]];
const farPeaks = [[.28,17,.3],[.94,20,.39],[1.65,14,.3],[2.19,19,.33],[2.91,15,.31],[3.58,21,.42],[4.25,17,.35],[4.99,20,.45],[5.75,17,.32]];
function peakHeight(angle, peaks) {
  let height=0;
  for (const [center,top,width] of peaks) {
    const distance=Math.abs(Math.atan2(Math.sin(angle-center),Math.cos(angle-center)));
    height=Math.max(height,top*Math.max(0,1-distance/width)**.85);
  }
  return height;
}

// Two closed, irregular ridgelines. All shading is baked into vertex colors at
// creation; no textures, lights, shadows, collision, animation or frame updates.
export function createMountainBackdrop(scene) {
  const positions = [], colors = [], indices = [];
  function triangle(a, b, c, palette, variation, far) {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    const length = Math.hypot(nx, ny, nz);
    const sunlight = Math.max(0, (nx*.42+ny*.83+nz*.37)/length);
    const shade = .73 + sunlight*.27 + variation;
    if (!far) palette=mix(palette,rock,clamp((.94-ny/length)*1.8));
    const start = positions.length/3;
    for (const point of [a,b,c]) {
      const foot = far ? palette : mix(palette,[.50,.52,.39],clamp(1-point[1]/3)*.8);
      const tint = new Color3(...foot.map(value => value * shade)).toLinearSpace();
      positions.push(...point); colors.push(tint.r,tint.g,tint.b,1);
    }
    indices.push(start,start+1,start+2);
  }
  function ridge(segments, far) {
    const rows = far ? [0,.23,1,.53,0] : [0,.16,.34,.78,1,0];
    const radii = far ? [79,90,110,123,143] : [43,50,55,58,68,86];
    const points = [], profiles = [];
    for (let i=0;i<segments;i++) {
      const angle = i/segments*TAU;
      const height = (far?4:1.5)+peakHeight(angle,far?farPeaks:nearPeaks);
      const cliff = clamp((Math.sin(angle*3+.6)*.6+Math.cos(angle*5-1.8)*.4-.05)*3);
      const bend = Math.sin(angle*3-.5)*3+Math.sin(angle*9)*1.6;
      profiles.push({angle,cliff});
      points.push(rows.map((fraction,row) => {
        const radius = radii[row]+bend+Math.sin(angle*13+row*1.9)*(row?2.8:0);
        const offset = row===0 || row===rows.length-1 ? -2 : 0;
        // Soft slopes between outcrops, with steeper faces only in cliff patches.
        const shelf = !far && row===3 ? fraction-(1-cliff)*.2 : fraction;
        const ridgeAngle=angle+Math.sin(angle*5+row*2)*.012*(row?1:0);
        const relief=row===0||row===rows.length-1?0:Math.sin(angle*29+row*2.3)*.35;
        return [Math.cos(ridgeAngle)*radius, height*shelf+offset+relief, Math.sin(ridgeAngle)*radius];
      }));
    }
    for (let i=0;i<segments;i++) {
      const next=(i+1)%segments, {angle,cliff}=profiles[i];
      for (let row=0;row<rows.length-1;row++) {
        let palette;
        if (far) palette=mix(distant,[.49,.57,.58],row===2?.35:0);
        else {
          const stone = row===2 ? .15+cliff*.3 : row===3 ? .1+cliff*.2 : row===4 ? .3 : .08;
          palette=mix(grass,rock,stone);
          // A restrained cool tint separates the ridges from the playable forest.
          palette=mix(palette,distant,.12);
        }
        const variation=Math.sin(angle*23+row*4)*.018;
        const a=points[i][row], b=points[next][row], c=points[i][row+1], d=points[next][row+1];
        // Alternate diagonals to avoid a visible repeating grid on the slopes.
        if ((i+row)%2) {
          triangle(a,b,d,palette,variation,far); triangle(a,d,c,palette,variation,far);
        } else {
          triangle(a,b,c,palette,variation,far); triangle(b,d,c,palette,variation,far);
        }
      }
    }
  }
  ridge(128,true);
  ridge(192,false);
  const mesh = new Mesh('forest-mountain-backdrop',scene);
  const data = new VertexData();
  data.positions=positions;data.colors=colors;data.indices=indices;data.applyToMesh(mesh,false);
  const material = new PBRMaterial('mountain-baked-colors',scene);
  material.unlit=true;material.maxSimultaneousLights=0;material.albedoColor=Color3.White();
  material.backFaceCulling=false;material.freeze();
  mesh.material=material;mesh.applyFog=false;mesh.isPickable=false;
  mesh.checkCollisions=false;mesh.receiveShadows=false;mesh.freezeWorldMatrix();
  mesh.metadata={background:true,triangles:indices.length/3};
  return mesh;
}
