"""Check the generated report's local evidence links without a browser."""
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

report = Path(__file__).resolve().parent
page = Path('C:/Users/ryank/Documents/ChatGPT/MM Project/output/loading-stutter-review/2026-11-03/index.html')

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            assert attrs['id'] not in self.ids, 'Duplicate HTML id'
            self.ids.add(attrs['id'])
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])

parser = Links()
parser.feed(page.read_text(encoding='utf-8'))
local = []
for link in parser.links:
    parts = urlsplit(link)
    if parts.scheme:
        assert parts.scheme == 'https', link
        continue
    if parts.path:
        target = page.parent / unquote(parts.path)
        assert target.is_file(), str(target)
        if target.suffix == '.json':
            json.loads(target.read_text(encoding='utf-8-sig'))
        local.append(str(target))
    elif parts.fragment:
        assert parts.fragment in parser.ids, link
result = {'passed': True, 'report': str(page), 'localLinks': len(local), 'browserAutomation': False, 'visualBrowserReview': False}
(report / 'report-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
