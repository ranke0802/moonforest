"""Verify each changed deployed file once; no browser automation or retry loop."""
import hashlib,json,subprocess,urllib.request
from pathlib import Path
app=Path(__file__).resolve().parents[2]
repo=app.parent
paths=(app/'reports/publish-village-paths.txt').read_text().strip().splitlines()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
result={'commit':commit,'attemptsPerFile':1,'verified':[],'error':None}
try:
    for path in paths:
        expected=(repo/path).read_bytes()
        url='https://ranke0802.github.io/moonforest/'+path+'?rev='+commit[:7]
        request=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'Moonforest-release-hash-verification'})
        with urllib.request.urlopen(request,timeout=45) as response:
            actual=response.read()
        digest=hashlib.sha256(actual).hexdigest()
        if digest!=hashlib.sha256(expected).hexdigest():
            raise ValueError('Deployed file differs from reviewed build: '+path)
        result['verified'].append({'path':path,'bytes':len(actual),'sha256':digest})
except Exception as error:
    result['error']=str(error)
result['passed']=result['error'] is None and len(result['verified'])==len(paths)
result['expectedFiles']=len(paths)
(Path(__file__).parent/'live-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'verifiedFiles':len(result['verified']),'expectedFiles':len(paths),'error':result['error']}))
raise SystemExit(0 if result['passed'] else 1)
