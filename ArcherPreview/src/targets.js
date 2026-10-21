import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { MeleeContactGate } from './melee-collision.js';

/** Three stationary practice targets. All positions and distances use scene metres. */
export function createTrainingTargets(scene, shadows, onDamage = () => {}) {
  const materials = [];
  const casters = [];
  const records = [];
  const owned = new Map();
  let selected = null;
  let clock = 0;
  let disposed = false;
  function material(name, color, emissive = [0, 0, 0]) {
    const m = new StandardMaterial(`training-${name}`, scene);
    m.diffuseColor = Color3.FromArray(color);
    m.specularColor = new Color3(.035, .035, .035);
    m.emissiveColor = Color3.FromArray(emissive);
    materials.push(m);
    return m;
  }
  const wood = material('wood', [.29, .16, .085]);
  const straw = material('straw', [.72, .52, .25]);
  const strawLight = material('straw-light', [.89, .72, .4]);
  const dark = material('stitch', [.12, .075, .065]);
  const ivory = material('target-ivory', [.87, .82, .66]);
  const violet = material('target-violet', [.26, .17, .4]);
  const hat = material('hat', [.24, .19, .32]);

  const definitions = [
    { id: 'dummy-west', name: '서쪽 허수아비', position: [-3, 0, 3], cloth: [.36, .27, .48] },
    { id: 'dummy-east', name: '동쪽 허수아비', position: [3, 0, 4], cloth: [.22, .36, .43] },
    { id: 'dummy-south', name: '남쪽 허수아비', position: [-1, 0, -4], cloth: [.34, .41, .28] },
  ];

  for (const definition of definitions) {
    const prefix = `training-${definition.id}`;
    const root = new TransformNode(`${prefix}-root`, scene);
    root.position.copyFromFloats(...definition.position);
    root.rotation.y = Math.atan2(-root.position.x, -root.position.z);
    const sway = new TransformNode(`${prefix}-sway`, scene);
    sway.parent = root;
    sway.position.y = .2;
    const cloth = material(`${definition.id}-cloth`, definition.cloth);
    const centerMaterial = material(`${definition.id}-gold`, [.86, .59, .23], [.12, .065, .015]);
    const ringMaterial = material(`${definition.id}-selection`, [.45, .36, .66], [.35, .25, .62]);
    ringMaterial.disableLighting = true;

    function mesh(kind, name, options, position, mat, parent = sway, shadow = true) {
      const m = MeshBuilder[kind](`${prefix}-${name}`, options, scene);
      m.parent = parent;
      m.position.copyFromFloats(...position);
      m.material = mat;
      m.isPickable = false;
      m.metadata = { trainingTargetId: definition.id };
      if (shadow) { shadows?.addShadowCaster?.(m, false); casters.push(m); }
      return m;
    }
    mesh('CreateCylinder', 'post', { height: 1.22, diameter: .105, tessellation: 7 }, [0, .48, 0], wood);
    const bar = mesh('CreateCylinder', 'crossbar', { height: 1.42, diameter: .085, tessellation: 7 }, [0, 1.07, 0], wood);
    bar.rotation.z = Math.PI / 2;
    mesh('CreateCylinder', 'coat', { height: .68, diameterTop: .55, diameterBottom: .38, tessellation: 9 }, [0, .88, 0], cloth);
    mesh('CreateCylinder', 'collar', { height: .11, diameter: .24, tessellation: 9 }, [0, 1.25, 0], strawLight);
    mesh('CreateSphere', 'head', { diameter: .37, segments: 10 }, [0, 1.47, 0], straw);
    mesh('CreateCylinder', 'hat-brim', { height: .035, diameter: .61, tessellation: 12 }, [0, 1.63, 0], hat);
    mesh('CreateCylinder', 'hat-crown', { height: .23, diameterTop: .08, diameterBottom: .36, tessellation: 9 }, [0, 1.76, 0], hat);
    mesh('CreateCylinder', 'hat-band', { height: .045, diameterTop: .32, diameterBottom: .355, tessellation: 9 }, [0, 1.66, 0], strawLight);

    for (const side of [-1, 1]) {
      const sleeve = mesh('CreateCylinder', `sleeve-${side}`, { height: .48, diameterTop: .17, diameterBottom: .23, tessellation: 7 }, [side * .42, 1.065, .005], cloth);
      sleeve.rotation.z = side * Math.PI / 2;
      mesh('CreateSphere', `eye-${side}`, { diameter: .033, segments: 5 }, [side * .068, 1.5, .169], dark, sway, false);
      const stitch = mesh('CreateBox', `smile-${side}`, { width: .055, height: .012, depth: .013 }, [side * .025, 1.415, .18], dark, sway, false);
      stitch.rotation.z = side * .28;
      for (let strand = 0; strand < 3; strand++) {
        const tuft = mesh('CreateCylinder', `straw-${side}-${strand}`, { height: .27, diameterTop: .01, diameterBottom: .03, tessellation: 4 }, [side * .735, 1.065 + (strand - 1) * .045, .018], strand % 2 ? straw : strawLight);
        tuft.rotation.z = side * (Math.PI / 2 + (strand - 1) * .12);
      }
      const brace = mesh('CreateBox', `foot-${side}`, { width: .11, height: .11, depth: .48 }, [side * .13, .055, 0], wood, root);
      brace.rotation.y = side * .45;
    }

    // The front face has real depth, so the bullseye remains readable from oblique views.
    for (const [name, diameter, z, mat] of [
      ['board', .48, .218, wood],
      ['outer', .425, .246, ivory],
      ['middle', .285, .27, violet],
      ['bullseye', .13, .293, centerMaterial],
    ]) {
      const disc = mesh('CreateCylinder', name, { height: .026, diameter, tessellation: 24 }, [0, .86, z], mat);
      disc.rotation.x = Math.PI / 2;
      if (name === 'bullseye') disc.isPickable = true;
    }
    const bullseye = scene.getMeshByName(`${prefix}-bullseye`);
    const ring = mesh('CreateTorus', 'selection', { diameter: 1.12, thickness: .024, tessellation: 48 }, [0, .025, 0], ringMaterial, root, false);
    ring.isVisible = false;
    const target = { id: definition.id, name: definition.name, position: root.position, aimPoint: new Vector3(), hits: 0 };
    const record = { target, root, sway, ring, ringMaterial, centerMaterial, bullseye, hitAge: Infinity, heavy:false, stun:0, gate:new MeleeContactGate(), parts:sway.getChildMeshes() };
    bullseye.computeWorldMatrix(true);
    target.aimPoint.copyFrom(bullseye.getAbsolutePosition());
    records.push(record);
    owned.set(target, record);
  }

  const targets = records.map(record => record.target);
  return {
    targets,
    /** Horizontal distance is intentional: player skeleton/root height does not change range. */
    selectNearest(playerPosition, range = 14) {
      if (disposed || !playerPosition || !Number.isFinite(playerPosition.x) || !Number.isFinite(playerPosition.z) || !Number.isFinite(range) || range < 0) return null;
      let nearest = null;
      // Squaring an exact boundary such as sqrt(18) can round down by a few ULPs.
      let nearestDistance = range * range + Math.max(1, range * range) * Number.EPSILON * 8;
      for (const target of targets) {
        const dx = target.position.x - playerPosition.x, dz = target.position.z - playerPosition.z;
        const distance = dx * dx + dz * dz;
        // Retain definition order for exact ties; no random target flicker.
        if (distance < nearestDistance || (nearest === null && distance === nearestDistance)) { nearest = target; nearestDistance = distance; }
      }
      return nearest;
    },
    setSelected(target) {
      selected = !disposed && owned.has(target) ? target : null;
      for (const record of records) record.ring.isVisible = record.target === selected;
      return selected;
    },
    hit(target, {damage=18,heavy=false,stun=0,burstIndex=0}={}) {
      const record = owned.get(target);
      if (disposed || !record) return false;
      target.hits += 1;
      record.hitAge = 0;
      record.heavy=heavy;record.stun=stun;
      record.centerMaterial.emissiveColor.set(1, .72, .28);
      for(const mesh of record.parts){mesh.renderOverlay=true;mesh.overlayColor=Color3.White();mesh.overlayAlpha=.55;}
      onDamage(target.aimPoint.add(new Vector3(0,.65,0)),damage,heavy,'enemy',burstIndex);
      return true;
    },
    melee(sample){
      if(!sample||disposed)return;
      let hitStop=0;
      for(const record of records){
        const matrix=record.sway.computeWorldMatrix(true);
        const capsules=[[[0,.55,0],[0,1.20,0],.29],[[0,1.3,0],[0,1.76,0],.22],
          [[-.75,1.065,0],[.75,1.065,0],.13]].map(([a,b,radius])=>({
            points:[a,b].map(p=>Vector3.TransformCoordinates(Vector3.FromArray(p),matrix).asArray()),radius}));
        const contacts=record.gate.collect({...sample,capsules});
        for(const hit of contacts.hits){this.hit(record.target,hit);hitStop=Math.max(hitStop,contacts.hitStop);}
      }
      return hitStop;
    },
    update(dt) {
      if (disposed || !Number.isFinite(dt) || dt < 0) return;
      const step = Math.min(dt, .1);
      clock += step;
      for (const record of records) {
        record.hitAge += step;
        const age = record.hitAge;
        if (age < 1.25) {
          const fade = Math.exp(-age * 5);
          record.sway.rotation.z = Math.sin(age * (record.heavy?17:30)) * (record.heavy?.42:.09) * fade;
          record.sway.rotation.x = record.heavy ? -.5*Math.sin(Math.min(1,age/.85)*Math.PI)*Math.exp(-age*1.3) : Math.sin(age * 23) * .055 * fade;
        } else record.sway.rotation.setAll(0);
        record.sway.position.z=record.heavy&&age<1.25?-.62*Math.sin(Math.PI*age/1.25)*Math.exp(-age*.8):0;
        record.sway.position.y=.2;
        if(record.stun>age){record.sway.rotation.z=.035*Math.sin(age*55);record.sway.rotation.x=-.06;}
        const flash = Math.max(0, 1 - age / .22);
        for(const mesh of record.parts){mesh.renderOverlay=flash>0;mesh.overlayAlpha=flash*.55;}
        record.centerMaterial.emissiveColor.set(.12 + flash * .88, .065 + flash * .655, .015 + flash * .265);
        const pulse = .94 + Math.sin(clock * 3) * .06;
        record.ring.scaling.set(pulse, 1, pulse);
        record.bullseye.computeWorldMatrix(true);
        // Keep the same Vector3 instance so an in-flight effect can track a wobbling target.
        record.target.aimPoint.copyFrom(record.bullseye.getAbsolutePosition());
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      selected = null;
      for (const mesh of casters) shadows?.removeShadowCaster?.(mesh, false);
      for (const record of records) record.root.dispose();
      for (const m of materials) m.dispose();
      owned.clear();
    },
  };
}
