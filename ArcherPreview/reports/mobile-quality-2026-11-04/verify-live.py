"""Hash changed public resources with bounded HTTP concurrency, no browser."""
from pathlib import Path
import hashlib,json,subprocess,urllib.request,concurrent.futures
out=Path(__file__).resolve().parent; app=out.parents[1];repo=app.parent
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
paths=(app/'reports/publish-village-paths.txt').read_text().strip().splitlines()
def verify(path):
 expected=(repo/path).read_bytes();url='https://ranke0802.github.io/moonforest/'+path+'?rev='+commit[:7]
 request=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'Moonforest-release-hash-verification'})
 with urllib.request.urlopen(request,timeout=45) as response:actual=response.read()
 digest=hashlib.sha256(actual).hexdigest()
 if digest!=hashlib.sha256(expected).hexdigest():raise ValueError('Public file differs: '+path)
 return {'path':path,'bytes':len(actual),'sha256':digest}
result={'commit':commit,'attemptsPerFile':1,'browserAutomation':False,'verified':[],'errors':[]}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 futures={pool.submit(verify,path):path for path in paths}
 for future in concurrent.futures.as_completed(futures):
  try:result['verified'].append(future.result())
  except Exception as error:result['errors'].append({'path':futures[future],'error':str(error)})
result['verified'].sort(key=lambda row:row['path']);result['passed']=len(result['verified'])==len(paths) and not result['errors']
(out/'live-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'passed':result['passed'],'verified':len(result['verified']),'expected':len(paths),'errors':result['errors']}))
raise SystemExit(0 if result['passed'] else 1)
