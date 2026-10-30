import {Color3,MeshBuilder,StandardMaterial,TransformNode,Vector3} from '@babylonjs/core';

// Tiny shared coin geometry; no downloaded texture, dynamic light or shadow map.
export function createGoldLootView(scene,host,{visibleAt=()=>true}={}) {
  const material=new StandardMaterial('loot-gold',scene);
  material.diffuseColor=new Color3(.85,.55,.12);material.emissiveColor=new Color3(.32,.18,.025);material.specularColor=new Color3(.6,.42,.16);
  const template=MeshBuilder.CreateCylinder('gold-coin-template',{diameter:.19,height:.035,tessellation:10},scene);
  template.material=material;template.isVisible=false;template.isPickable=false;
  const records=new Map(),anchor=new Vector3();
  function remove(record){record.root.dispose(false,false);record.label.remove();}
  return {
    sync(drops){
      const ids=new Set(drops.map(d=>d.id));
      for(const [id,record] of records)if(!ids.has(id)){remove(record);records.delete(id);}
      for(const drop of drops){
        let record=records.get(drop.id);
        if(!record){
          const root=new TransformNode(`gold-pile-${drop.id}`,scene);
          for(let i=0;i<3;i++){const coin=template.clone(`gold-${drop.id}-${i}`,root);coin.isVisible=true;coin.position.set((i-1)*.07,i*.025,Math.sin(i*2)*.06);coin.rotation.set(i===2?.3:0,i*1.1,0);}
          const label=document.createElement('span');label.className='gold-drop-label';host.append(label);
          record={root,label,drop,settled:false};records.set(drop.id,record);
        }
        record.drop=drop;
        record.root.setEnabled(visibleAt(drop.position));
        const label=`${drop.amount} G`;if(record.label.textContent!==label)record.label.textContent=label;
        if(!record.settled){const t=Math.min(1,drop.age/.6);record.root.position.set(drop.position.x,drop.position.y+Math.sin(t*Math.PI)*.38,drop.position.z);if(t===1){record.settled=true;record.root.freezeWorldMatrix();for(const mesh of record.root.getChildMeshes())mesh.freezeWorldMatrix();}}
      }
    },
    project(projection){for(const {root,label} of records.values()){anchor.copyFrom(root.position);anchor.y+=.22;const p=projection.project(anchor),visible=visibleAt(root.position);root.setEnabled(visible);label.hidden=!p.visible||!visible;label.style.transform=`translate3d(${p.x}px,${p.y}px,0) translate(-50%,-100%)`;}},
    clear(){for(const record of records.values())remove(record);records.clear();},
    dispose(){this.clear();template.dispose();material.dispose();},
  };
}
