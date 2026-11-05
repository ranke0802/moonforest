import {existsSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,join,resolve,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const project=join(root,'ArcherPreview');
const runtime=join(root,'Tools','portable','runtime','win-x64');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<12)){
  console.error(`MoonForest requires Node >=22.12 (24 recommended); found ${process.versions.node}. Use Launch.cmd/Package.cmd with the bundled Windows runtime, or install a supported Node version.`);
  process.exit(1);
}
function run(executable,args,options={}){
  const result=spawnSync(executable,args,{cwd:root,stdio:'inherit',...options});
  if(result.error)throw new Error(`Cannot start ${executable}: ${result.error.message}`);
  if(result.status!==0)throw new Error(`Command failed (${result.status??result.signal}): ${executable}`);
}
function python(){
  const bundled=join(runtime,'python','python.exe');
  const candidates=[...(process.platform==='win32'&&existsSync(bundled)?[[bundled]]:[]),...(process.env.MOONFOREST_PYTHON?[[process.env.MOONFOREST_PYTHON]]:[]),['python3'],['python'],['py','-3']];
  for(const [exe,...prefix]of candidates){
    const probe=spawnSync(exe,[...prefix,'-c','import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'],{encoding:'utf8',windowsHide:true,timeout:10000});
    if(!probe.error&&probe.status===0)return {exe,prefix};
  }
  throw new Error('Packaging needs Python >=3.10. Use the included Windows runtime or install Python 3; MOONFOREST_PYTHON may name its executable.');
}
function packCommand(command,args=[]){
  const {exe,prefix}=python();
  run(exe,[...prefix,'-B',join(root,'Tools','portable','package.py'),command,...args]);
}
function npmCli(){
  const candidates=[...(process.platform==='win32'?[join(runtime,'node','npm','bin','npm-cli.js')]:[]),process.env.npm_execpath,join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),join(dirname(process.execPath),'..','lib','node_modules','npm','bin','npm-cli.js')];
  for(const folder of (process.env.PATH??'').split(delimiter)){
    candidates.push(join(folder,'node_modules','npm','bin','npm-cli.js'));
    for(const name of ['npm','npm.cmd'])try{const path=realpathSync(join(folder,name));if(path.endsWith('npm-cli.js'))candidates.push(path);}catch{}
  }
  const found=candidates.find(path=>path&&existsSync(path));
  if(!found)throw new Error('npm CLI not found. Install Node with npm, or restore Tools/portable/runtime/win-x64/node/npm.');
  return found;
}
function localDependencies(){
  const modules=join(project,'node_modules');
  if(!existsSync(modules))return false;
  if(lstatSync(modules).isSymbolicLink()||realpathSync(modules)!==resolve(modules))throw new Error('ArcherPreview/node_modules must be a physical local directory. Remove the old dependency link, then run setup.');
  return existsSync(join(modules,'vite','package.json'))&&existsSync(join(modules,'@babylonjs','core','package.json'));
}
function npm(args){
  const env={...process.env,PATH:dirname(process.execPath)+delimiter+(process.env.PATH??'')};
  run(process.execPath,[npmCli(),...args],{cwd:project,env});
}
function history(){if(!existsSync(join(root,'.git'))&&existsSync(join(root,'HISTORY.bundle')))packCommand('restore-history');}
function setup(){history();localDependencies();npm(['ci']);if(!localDependencies())throw new Error('Local dependency installation is incomplete.');}
try{
  const [command='dev',...args]=process.argv.slice(2);
  if(command==='setup')setup();
  else if(['dev','build','test'].includes(command)){
    history();if(!localDependencies())setup();
    npm(['run',command==='build'?'build:village':command,...(args.length?['--',...args]:[])]);
  }else if(['verify','inventory','duplicates','pack','restore-history'].includes(command))packCommand(command,args);
  else if(command==='self-test'){
    const {exe,prefix}=python();run(exe,[...prefix,'-B',join(root,'Tools','portable','test_package.py')]);
  }else throw new Error(`Unknown command: ${command}. Use setup, dev, build, test, verify, inventory, pack or self-test.`);
}catch(error){console.error(error.message);process.exitCode=1;}
