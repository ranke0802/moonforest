import {Vector3} from '@babylonjs/core';

const zero=new Vector3();
const forehead=Object.freeze({offset:new Vector3(0,.20,.04),radius:.45}),teeth=Object.freeze({offset:new Vector3(0,.11,.01),radius:.265});
const body=Object.freeze({offset:zero,radius:.60}),paw=Object.freeze({offset:zero,radius:.75});
export function wolfContactShape(name,kind){
 if(kind==='ram'&&name==='head')return forehead;
 if(kind==='maul'&&name==='jaw')return teeth;
 return name.includes('paw')?paw:body;
}
