// The approved V6 body and inverted-hull outlines must keep matching topology.
// Only its rigid high-density shield needs the established web reduction.
export function warriorWebPolicy(mesh, primitive, gltf) {
  const triangles = gltf.accessors[primitive.indices].count / 3;
  if (triangles < 15000) return null;
  if (gltf.nodes.some(node => node.name === 'Warrior_Body_Outline')) {
    const shield = gltf.nodes.find(node => node.name === 'Bunnyguard_Shield');
    if (gltf.meshes[shield?.mesh] !== mesh) return null;
    return { ratio: .15, error: .0015 };
  }
  return { ratio: mesh.name.includes('002') ? .15 : .28, error: .0015 };
}
