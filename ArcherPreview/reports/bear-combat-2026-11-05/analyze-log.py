from pathlib import Path
import json, sys

source = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
events = []
for event in source['recentDelays']:
    render = event['render']
    events.append({
        **{key: event.get(key) for key in ['atSeconds', 'map', 'bosses', 'frameMs', 'jsSubmitMs', 'framePreludeMs', 'bossUpdateMs', 'contactsMs', 'worldUpdateMs', 'hudUpdateMs', 'sceneCallMs']},
        **{key: render.get(key) for key in ['sceneMs', 'animationMs', 'activeMeshesMs', 'renderTargetsMs', 'drawSubmissionMs', 'drawCalls']},
        'textureStage': event.get('textureWork', {}).get('stage'),
        'viewportSettling': event.get('viewportResize', {}).get('settling'),
    })

summary = source['summary']
result = {
    'createdAt': source['createdAt'],
    'bundle': source['bundle'],
    'finalMap': source['character'],
    'finalWindow': {
        **summary,
        'inverseMeanFrameFps': 1000 / summary['meanFrameMs'],
        'missedFraction': summary['missedTargetFrames'] / summary['samples'],
    },
    'bossComparisonAvailable': source.get('bossComparison') is not None,
    'gpuStatus': source['renderMetrics']['gpu']['status'],
    'renderSize': source['renderSize'],
    'events': events,
    'interpretation': [
        'The final ten-second window is village, not the bear combat window. Current one-second fps is not inverse mean frame time.',
        'Retained delays include no-bear plains and village. They are a bounded event list, not a complete controlled before/after experiment.',
        'Plains bear Stand_Up3 events around243s show repeated50-75ms current CPU submissions while textures are idle and the viewport is stable.',
        'At261.5s the bear is Knock_Down_1; current drawSubmission is81ms. The following109ms interval and current submission measure different frames.',
        'At349s village sceneCall156.4ms versus SDK scene48.7ms leaves after-render work/scheduling unresolved. Texture resource stage is not proof of texture upload.',
        'Unsupported GPU timing and rounded JS heap cannot establish GPU saturation, thermal throttling, a leak, or the exact cause of all stalls.',
    ],
}
output = Path(__file__).resolve().parent / 'log-analysis.json'
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'output': str(output), 'events': len(events), 'meanWindowFps': result['finalWindow']['inverseMeanFrameFps']}))
