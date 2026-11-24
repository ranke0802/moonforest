// Metres at placement scale 1, measured on the shipped, height-normalized meshes.
// The round rock uses the outermost vertex about its pivot. The long outcrop
// uses its oriented footprint so its narrow sides leave room to pass.
export function fitOutdoorRockBodies(obstacles, placements) {
  const rocks = new Map();
  for (const p of placements) {
    if (p.kind === 'rock' && !p.decorative && !p.background) rocks.set(p.id, p);
  }
  for (const o of obstacles) {
    const p = rocks.get(o.id) ?? (o.id.endsWith('-0') && rocks.get(o.id.slice(0, -2)));
    if (!p) continue;
    const scale = p.scale ?? 1;
    if (p.asset === 'rock-01-mossy-boulder') {
      Object.assign(o, {x:p.x, z:p.z, radius:1.952 * scale, height:2.2 * scale, shape:'circle'});
    } else if (p.asset === 'rock-02-jagged-outcrop') {
      const halfWidth = 2.376 * scale, halfDepth = 1.73 * scale;
      Object.assign(o, {x:p.x, z:p.z, yaw:p.yaw, shape:'box', halfWidth, halfDepth,
        radius:Math.hypot(halfWidth, halfDepth), height:4.5 * scale});
    }
  }
}
