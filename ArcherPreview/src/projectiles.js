import { Color3, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';

/** A released arrow has its own world-space flight, independent of the next animation. */
export function createProjectiles(scene, onHit) {
  const flights = [];
  const wood = new StandardMaterial('flying-arrow-wood', scene);
  wood.diffuseColor = new Color3(.64, .38, .16);
  const metal = new StandardMaterial('flying-arrow-tip', scene);
  metal.diffuseColor = new Color3(.91, .86, .67);
  metal.emissiveColor = new Color3(.22, .16, .04);
  const feather = new StandardMaterial('flying-arrow-feather', scene);
  feather.diffuseColor = new Color3(.77, .84, .71);
  function fire(origin, destination, target = null) {
    const root = new TransformNode('released-arrow', scene);
    root.position.copyFrom(origin);
    const direction = destination.subtract(origin).normalize();
    root.rotation.set(-Math.asin(direction.y), Math.atan2(direction.x, direction.z), 0);
    const shaft = MeshBuilder.CreateCylinder('arrow-shaft', { height: .58, diameter: .014, tessellation: 5 }, scene);
    shaft.rotation.x = Math.PI / 2; shaft.parent = root; shaft.material = wood;
    const tip = MeshBuilder.CreateCylinder('arrow-tip', { height: .085, diameterTop: 0, diameterBottom: .045, tessellation: 4 }, scene);
    tip.parent = root; tip.position.z = .33; tip.rotation.x = Math.PI / 2; tip.material = metal;
    for (const angle of [0, Math.PI / 2]) {
      const fin = MeshBuilder.CreateBox('arrow-fletching', { width: .08, height: .005, depth: .13 }, scene);
      fin.parent = root; fin.position.z = -.22; fin.rotation.z = angle; fin.material = feather;
    }
    for (const mesh of root.getChildMeshes()) mesh.isPickable = false;
    flights.push({ root, origin: origin.clone(), destination: destination.clone(), target, age: 0, duration: Math.max(.12, Vector3.Distance(origin, destination) / 14), arrived: false });
  }
  return {
    fire,
    get count() { return flights.length; },
    update(dt) {
      for (let i = flights.length - 1; i >= 0; i--) {
        const flight = flights[i];
        flight.age += dt;
        const progress = Math.min(1, flight.age / flight.duration);
        flight.root.position.copyFrom(Vector3.Lerp(flight.origin, flight.destination, progress));
        if (progress === 1 && !flight.arrived) {
          flight.arrived = true;
          if (flight.target) onHit(flight.target);
        }
        if (flight.age > flight.duration + .55) { flight.root.dispose(); flights.splice(i, 1); }
      }
    },
    clear() { for (const flight of flights) flight.root.dispose(); flights.length = 0; },
    dispose() { this.clear(); wood.dispose(); metal.dispose(); feather.dispose(); },
  };
}
