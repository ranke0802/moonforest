import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {CAPE_COLS,CAPE_ROWS} from './cape-spring.js';

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function pulse(t,start,peak,end){
  return t>=peak?smooth((start-t)/(start-peak)):smooth((t-end)/(peak-end));
}

// The shipped cape's weighted joints are siblings under Spine2. Bend each
// baked row-to-row vector about the shoulders' lateral axis, and let the hem
// trail the leftward dismount a little. The folded cloth gathers as the knees
// compress, shortening the straight-line spacing of its lower control points.
export function createLandingCape(byName){
  const spine=byName.get('mixamorig:Spine2'),grid=[];
  for(let row=0;row<CAPE_ROWS;row++)for(let col=0;col<CAPE_COLS;col++){
    const node=byName.get(`DEF-Cloth.0${row}.0${col}`);
    if(node?.parent!==spine||!node?.rotationQuaternion)return null;
    grid.push({node,position:new Vector3(),rotation:new Quaternion(),sourcePosition:null,sourceRotation:null});
  }
  const scene=spine.getScene(),across=new Vector3(),down=new Vector3(),back=new Vector3(),link=new Vector3();
  const pitch=new Quaternion(),sway=new Quaternion(),turn=new Quaternion(),skinTurn=new Quaternion(),straight=Quaternion.Identity();
  let changed=false,observer=null;
  function restoreFrame(){
    if(!changed)return;
    for(let i=CAPE_COLS;i<grid.length;i++){
      const p=grid[i],n=p.node;
      if(n.position===p.position)n.position=p.sourcePosition;
      if(n.rotationQuaternion===p.rotation)n.rotationQuaternion=p.sourceRotation;
    }
    changed=false;
  }
  function reset(){
    restoreFrame();
    if(observer){scene.onBeforeAnimationsObservable.remove(observer);observer=null;}
  }
  function apply(t){
    if(t>=.46||t<=0){reset();return;}
    restoreFrame();
    // Restore the references before the next clip/spring sample. This also
    // leaves paused frames repeatable and never changes a glTF key in place.
    observer??=scene.onBeforeAnimationsObservable.add(restoreFrame);
    grid[CAPE_COLS-1].node.position.subtractToRef(grid[0].node.position,across);across.normalize();
    grid[CAPE_COLS+2].node.position.subtractToRef(grid[2].node.position,down);
    Vector3.CrossToRef(across,down,back);back.normalize();
    for(let row=1;row<CAPE_ROWS;row++){
      const depth=row/(CAPE_ROWS-1),peak=.20-.072*depth,cross=.085-.018*depth;
      const lift=pulse(t,.46-.036*depth,peak,cross)-.15*pulse(t,cross,.037,0);
      const gather=1-.072*depth*Math.max(0,lift);
      Quaternion.RotationAxisToRef(across,(.045+.42*depth*depth*depth)*lift,pitch);
      Quaternion.RotationAxisToRef(back,.15*depth*lift,sway);
      sway.multiplyToRef(pitch,turn);
      // This skin's hem vertices sit forward of their grid pivots. Let the
      // translated grid carry the cloth, with just a little extra local roll.
      Quaternion.SlerpToRef(straight,turn,.18,skinTurn);
      for(let col=0;col<CAPE_COLS;col++){
        const p=grid[row*CAPE_COLS+col],up=grid[(row-1)*CAPE_COLS+col],n=p.node;
        p.sourcePosition=n.position;p.sourceRotation=n.rotationQuaternion;
        p.sourcePosition.subtractToRef(row===1?up.node.position:up.sourcePosition,link);
        link.rotateByQuaternionToRef(turn,p.position);p.position.scaleInPlace(gather).addInPlace(up.node.position);
        skinTurn.multiplyToRef(p.sourceRotation,p.rotation);
        n.position=p.position;n.rotationQuaternion=p.rotation;
      }
    }
    changed=true;
  }
  return {apply,reset};
}
