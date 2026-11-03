import {CAVE_LABORATORY_GEOMETRY,laboratoryEnabled} from './cave-laboratory-geometry.js';

// A lower connected rock vault inside the existing 27m structural enclosure.
// One immutable grid is shared by rendering and camera clearance. Its perimeter
// extends into the existing walls; the original floor, doors and body mesh stay.
export const LAB_VAULT_GRID=Object.freeze({minX:-48.35,maxX:-22.65,minZ:-30.35,maxZ:-6.65,columns:12,rows:12});
const G=LAB_VAULT_GRID,positions=[],indices=[];
for(let row=0;row<=G.rows;row++)for(let col=0;col<=G.columns;col++){
 const x=G.minX+(G.maxX-G.minX)*col/G.columns,z=G.minZ+(G.maxZ-G.minZ)*row/G.rows;
 // Wide sloping mineral planes, not repeated spikes or small drilled cavities.
 const y=10.8+.65*Math.sin((x+36)*.22)+.5*Math.cos((z+18)*.28)+.25*Math.sin(x*.61+z*.37);
 positions.push(x,y,z);
 if(row&&col){const d=row*(G.columns+1)+col,a=d-G.columns-2,b=a+1,c=d-1;indices.push(a,b,d,a,d,c);}
}
export const LAB_VAULT_POSITIONS=Float32Array.from(positions);
export const LAB_VAULT_INDICES=Uint16Array.from(indices);

export function laboratoryVaultHeight(x,z){
 if(x<G.minX||x>G.maxX||z<G.minZ||z>G.maxZ)return Infinity;
 const u=(x-G.minX)/(G.maxX-G.minX)*G.columns,v=(z-G.minZ)/(G.maxZ-G.minZ)*G.rows;
 const col=Math.min(G.columns-1,Math.floor(u)),row=Math.min(G.rows-1,Math.floor(v)),a=row*(G.columns+1)+col,fu=u-col,fv=v-row;
 const h=i=>LAB_VAULT_POSITIONS[i*3+1],ha=h(a),hb=h(a+1),hc=h(a+G.columns+1),hd=h(a+G.columns+2);
 return fu>=fv?ha+fu*(hb-ha)+fv*(hd-hb):ha+fv*(hc-ha)+fu*(hd-hc);
}

export function appendLaboratoryVault(geometry,contract=CAVE_LABORATORY_GEOMETRY){
 if(!laboratoryEnabled(contract))return geometry;
 const base=geometry.positions.length/3,p=new Float32Array(geometry.positions.length+LAB_VAULT_POSITIONS.length),i=new Uint32Array(geometry.indices.length+LAB_VAULT_INDICES.length);
 p.set(geometry.positions);p.set(LAB_VAULT_POSITIONS,geometry.positions.length);i.set(geometry.indices);
 for(let n=0;n<LAB_VAULT_INDICES.length;n++)i[geometry.indices.length+n]=base+LAB_VAULT_INDICES[n];
 return {positions:p,indices:i};
}
