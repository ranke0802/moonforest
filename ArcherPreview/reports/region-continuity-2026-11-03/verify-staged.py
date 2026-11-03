"""Verify that Git's index contains the exact reviewed site, not only local files."""
import hashlib,json,subprocess
from pathlib import Path
app=Path(__file__).resolve().parents[2];repo=app.parent
manifest=json.loads((repo/'ArcherPreviewSite/deployment-files.json').read_text())
items=list(manifest['files'])
data=(repo/'ArcherPreviewSite/deployment-files.json').read_bytes()
items.append({'path':'deployment-files.json','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
process=subprocess.Popen(['git','cat-file','--batch'],cwd=repo,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
try:
    for item in items:
        path='ArcherPreviewSite/'+item['path']
        process.stdin.write((':'+path+'\n').encode());process.stdin.flush()
        header=process.stdout.readline().decode().strip().split()
        assert len(header)==3 and header[1]=='blob',path+' not staged'
        size=int(header[2]);content=process.stdout.read(size);assert process.stdout.read(1)==b'\n'
        assert size==item['bytes'] and hashlib.sha256(content).hexdigest()==item['sha256'],path+' index mismatch'
finally:
    process.stdin.close();process.wait()
result={'passed':True,'verifiedFiles':len(items),'resourceRevision':manifest['resourceRevision'],'bytes':manifest['bytes']}
(Path(__file__).parent/'staged-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
