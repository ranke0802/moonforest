import {Engine,Scene,SceneLoader,ArcRotateCamera,Vector3,Color3,Color4,HemisphericLight,DirectionalLight,TransformNode} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {initializeVillageKtx2} from './village-ktx2.js';
import {initializeVillageMeshopt} from './village-meshopt.js';
import {applyVillageToon} from './village-toon.js';
import {prepareVillageInstancing} from './village-instancing.js';
import {VillageOutlines} from './village-outlines.js';
const canvas=document.querySelector('canvas'),status=document.querySelector('#status'),list=document.querySelector('#asset-list'),engine=new Engine(canvas,true,{stencil:true}),scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.89,.88,.82,1);scene.fogStart=100;scene.fogEnd=150;
const camera=new ArcRotateCamera('asset-review',-Math.PI/2,1.03,12,new Vector3(0,.5,0),scene);camera.attachControl(canvas,true);camera.lowerRadiusLimit=.4;camera.upperRadiusLimit=22;camera.wheelPrecision=60;camera.minZ=.01;
new HemisphericLight('sky',Vector3.Up(),scene);const sun=new DirectionalLight('sun',new Vector3(-.4,-1,-.6),scene);sun.intensity=1.2;const lighting={direction:sun.direction.negate().normalize(),shadowsActive:false};scene.imageProcessingConfiguration.exposure=1.15;
const labels={'apple':'사과','apple-pie':'애플파이','pet-food':'반려동물 먹이','contaminated-vial':'침전 약병','clue-bandage':'교회 문장 붕대','moon-dew-herb':'달이슬풀','memory-locket':'초상화 펜던트','goblin-club':'고블린 무기','clue-journal':'실험 일지','clue-satchel':'치료 도구 가방','chest-common':'목재 보급 상자','waypost':'갈림길 표지판'};
const records=[];let chosen=null;
function select(id){chosen=id;for(const r of records)r.root.setEnabled(!id||r.placement.id===id);const r=records.find(r=>r.placement.id===id);camera.setTarget(r?r.root.position.add(new Vector3(0,r.height*.5,0)):new Vector3(0,.4,0));camera.radius=r?3.5:12;for(const b of list.children)b.setAttribute('aria-pressed',String(b.dataset.id===id));status.textContent=r?`${labels[id]} · ${r.config.triangles.toLocaleString()} 삼각형 · 1024px 검수 텍스처`:'12종 전체 · 크기 정규화 비교';}
function button(id,label){const b=document.createElement('button');b.textContent=label;b.dataset.id=id??'';b.onclick=()=>select(id);list.append(b);}
button(null,'12종 전체 보기');engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
try{await initializeVillageKtx2();await initializeVillageMeshopt();const base=new URL(`${import.meta.env.BASE_URL}assets/quest-props.json`,location.href),manifest=await(await fetch(base)).json();let i=0;
 for(const [id,config]of Object.entries(manifest.assets)){const url=new URL(config.lods[0].model,base),asset=await SceneLoader.LoadAssetContainerAsync(new URL('.',url).href,url.pathname.split('/').pop(),scene,null,'.gltf');const meshes=asset.meshes.filter(m=>m.getTotalVertices?.()>0);prepareVillageInstancing(meshes);applyVillageToon(meshes,lighting);
  const root=new TransformNode(id,scene);root.position.set((i%4-1.5)*2.1,0,(Math.floor(i/4)-1)*2.1);root.scaling.setAll(1.35/Math.max(...config.bounds));const instance=asset.instantiateModelsToScene(n=>id+'-'+n,false,{doNotInstantiate:false});for(const n of instance.rootNodes)n.parent=root;
  records.push({root,meshes:root.getChildMeshes(),placement:{id,kind:'ground-detail'},config,height:config.bounds[1]*root.scaling.x});button(id,labels[id]);status.textContent=`${++i} / 12 모델 준비`;}
 new VillageOutlines({scene,camera,touchDevice:false,cave:false},records,{});select(null);scene.onDisposeObservable.addOnce(()=>engine.dispose());
}catch(error){status.textContent='불러오기 오류: '+error.message;console.error(error);}
