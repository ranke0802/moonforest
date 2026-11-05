"""Portable authoring source/tool paths; audited legacy origins are never read."""
import json, os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def project_path(*parts):
    path = PROJECT_ROOT.joinpath(*parts).resolve()
    if not path.is_relative_to(PROJECT_ROOT):
        raise ValueError('Source path leaves MoonForest: ' + str(path))
    return path

def source_path(source_id, *parts):
    registry = json.loads((PROJECT_ROOT/'Sources/source-inputs.json').read_text(encoding='utf-8'))
    base = registry.get('directories', {}).get(source_id)
    if base is None:
        base = next((entry['path'] for entry in registry['inputs'] if entry['id'] == source_id), None)
    if base is None and source_id.startswith('file:'):
        base = registry.get('aliases', {}).get(source_id[5:])
    if base is None:
        raise ValueError('Unknown bundled source: ' + source_id)
    path = project_path(base, *parts)
    alias = registry.get('aliases', {}).get(path.relative_to(PROJECT_ROOT).as_posix())
    if alias:
        path = project_path(alias)
    if not path.exists():
        raise FileNotFoundError('Bundled source is missing: ' + str(path))
    return path

def tool_path(name):
    override = os.environ.get(name.upper() + '_EXE')
    if override:
        return override
    if name == 'python' and os.name == 'nt':
        bundled = project_path('Tools/portable/runtime/win-x64/python/python.exe')
        if bundled.is_file():
            return str(bundled)
    return name
