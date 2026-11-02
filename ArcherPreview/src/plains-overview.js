import {Engine,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {createWorld} from './world.js';
import {loadStreamedVillage} from './village-streamed-environment.js';
const canvas=document.querySelector('canvas'),status=document.querySelector('#status'),engine=new Engine(canvas,true,{stencil:true});
const world=createWorld(engine,{plains:true,touchDevice:false}),{scene,camera}=world;world.villageOverview=true;
scene.fogStart=400;scene.fogEnd=500;camera.maxZ=650;camera.lowerRadiusLimit=4;camera.upperRadiusLimit=400;camera.lowerBetaLimit=.08;camera.upperBetaLimit=1.5;camera.fov=.9;
camera.inputs.addPointers();camera.inputs.addMouseWheel();camera.attachControl(canvas,true);camera.wheelPrecision=2;camera.panningSensibility=25;
const views=[['전체 조감',-10,0,0,275,.86,Math.PI/2],['마을 진입',-111,3,-38,53,1.17,.05],['갈림길',-5,1,25,55,1.03,Math.PI/2],['전망 바위',-27,8,-19,36,1.05,Math.PI/2],['개울',76,0,8,60,1.08,Math.PI*.65],['숲 입구',63,1,-65,45,1.1,Math.PI/2]];
function view(v){camera.setTarget(new Vector3(v[1],v[2],v[3]));camera.radius=v[4];camera.beta=v[5];camera.alpha=v[6];world.lighting.follow(camera.target,true);}
for(const v of views){const b=document.createElement('button');b.textContent=v[0];b.onclick=()=>view(v);document.querySelector('nav').append(b);}
const link=document.createElement('a');link.href='./?character=warrior-plains';link.textContent='직접 걸어보기 ↗';document.querySelector('nav').append(link);view(views[0]);
engine.runRenderLoop(()=>{world.villageVisibility?.update(camera.globalPosition,camera.target,Math.min(.05,engine.getDeltaTime()/1000));scene.render();});window.addEventListener('resize',()=>engine.resize());
try{await loadStreamedVillage(world);world.villageStreaming.active=true;status.textContent='실제 게임 지형 · 기존 에셋 재사용 · 드래그 회전 / 휠 확대';}catch(error){status.textContent='불러오기 오류: '+error.message;console.error(error);}
