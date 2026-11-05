import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourcePath, projectPath, projectRoot, toolPath} from './resolve-source.mjs';

test('source roots and exact current NPC source are local physical inputs', () => {
  for (const id of ['village', 'forest-runtime', 'cave', 'mourning-motion', 'blacksmith-npc']) {
    const path = sourcePath(id);
    assert.ok(existsSync(path));
    assert.ok(!relative(projectRoot, path).startsWith('..'));
  }
  assert.ok(existsSync(sourcePath('blacksmith-npc', 'integrated-motion-2026-11-05/package/working/blacksmith_NPC20_185cm.glb')));
});
test('Windows authoring Python uses the executable inside this portable project', () => {
  const previous = process.env.PYTHON_EXE;
  try {
    delete process.env.PYTHON_EXE;
    const bundled = projectPath('Tools/portable/runtime/win-x64/python/python.exe');
    const expected = process.platform === 'win32' && existsSync(bundled) ? bundled : 'python';
    assert.equal(toolPath('python'), expected);
    if (process.platform === 'win32' && existsSync(bundled)) {
      const check = spawnSync(toolPath('python'), ['-c', 'import sys; print(sys.executable)'], {encoding: 'utf8', windowsHide: true});
      assert.equal(check.status, 0, check.stderr);
      assert.equal(check.stdout.trim().toLowerCase(), bundled.toLowerCase());
      const helper = spawnSync(toolPath('python'), ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(projectPath('Sources'))}); from resolve_source import tool_path; print(tool_path('python'))`], {encoding: 'utf8', windowsHide: true});
      assert.equal(helper.status, 0, helper.stderr);
      assert.equal(helper.stdout.trim().toLowerCase(), bundled.toLowerCase());
    }
    process.env.PYTHON_EXE = 'D:/explicit-authoring/python.exe';
    assert.equal(toolPath('python'), process.env.PYTHON_EXE);
  } finally {
    if (previous === undefined) delete process.env.PYTHON_EXE;
    else process.env.PYTHON_EXE = previous;
  }
});
test('source resolver rejects unknown IDs, absent inputs and project escapes', () => {
  assert.throws(() => sourcePath('unregistered-source'), /Unknown bundled source/);
  assert.throws(() => sourcePath('village', 'missing-not-a-file'), /Bundled source is missing/);
  assert.throws(() => sourcePath('village', '../../../../../../outside'), /leaves MoonForest/);
  assert.throws(() => projectPath('../outside'), /leaves MoonForest/);
});
test('content duplicates retain logical resolution to one canonical file', () => {
  assert.equal(sourcePath('mourning-motion', 'models/model-r11-alternate-return.glb'), sourcePath('mourning-motion', 'models/model.glb'));
});
test('processing tool overrides are explicit and private runtimes are never inferred', () => {
  const previous = process.env.KTX_EXE;
  try {
    process.env.KTX_EXE = 'D:/authoring-tools/ktx';
    assert.equal(toolPath('ktx'), process.env.KTX_EXE);
    delete process.env.KTX_EXE;
    assert.equal(toolPath('ktx'), 'ktx');
  } finally {
    if (previous === undefined) delete process.env.KTX_EXE;
    else process.env.KTX_EXE = previous;
  }
});
