import json, statistics
from pathlib import Path

source = Path('C:/Users/ryank/.codex/attachments/b8fa1087-7b46-4718-89ef-bb03b9b677c2/붙여넣은 텍스트.txt')
data = json.loads(source.read_text(encoding='utf-8-sig'))
events = []
for item in data.get('recentDelays', []):
    events.append({key: item.get(key) for key in ['atSeconds', 'frameMs', 'jsSubmitMs', 'trigger', 'map', 'activity', 'geometryPending', 'texturePending', 'worldUpdateMs', 'hudUpdateMs']} | {'render': item.get('render', {})})
summary = {key: data.get(key) for key in ['createdAt', 'bundle', 'character', 'renderSize', 'summary', 'renderMetrics', 'loading', 'loadHistory', 'memory', 'textureStreaming', 'ktxWorker', 'meshoptWorker', 'mapTransition']}
summary['events'] = events
summary['groups'] = {}
for name, predicate in [('resident', lambda e: not e.get('geometryPending') and not e.get('texturePending')), ('texturePending', lambda e: e.get('texturePending'))]:
    selected = [e for e in events if predicate(e)]
    values = [e['render']['activeMeshesMs'] for e in selected if e['render'].get('activeMeshesMs') is not None]
    summary['groups'][name] = {'selectedEvents': len(selected), 'activeMeshesMeanMs': statistics.mean(values) if values else None, 'activeMeshesMaxMs': max(values) if values else None}
summary['interpretation'] = [
    'Selected slow-event groups are not whole-session averages.',
    'frameMs is the preceding interval; CPU counters describe current work. They are not additive.',
    'Texture pending covers fetching, worker/decode/upload and material promotion; it does not identify the cause of drawSubmissionMs.',
    'GPU timing unsupported. Temperature, GPU utilization and throttling cannot be established from this log.',
]
target = Path(__file__).parent / 'device-evidence.json'
target.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'bundle': data['bundle'], 'meanFps': 1000/data['summary']['meanFrameMs'], 'missedRatio': data['summary']['missedTargetFrames']/data['summary']['samples'], 'groups': summary['groups']}, ensure_ascii=False))
