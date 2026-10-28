import {readFileSync} from 'node:fs';
import {decodeMeshoptBuffers} from '../../scripts/meshopt-lossless.js';

export async function readRuntimeGltf(url){
  const gltf=JSON.parse(readFileSync(url));
  const files=new Map(gltf.buffers.filter(b=>b.uri).map(b=>[b.uri,{data:readFileSync(new URL(b.uri,url))}]));
  return decodeMeshoptBuffers(gltf,files);
}
