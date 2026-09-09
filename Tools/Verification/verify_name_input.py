"""macOS IME integration checks. Requires Accessibility permission; run while not using the test window."""
from pathlib import Path
import subprocess, time, json, sys
app=Path(sys.argv[1]).resolve()
out_root=Path(sys.argv[2]).resolve();out_root.mkdir(parents=True,exist_ok=True)
script=Path(__file__).with_name('name_input.swift')
cases=[('click','ㅇㅇ',None),('hangul','유리카',None),('blur','ㅇㅇ','ㅇㅇ'),('append','ㅇㅇㅇ','ㅇㅇ'),('enter','ㅇㅇ','ㅇㅇ'),('tab','ㅇㅇ','ㅇㅇ'),('inside','ㅇㅇㅇ',None),('delete','ㅇ',None)]
if len(sys.argv)>3:cases=[c for c in cases if c[0] in sys.argv[3:]]
failed=[]
for mode,expected,edit in cases:
 out=out_root/mode;out.mkdir(exist_ok=True);log=out/'player.log';report=out/'adventure-tests.json'
 if report.exists():report.unlink()
 if log.exists():log.unlink()
 args=['open','-n',str(app),'--args','--adventure-verify',str(out),'--name-probe','--name-from-title','--expected-name',expected,'-screen-fullscreen','0','-screen-width','1280','-screen-height','800','-logFile',str(log)]
 if edit:args+=['--expected-edit',edit]
 subprocess.run(args,check=True)
 end=time.monotonic()+25
 while time.monotonic()<end:
  if log.exists() and 'NAME_PROBE_READY' in log.read_text(errors='replace'):break
  time.sleep(.1)
 else:raise RuntimeError('Game did not become ready: '+mode)
 subprocess.run(['swift',str(script),str(app),mode],check=True,stdout=subprocess.DEVNULL)
 end=time.monotonic()+15
 while not report.exists() and time.monotonic()<end:time.sleep(.1)
 if not report.exists():raise RuntimeError('No result: '+mode)
 d=json.loads(report.read_text());print(mode,d['passed'],d['failures'],flush=True)
 if not d['passed']:failed.append(mode)
 time.sleep(.4)
if failed:sys.exit('Failed: '+', '.join(failed))
