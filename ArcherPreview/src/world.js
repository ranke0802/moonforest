import { ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, HemisphericLight, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Vector3 } from '@babylonjs/core';

export function createWorld(engine) {
  const scene = new Scene(engine);
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
  material.diffuseColor = new Color3(.13, .17, .22);
  material.specularColor = new Color3(.03, .04, .05);
  const texture = new DynamicTexture('floor-grid', { width: 1024, height: 1024 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = '#333e4b'; ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = '#3a4652'; ctx.lineWidth = 1;
  for (let p = 0; p <= 1024; p += 64) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke(); }
  texture.update(); texture.uScale = 4; texture.vScale = 4;
  material.diffuseTexture = texture;
  ground.material = material; ground.receiveShadows = true;

  const ringMaterial = new StandardMaterial('stage-ring-material', scene);
  ringMaterial.diffuseColor = new Color3(.25, .28, .38);
  ringMaterial.emissiveColor = new Color3(.07, .06, .12);
  ringMaterial.specularColor = Color3.Black();
  for (const diameter of [5.8, 6.02]) {
    const ring = MeshBuilder.CreateTorus(`stage-ring-${diameter}`, { diameter, thickness: .012, tessellation: 128 }, scene);
    ring.position.y = .007; ring.material = ringMaterial;
  }

  const bark = new StandardMaterial('distant-bark', scene);
  bark.diffuseColor = new Color3(.065, .095, .12); bark.specularColor = Color3.Black();
  const leaves = new StandardMaterial('distant-needles', scene);
  leaves.diffuseColor = new Color3(.065, .13, .15); leaves.specularColor = Color3.Black();
  // A deterministic, low-detail forest frames the inspection space without covering the character.
  for (let i = 0; i < 46; i++) {
    const angle = i * 2.399963, radius = 13 + (i % 7) * 1.8, height = 4.5 + (i % 5) * .72;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const trunk = MeshBuilder.CreateCylinder(`tree-${i}`, { diameterTop: .2, diameterBottom: .45, height, tessellation: 6 }, scene);
    trunk.position.set(x, height / 2, z); trunk.material = bark; trunk.freezeWorldMatrix();
    for (let tier = 0; tier < 2; tier++) {
      const crown = MeshBuilder.CreateCylinder(`crown-${i}-${tier}`, { diameterTop: 0, diameterBottom: 2.8 - tier * .5, height: 3.9, tessellation: 7 }, scene);
      crown.position.set(x, height * .65 + tier * 1.4, z); crown.material = leaves; crown.freezeWorldMatrix();
    }
  }
  const moteMaterial = new StandardMaterial('mote-light', scene);
  moteMaterial.emissiveColor = new Color3(.25, .5, .58); moteMaterial.disableLighting = true;
  const motes = [];
  for (let i = 0; i < 28; i++) {
    const mote = MeshBuilder.CreateSphere(`mote-${i}`, { diameter: .018 + i % 3 * .007, segments: 3 }, scene);
    mote.position.set(Math.sin(i * 13.7) * 8, .5 + (i % 7) * .34, Math.cos(i * 7.7) * 8);
    mote.material = moteMaterial; mote.isPickable = false;
    motes.push({ mesh: mote, y: mote.position.y, phase: i * .8 });
  }
  return { scene, camera, shadows, tick(time) { for (const mote of motes) mote.mesh.position.y = mote.y + Math.sin(time * .3 + mote.phase) * .12; } };
}
