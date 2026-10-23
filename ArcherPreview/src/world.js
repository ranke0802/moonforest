import { ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3 } from '@babylonjs/core';
import { ArenaNavigation } from './navigation.js';
import { FOREST_OBSTACLES, TRAINING_OBSTACLES } from './forest-layout.js';

export function createWorld(engine) {
  const scene = new Scene(engine);
  // Input uses our joystick/camera router and analytic combat shapes, never mesh picking.
  scene.skipPointerMovePicking = scene.skipPointerDownPicking = scene.skipPointerUpPicking = true;
  // Babylon releases capture on any mouse button release, including during a
  // left-attack/right-orbit chord. Our input router owns pointer capture instead.
  scene.detachControl();
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(.035, .052, .087, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = .028;
  scene.fogColor = new Color3(.035, .052, .087);
  scene.imageProcessingConfiguration.exposure = 1.15;
  scene.imageProcessingConfiguration.contrast = 1.08;
  const camera = new ArcRotateCamera('review-camera', Math.PI * .38, 1.18, 4.8, new Vector3(0, 1.02, 0), scene);
  camera.minZ = .05; camera.maxZ = 100;
  camera.lowerRadiusLimit = .8; camera.upperRadiusLimit = 14;
  camera.lowerBetaLimit = .25; camera.upperBetaLimit = 1.48;
  camera.fov = .65;
  // Input is routed explicitly: joystick/action pointers never enter the camera handler.
  camera.inputs.clear();
  const ambient = new HemisphericLight('moon-sky', new Vector3(0, 1, .3), scene);
  ambient.intensity = 1.05;
  ambient.diffuse = new Color3(.85, .89, 1);
  ambient.groundColor = new Color3(.29, .3, .39);
  const key = new DirectionalLight('moon-key', new Vector3(-.4, -1, -.6), scene);
  key.position = new Vector3(5, 9, 6); key.intensity = 1.8;
  key.diffuse = new Color3(.95, .93, 1);
  const rim = new DirectionalLight('blue-rim', new Vector3(.5, -.3, .7), scene);
  rim.intensity = .6; rim.diffuse = new Color3(.4, .65, 1);
  const shadows = new ShadowGenerator(matchMedia('(pointer:coarse)').matches ? 1024 : 2048, key);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = .0008; shadows.normalBias = .02;
  shadows.setDarkness(.35);

  const ground = MeshBuilder.CreateGround('forest-floor', { width: 70, height: 70 }, scene);
  const material = new StandardMaterial('forest-floor-material', scene);
  material.diffuseColor = new Color3(.65, .68, .58);
  material.specularColor = new Color3(.03, .04, .05);
  const texture = new DynamicTexture('floor-grid', { width: 1024, height: 1024 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = '#304432'; ctx.fillRect(0, 0, 1024, 1024);
  let seed=7823;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<12000;i++){ctx.fillStyle=i%2?'rgba(93,110,64,.18)':'rgba(20,35,23,.2)';ctx.beginPath();ctx.ellipse(random()*1024,random()*1024,2+random()*9,1+random()*5,random()*Math.PI,0,Math.PI*2);ctx.fill();}
  const clearing=ctx.createRadialGradient(512,512,45,512,512,132);clearing.addColorStop(0,'#6a624d');clearing.addColorStop(.6,'#625e48');clearing.addColorStop(1,'rgba(83,89,59,0)');ctx.fillStyle=clearing;ctx.fillRect(350,350,324,324);
  for(let i=0;i<9000;i++){const x=random()*1024,z=random()*1024;ctx.fillStyle=i%2?'rgba(145,133,99,.18)':'rgba(15,24,20,.2)';ctx.fillRect(x,z,1+random()*2,1+random()*2);}
  texture.update(); texture.uScale = 1; texture.vScale = 1;
  material.diffuseTexture = texture;
  ground.material = material; ground.receiveShadows = true;
  ground.isPickable=false;ground.freezeWorldMatrix();

  const ringMaterial = new StandardMaterial('stage-ring-material', scene);
  ringMaterial.diffuseColor = new Color3(.25, .28, .38);
  ringMaterial.emissiveColor = new Color3(.07, .06, .12);
  ringMaterial.specularColor = Color3.Black();
  for (const diameter of [5.8, 6.02]) {
    const ring = MeshBuilder.CreateTorus(`stage-ring-${diameter}`, { diameter, thickness: .012, tessellation: 128 }, scene);
    ring.position.y = .007; ring.material = ringMaterial;
    ring.isPickable=false;ring.freezeWorldMatrix();
  }

  const moteMaterial = new StandardMaterial('mote-light', scene);
  moteMaterial.emissiveColor = new Color3(.25, .5, .58); moteMaterial.disableLighting = true;
  const motes = [];
  let moteSource;
  for (let i = 0; i < 28; i++) {
    const mote = i ? moteSource.createInstance(`mote-${i}`) : (moteSource=MeshBuilder.CreateSphere('mote-0',{diameter:.018,segments:3},scene));
    mote.scaling.setAll((.018+i%3*.007)/.018);
    mote.position.set(Math.sin(i * 13.7) * 8, .5 + (i % 7) * .34, Math.cos(i * 7.7) * 8);
    mote.material = moteMaterial; mote.isPickable = false;
    motes.push({ mesh: mote, y: mote.position.y, phase: i * .8 });
  }
  for(const mat of [material,ringMaterial,moteMaterial])mat.freeze();
  const navigation=new ArenaNavigation([...FOREST_OBSTACLES,...TRAINING_OBSTACLES]);
  return { scene, camera, shadows, navigation, tick(time) { for (const mote of motes) mote.mesh.position.y = mote.y + Math.sin(time * .3 + mote.phase) * .12; } };
}
