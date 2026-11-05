"""Small real-Git transport fixtures; no game asset generation or network."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile

spec = importlib.util.spec_from_file_location("portable_package", Path(__file__).with_name("package.py"))
portable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portable)


class PortableTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="moonforest-transport-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "project"
        self.root.mkdir()
        self.write("README.md", b"portable\n")
        portable.git(self.root, "init", "--quiet", "-b", "portable-fixture")
        portable.git(self.root, "config", "user.name", "Portable Fixture")
        portable.git(self.root, "config", "user.email", "fixture@example.invalid")
        portable.git(self.root, "config", "core.autocrlf", "false")
        portable.git(self.root, "add", "README.md")
        portable.git(self.root, "commit", "--quiet", "-m", "initial")
        self.write("README.md", b"portable history\n")
        portable.git(self.root, "commit", "--quiet", "-am", "second")
        portable.git(self.root, "tag", "fixture-tag")
        portable.git(self.root, "update-ref", "refs/notes/fixture", "HEAD")
        self.write("ArcherPreview/package.json", b'{"private":true}\n')
        self.write("ArcherPreview/package-lock.json", b'{"lockfileVersion":3}\n')
        self.write("Assets/Resources/Audio/World/mix-report.json", b"{}\n")
        self.write("Sources/raw/input.glb", b"raw input never committed\x00\xff")
        self.write("Sources/source-inputs.json", json.dumps({"version": 1, "inputs": [{"id": "raw", "path": "Sources/raw/input.glb", "bytes": 27, "sha256": hashlib.sha256(b"raw input never committed\x00\xff").hexdigest()}], "directories": {"raw-root": "Sources/raw"}, "aliases": {"Sources/old/input.glb": "Sources/raw/input.glb"}}).encode())
        self.write("Tools/portable/runtime/win-x64/node/npm/node_modules/package/dist/index.js", b"npm dependency required\n")
        self.write("ArcherPreviewSite/deployed-copy.glb", b"raw input never committed\x00\xff")
        self.write("Sources/workflow/exports/original.fbx", b"historical source sibling\n")
        for name in ["ArcherPreview/node_modules/ignored.js", "ArcherPreview/dist-village/ignored.js", "ArcherPreview/.vite/cache.js", "exports/old.zip", "temp/ignored.txt", ".env"]:
            self.write(name, b"excluded\n")

    def write(self, relative, data):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_untracked_raw_audio_relative_tree_and_npm_runtime_are_included(self):
        rows = portable.inventory(self.root)
        portable.verify_sources(self.root, rows)
        paths = {row["path"] for row in rows}
        self.assertIn("Sources/raw/input.glb", paths)
        self.assertIn("Assets/Resources/Audio/World/mix-report.json", paths)
        self.assertIn("Sources/workflow/exports/original.fbx", paths)
        self.assertIn("Tools/portable/runtime/win-x64/node/npm/node_modules/package/dist/index.js", paths)
        self.assertFalse(any("ignored" in path or path == ".env" for path in paths))
        self.assertFalse(any(path.startswith("ArcherPreviewSite/") for path in paths))

    def test_duplicate_audit_distinguishes_deployment_and_required_sources(self):
        result = portable.duplicates(self.root)
        report = json.loads(Path(result["report"]).read_text())
        self.assertEqual(report["duplicateGroups"], 1)
        self.assertEqual(report["duplicateBytes"], 27)
        self.assertEqual(report["defaultZipDuplicateBytes"], 0)
        self.assertEqual(report["deploymentSnapshotOmitted"]["bytes"], 27)
        self.assertTrue((self.root / "ArcherPreviewSite/deployed-copy.glb").exists())

    def test_zip_reproducible_extract_verify_restore_all_history(self):
        first = portable.pack(self.root, "exports/first.zip")
        second = portable.pack(self.root, "exports/second.zip")
        self.assertEqual(first["sha256"], second["sha256"])
        target = self.base / "relocated"
        with zipfile.ZipFile(first["archive"]) as archive:
            self.assertTrue(all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in archive.infolist()))
            self.assertTrue(all(info.extract_version >= 45 for info in archive.infolist()))
            self.assertFalse(any("/.git/" in name for name in archive.namelist()))
            archive.extractall(target)
        extracted = target / "MoonForest"
        self.assertEqual(portable.verify(extracted)["sourceInputs"], 1)
        state = portable.restore_history(extracted)
        self.assertEqual(state["head"], portable.git(self.root, "rev-parse", "HEAD"))
        self.assertEqual(state["branch"], "portable-fixture")
        self.assertEqual(state["refs"], portable.git_state(self.root)["refs"])
        self.assertEqual(portable.git(extracted, "rev-list", "--count", "HEAD"), "2")
        self.assertEqual(portable.git(extracted, "remote"), "")
        self.assertEqual(portable.verify(extracted)["sourceInputs"], 1)
        (extracted / "README.md").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "inventory differs"):
            portable.verify(extracted)

    def test_registry_hash_or_excluded_required_file_fails(self):
        self.write("Sources/raw/input.glb", b"changed source")
        with self.assertRaisesRegex(ValueError, "hash/size mismatch"):
            portable.verify_sources(self.root, portable.inventory(self.root))
        self.write("Sources/source-inputs.json", json.dumps({"version": 1, "inputs": [{"id": "bad", "path": "ArcherPreview/node_modules/ignored.js", "bytes": 9, "sha256": "0" * 64}]}).encode())
        with self.assertRaisesRegex(ValueError, "excluded or absent"):
            portable.verify_sources(self.root, portable.inventory(self.root))

    def test_crlf_checkout_policy_survives_relocation_without_changing_bytes(self):
        portable.git(self.root, "config", "core.autocrlf", "true")
        portable.git(self.root, "config", "core.eol", "crlf")
        original = b"portable history\r\n"
        self.write("README.md", original)
        self.assertEqual(portable.git(self.root, "diff", "--name-only", "--", "README.md"), "")
        result = portable.pack(self.root)
        target = self.base / "crlf-relocated"
        with zipfile.ZipFile(result["archive"]) as archive:
            archive.extractall(target)
        extracted = target / "MoonForest"
        state = portable.restore_history(extracted)
        self.assertEqual(state["normalization"], {"autocrlf": "true", "eol": "crlf"})
        self.assertEqual((extracted / "README.md").read_bytes(), original)
        self.assertEqual(portable.git(extracted, "diff", "--name-only", "--", "README.md"), "")
        # Version-1 inventories predating this field retain the old defaults.
        legacy_target = self.base / "legacy-relocated"
        with zipfile.ZipFile(result["archive"]) as archive:
            archive.extractall(legacy_target)
        legacy = legacy_target / "MoonForest"
        manifest = portable.read_manifest(legacy)
        manifest["git"].pop("normalization")
        (legacy / portable.MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
        self.assertEqual(portable.restore_history(legacy)["normalization"], {"autocrlf": "false", "eol": "native"})

    def test_reparse_directory_escape_and_app_dependency_junction_fail(self):
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "external.txt").write_text("must not package")
        link = self.root / "Sources/escape"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except OSError:
            if os.name != "nt":
                self.skipTest("OS disallows symlinks")
            result = subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(link), str(outside)], capture_output=True)
            if result.returncode:
                self.skipTest("OS disallows directory links")
        with self.assertRaisesRegex(ValueError, "Links/junctions/reparse"):
            portable.inventory(self.root)
        modules = self.root / "ArcherPreview/node_modules"
        modules.rename(modules.with_name("node_modules-local"))
        try:
            modules.symlink_to(outside, target_is_directory=True)
        except OSError:
            result = subprocess.run(["cmd", "/d", "/c", "mklink", "/J", str(modules), str(outside)], capture_output=True)
            self.assertEqual(result.returncode, 0)
        with self.assertRaisesRegex(ValueError, "Links/junctions/reparse"):
            portable.check_dependencies(self.root)

    def test_file_changed_during_zip_is_rejected_without_partial_archive(self):
        original = portable.zip_entry
        def changed(archive, path, row):
            if row["path"] == "README.md":
                path.write_bytes(b"a concurrent edit")
            return original(archive, path, row)
        with mock.patch.object(portable, "zip_entry", changed):
            with self.assertRaisesRegex(ValueError, "changed before/during packaging"):
                portable.pack(self.root)
        self.assertFalse((self.root / "exports/portable/MoonForest-portable.zip").exists())
        self.assertFalse((self.root / "exports/portable/MoonForest-portable.zip.partial").exists())

    def test_relative_escape_output_escape_and_worktree_pointer_fail(self):
        for path in ["../outside", "C:/outside", "Sources/../outside", "Sources\\raw", "/absolute"]:
            with self.assertRaises(ValueError):
                portable.local_file(self.root, path)
        with self.assertRaisesRegex(ValueError, "below this project's exports"):
            portable.pack(self.root, "exports/../../escape.zip")
        fake = self.base / "worktree"
        fake.mkdir()
        (fake / ".git").write_text("gitdir: ../project/.git\n")
        with self.assertRaisesRegex(ValueError, "own .git directory"):
            portable.git_state(fake)


if __name__ == "__main__":
    unittest.main(verbosity=2)
