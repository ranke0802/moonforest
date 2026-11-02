from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json

folder=Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/playability-optimization-review/2026-11-03')
class Inspect(HTMLParser):
    def __init__(self):
        super().__init__();self.references=[];self.ids=set();self.images=0;self.tables=0
    def handle_starttag(self,tag,attrs):
        values=dict(attrs)
        if 'id' in values:
            assert values['id'] not in self.ids
            self.ids.add(values['id'])
        if tag=='img':self.images+=1;assert values.get('alt')
        if tag=='table':self.tables+=1
        for key in ['href','src']:
            if key in values:self.references.append(values[key])

p=Inspect();p.feed((folder/'index.html').read_text(encoding='utf-8'))
checked=0
for ref in p.references:
    parsed=urlsplit(ref)
    if ref.startswith('#'):assert ref[1:] in p.ids;continue
    if not parsed.scheme:
        assert (folder/unquote(parsed.path)).is_file(),ref;checked+=1
    elif parsed.scheme=='file':
        path=unquote(parsed.path).lstrip('/')
        assert Path(path).is_file(),path;checked+=1
assert p.images==6 and p.tables>=4
print(json.dumps({'passed':True,'images':p.images,'tables':p.tables,'localReferencesChecked':checked,'browserAutomation':False}))
