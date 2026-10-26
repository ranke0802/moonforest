// Isolated asset review. No game, sound, fullscreen or user input.
import {Engine,Scene,ArcRotateCamera,Vector3,Color4,HemisphericLight,DirectionalLight,SceneLoader} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.45,.53,.56,1);scene.detachControl();
const camera=new ArcRotateCamera('camera',-1.1,1.3,10,new Vector3(0,2.5,0),scene);
const ambient=new HemisphericLight('sky',Vector3.Up(),scene);ambient.intensity=.85;
const light=new DirectionalLight('sun',new Vector3(-.6,-1,-.6),scene);light.intensity=1.6;
let asset;
window.treeReview={async render(model,alpha=-1.1){
 asset?.dispose();camera.alpha=alpha;
 const url=new URL(`/assets/${model.replace('./','')}`,location.href);
 asset=await SceneLoader.LoadAssetContainerAsync(new URL('.',url).href,url.pathname.split('/').pop(),scene,null,'.gltf');
 for(const material of asset.materials)material.backFaceCulling=false;
 asset.addAllToScene();
 const frame=()=>{engine.beginFrame();scene.render();engine.endFrame();};
 for(let i=0;i<3;i++){frame();await new Promise(r=>setTimeout(r,100));}
 await scene.whenReadyAsync();frame();
 return {triangles:scene.getActiveIndices()/3,vertices:scene.getTotalVertices()};
}};
