"""HTTP/file evidence only; never starts or controls a browser."""
import hashlib, json, re, subprocess, urllib.request, urllib.error
from pathlib import Path

report=Path(__file__).parent
app=report.parents[1]
repo=app.parent
attachment=Path('C:/Users/ryank/.codex/attachments/a4b7543d-bac2-45ac-adf2-eabf37000128/붙여넣은 텍스트.txt')
diagnostic=json.loads(attachment.read_text(encoding='utf-8-sig'))
base='https://ranke0802.github.io/moonforest/ArcherPreviewSite/'
old=app/'reports/plains-integration-2026-11-02/pages/ArcherPreviewSite/assets'
engine=(old/'babylon~index-Cvd2zNR-.js').read_text(encoding='utf-8')
loader='babylon~ktxTextureLoader-DLDclLm6.js'
assert loader in engine

def get(path):
    try:
        with urllib.request.urlopen(urllib.request.Request(base+path,headers={'Cache-Control':'no-cache','User-Agent':'Moonforest-runtime-audit'}),timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code,error.read()

status,body=get('assets/'+loader)
index_status,html=get('?audit=ground-20261103')
contracts=[]
for name in ['warrior-v3','warrior-v3-ios','village','monster-forest','great-plains','witch-cave','elena','mourning-elena','quest-props']:
    path='ArcherPreview/public/assets/'+name+'.json'
    before=subprocess.check_output(['git','show','ef797a0:'+path],cwd=repo)
    current=(repo/path).read_bytes()
    same=json.loads(before)==json.loads(current)
    assert same,path
    contracts.append({'name':name,'unchanged':same})
ground=[]
for role in ['color','detail']:
    asset=json.loads((app/'public/assets/village-ground.json').read_text())[role]
    url='assets/'+asset['url'].removeprefix('./')
    resource_status,data=get(url)
    expected=Path(asset['url']).name.split('.')[0]
    valid=resource_status==200 and hashlib.sha256(data).hexdigest()==expected
    assert valid,url
    ground.append({'role':role,'status':resource_status,'bytes':len(data),'sha256Matches':valid})
result={
    'scope':'Current HTTP responses and preserved historical build graph, not a browser replay or direct device cache inspection.',
    'diagnostic':{key:diagnostic.get(key) for key in ['createdAt','bundle','character','failure','loadHistory','resourceDownloads']},
    'oldGraph':{'entry':'index-MFmNTgKU.js','engine':'babylon~index-Cvd2zNR-.js','lazyLoader':loader,'currentStatus':status},
    'currentPage':{'status':index_status,'entry':re.search(r'<script type="module"[^>]+src="([^"]+)',html.decode()).group(1)},
    'groundHttp':ground,'qualityContracts':contracts,
    'interpretation':'The reported old entry can request an unavailable lazy loader today. This matches the before-worker failure; the old generic error omitted the SDK cause, so neither the exact historical server response nor device-cache corruption is proven.',
    'browserAutomation':False,'physicalDeviceTested':False,
}
(report/'evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'oldLoaderStatus':status,'liveEntry':result['currentPage']['entry'],'groundFilesVerified':len(ground),'qualityContracts':len(contracts)}))
