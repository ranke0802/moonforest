import fs from 'node:fs';
import path from 'node:path';
import {sourcePath,projectPath} from '../../Sources/resolve-source.mjs';
import {createHash} from 'node:crypto';
const target=projectPath('ArcherPreview/src/hud-v1-art');fs.mkdirSync(target,{recursive:true});
const files=[];for(const name of ['combat-press-4x4.png','menu-press-4x4.png']){
 const bytes=fs.readFileSync(sourcePath('hud-ui-sprites-2026-11-13-v1','sheets',name));
 if(bytes.readUInt32BE(16)!==1024||bytes.readUInt32BE(20)!==1024)throw new Error('HUD atlas must retain its original 1024px grid');
 fs.writeFileSync(path.join(target,name),bytes);files.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
fs.writeFileSync(path.join(target,'source.json'),JSON.stringify({sourceAssetId:'hud-ui-sprites-2026-11-13-v1',cellSize:256,files},null,2)+'\n');console.log(JSON.stringify(files));
