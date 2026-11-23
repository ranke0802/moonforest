// 0.3: which player meshes cast a shadow (2026-11-23).
// The player was 16 of ~48 shadow draws on the plains and in the village (PC deployed build, every
// mesh with vertices was registered). Outline shells only repeat their body's silhouette;
// scene-lighting.js already skips names ending in '_Outline', but the merged ear shell is named
// 'Warrior_Ear.L_Outline + 4' and slipped through (41K skinned vertices a shadow pass). Parts under
// 1,000 vertices (the 23-82 vertex hair/skin strips, neck, ears, shield strap and pad) sit inside the
// body, hair or shield silhouette.
// Same-frame comparison on the deployed build, 2048 shadow map: 17 -> 7 casters changed 520 pixels by
// at most 6/255 (the strap's shadow on the shield). Phones use a 1024 map.
export const MIN_SHADOW_VERTICES=1000;
export function castsPlayerShadow(mesh){
 const vertices=mesh?.getTotalVertices?.()??0;
 if(!vertices)return false;
 if(mesh.metadata?.moonforestOutline===true||/outline/i.test(mesh.name??'')||/outline/i.test(mesh.material?.name??''))return false;
 return vertices>=MIN_SHADOW_VERTICES;
}
