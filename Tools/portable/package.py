"""Self-contained, deterministic ZIP64 transport; Python 3.10+, Git, no packages."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = "PORTABLE_FILES.json"
HISTORY = "HISTORY.bundle"
NPM_RUNTIME = "tools/portable/runtime/win-x64/node/npm/"
SKIP_DIRS = {".git", "node_modules", "dist", "dist-village", ".vite", ".cache", "cache", "caches", "temp", "tmp", "__pycache__", ".pytest_cache", ".ruff_cache", ".vs", ".idea"}
UNITY_OUTPUTS = {"library", "obj", "logs", "usersettings", "build", "builds", "memorycaptures", "recordings"}
SKIP_FILES = {MANIFEST.casefold(), HISTORY.casefold(), ".ds_store", "thumbs.db", "desktop.ini"}
CHUNK = 1024 * 1024


def fail(message):
    raise ValueError(message)


def portable_path(value):
    if not isinstance(value, str) or not value or "\\" in value:
        fail(f"Not a normalized relative path: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in {"", ".", ".."} for p in value.split("/")):
        fail(f"Path escapes project: {value}")
    for part in path.parts:
        if any(c in part for c in '<>:"|?*') or part.endswith((".", " ")):
            fail(f"Path is not portable: {value}")
        if part.split(".")[0].upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
            fail(f"Reserved filename: {value}")
    return path


def no_link(path):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
        fail(f"Links/junctions/reparse points cannot be packaged: {path}")
    return info


def local_file(root, relative):
    path = root
    for part in portable_path(relative).parts:
        path /= part
        no_link(path)
    if not path.resolve().is_relative_to(root.resolve()):
        fail(f"Input resolves outside project: {relative}")
    return path


def excluded(relative, directory=False, include_deployment=False):
    text = relative.casefold()
    # npm's own shipped dependency tree is part of the portable toolchain.
    if text.startswith(NPM_RUNTIME):
        return False
    parts = PurePosixPath(text).parts
    if parts[0] == "archerpreviewsite" and not include_deployment:
        return True
    # Registered original Blender/FBX workflows retain historical sibling paths
    # named exports. Current generated exports elsewhere are never archived.
    if "exports" in (parts if directory else parts[:-1]) and parts[0] != "sources":
        return True
    if any(p in SKIP_DIRS for p in (parts if directory else parts[:-1])):
        return True
    if parts[0] in UNITY_OUTPUTS and (directory or len(parts) > 1):
        return True
    if not directory and (parts[-1] in SKIP_FILES or parts[-1].endswith((".log", ".tmp", ".temp", ".pyc")) or parts[-1].startswith(".env") and parts[-1] != ".env.example"):
        return True
    return False


def digest(path):
    no_link(path)
    result = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(CHUNK):
            result.update(block)
    return result.hexdigest()


def record(path, relative):
    before = no_link(path)
    if not stat.S_ISREG(before.st_mode):
        fail(f"Not a regular file: {relative}")
    sha = digest(path)
    after = no_link(path)
    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        fail(f"File changed while hashing: {relative}")
    return {"path": relative, "bytes": after.st_size, "sha256": sha}


def inventory(root, include_deployment=False, *, fingerprint=False):
    root = root.absolute()
    no_link(root)
    files, names = [], set()
    def visit(folder):
        for child in sorted(folder.iterdir(), key=lambda p: p.name):
            relative = child.relative_to(root).as_posix()
            info = child.lstat()
            directory = stat.S_ISDIR(info.st_mode)
            if excluded(relative, directory, include_deployment):
                continue
            no_link(child)
            portable_path(relative)
            folded = relative.casefold()
            if folded in names:
                fail(f"Case-insensitive filename collision: {relative}")
            names.add(folded)
            if directory:
                visit(child)
            else:
                if fingerprint:
                    if not stat.S_ISREG(info.st_mode):
                        fail(f"Not a regular file: {relative}")
                    files.append({"path": relative, "bytes": info.st_size, "mtimeNs": info.st_mtime_ns, "inode": info.st_ino})
                else:
                    files.append(record(child, relative))
    visit(root)
    return sorted(files, key=lambda item: item["path"])


def verify_sources(root, files):
    registry_path = root / "Sources/source-inputs.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    if registry.get("version") != 1 or not isinstance(registry.get("inputs"), list):
        fail("Unsupported Sources/source-inputs.json")
    indexed = {row["path"]: row for row in files}
    seen = set()
    for source in registry["inputs"]:
        key, relative = source["id"], source["path"]
        if key in seen:
            fail(f"Duplicate source ID: {key}")
        seen.add(key)
        local_file(root, relative)
        if relative not in indexed:
            fail(f"Required source is excluded or absent: {relative}")
        actual = indexed[relative]
        if actual["bytes"] != source["bytes"] or actual["sha256"] != source["sha256"]:
            fail(f"Required source hash/size mismatch: {relative}")
    for relative in registry.get("directories", {}).values():
        if not local_file(root, relative).is_dir() or excluded(relative, True):
            fail(f"Required source directory absent or excluded: {relative}")
    registered = {row["path"] for row in registry["inputs"]}
    for alias, target in registry.get("aliases", {}).items():
        portable_path(alias)
        if target not in registered:
            fail(f"Source alias target is not a registered physical input: {target}")
        local_file(root, target)
    return len(seen)


def source_policy_preflight(root):
    registry = json.loads(local_file(root, "Sources/source-inputs.json").read_text(encoding="utf-8"))
    for source in registry.get("inputs", []):
        if excluded(source["path"]):
            fail(f"Required source is excluded by package policy: {source['path']}")
        local_file(root, source["path"])


def duplicates(root, output=None):
    """Report exact bytes, never infer that an equal file is safe to remove."""
    source_policy_preflight(root)
    files = inventory(root, include_deployment=True)
    development = [row for row in files if not excluded(row["path"])]
    verify_sources(root, development)
    registry = json.loads((root / "Sources/source-inputs.json").read_text(encoding="utf-8"))
    required = {row["path"] for row in registry["inputs"]}
    groups = {}
    for row in files:
        if row["bytes"]:
            groups.setdefault((row["sha256"], row["bytes"]), []).append(row["path"])
    def kind(path):
        if path.startswith("ArcherPreviewSite/"):
            return "rebuildable-deployment-snapshot"
        if path in required or path.startswith("Sources/"):
            return "registered-source-or-source-workflow-copy"
        if path.startswith("Tools/portable/runtime/"):
            return "required-public-toolchain"
        if path.startswith("ArcherPreview/public/assets/"):
            return "prepared-game-resource-retain-until-reference-proof"
        if path.startswith("Assets/Resources/Audio/"):
            return "current-relative-audio-source-workflow"
        if path.startswith(("Assets/", "Packages/", "ProjectSettings/")):
            return "historical-unity-project-optional-retained"
        if path.startswith("Tools/Archive/"):
            return "historical-authoring-archive-optional-retained"
        if path.startswith("Tools/Music/"):
            return "audio-authoring-workflow-retained"
        return "project-source-or-review-evidence"
    rows = []
    for (sha, size), paths in groups.items():
        if len(paths) < 2:
            continue
        kept = [path for path in paths if not excluded(path)]
        rows.append({"sha256": sha, "bytesEach": size, "copies": len(paths), "duplicateBytes": size * (len(paths) - 1), "defaultZipDuplicateBytes": size * max(0, len(kept) - 1), "paths": [{"path": path, "kind": kind(path), "includedInDefaultZip": not excluded(path)} for path in paths], "recommendation": "Deployment snapshot copies are omitted from the default developer ZIP. Keep registered sources, sibling glTF/FBX inputs and current prepared game resources unless all workflow/test references are proved replaceable; no files deleted."})
    rows.sort(key=lambda row: (-row["duplicateBytes"], row["sha256"]))
    site = [row for row in files if row["path"].startswith("ArcherPreviewSite/")]
    categories = {}
    for row in files:
        entry = categories.setdefault(kind(row["path"]), {"files": 0, "bytes": 0})
        entry["files"] += 1
        entry["bytes"] += row["bytes"]
    report = {"version": 1, "scope": "Exact SHA-256 duplicates across source/dev tree plus deployment snapshot; application dependencies, Git objects and generated cache/temp/export trees are excluded from content scanning.", "filesScanned": len(files), "bytesScanned": sum(row["bytes"] for row in files), "duplicateGroups": len(rows), "duplicateBytes": sum(row["duplicateBytes"] for row in rows), "defaultZipDuplicateBytes": sum(row["defaultZipDuplicateBytes"] for row in rows), "categoryTotals": categories, "deploymentSnapshotOmitted": {"files": len(site), "bytes": sum(row["bytes"] for row in site), "reason": "Rebuilt by build:village then sync:village; canonical files and all Git history retained."}, "history": "HISTORY.bundle deliberately preserves all Git history. Its compressed objects are not ordinary file copies and are not counted as removable duplicate source bytes.", "historicalOptional": "Unity Assets outside Resources/Audio, Packages, ProjectSettings and Tools/Archive are optional to the standard Babylon dev/test/build workflow, but are retained as editable project history/workflows. No canonical files are deleted.", "preparedResources": "Old app/public/assets/content and transport bundles are retained. Exact equality alone does not prove them unused by manifests, catalogs, tests or source processing; no unsafe resource pruning is inferred.", "groups": rows}
    destination = Path(os.path.abspath(root / (output or "exports/portable/duplicates.json")))
    if not destination.is_relative_to(root / "exports"):
        fail("Duplicate audit output must stay below this project's exports directory")
    portable_path(destination.relative_to(root).as_posix())
    for parent in reversed(destination.parents):
        if parent == root or parent.is_relative_to(root):
            if os.path.lexists(parent):
                no_link(parent)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if os.path.lexists(destination):
        no_link(destination)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return {key: report[key] for key in ["filesScanned", "bytesScanned", "duplicateGroups", "duplicateBytes", "defaultZipDuplicateBytes", "deploymentSnapshotOmitted"]} | {"report": str(destination)}


def check_dependencies(root):
    path = root / "ArcherPreview/node_modules"
    if os.path.lexists(path):
        if not stat.S_ISDIR(no_link(path).st_mode):
            fail("ArcherPreview/node_modules must be a physical local directory")


def git(root, *args, allow_missing=False):
    env = os.environ.copy()
    for key in ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_INDEX_FILE"]:
        env.pop(key, None)
    try:
        result = subprocess.run(["git", "-C", str(root), *map(str, args)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    except FileNotFoundError:
        fail("Git is required on PATH for portable history packaging/restoration")
    except subprocess.CalledProcessError as error:
        if allow_missing and error.returncode == 1:
            return None
        fail(error.stderr.decode("utf-8", errors="replace").strip())
    return result.stdout.decode("utf-8", errors="strict").strip()


def git_state(root):
    metadata = root / ".git"
    if not metadata.is_dir():
        fail("Project must have its own .git directory, not a worktree pointer; use restore-history for an extracted archive")
    no_link(metadata)
    if Path(git(root, "rev-parse", "--show-toplevel")).resolve() != root.resolve():
        fail("Git root points outside this project")
    common = Path(git(root, "rev-parse", "--git-common-dir"))
    if (root / common).resolve() != metadata.resolve():
        fail("Git common directory points outside this project's .git")
    no_link(metadata / "objects")
    alternates = metadata / "objects/info/alternates"
    if alternates.exists() and alternates.read_text().strip():
        fail("Git object alternates would make this project dependent on another repository")
    head = git(root, "rev-parse", "HEAD")
    branch = git(root, "branch", "--show-current") or None
    refs = git(root, "for-each-ref", "--sort=refname", "--format=%(refname) %(objectname)").splitlines()
    normalization = {"autocrlf": git(root, "config", "--get", "core.autocrlf", allow_missing=True) or "false", "eol": git(root, "config", "--get", "core.eol", allow_missing=True) or "native"}
    return {"head": head, "branch": branch, "historyFile": HISTORY, "refs": refs, "normalization": normalization}


def read_manifest(root):
    manifest = json.loads(local_file(root, MANIFEST).read_text(encoding="utf-8"))
    if manifest.get("version") != 1 or not isinstance(manifest.get("files"), list):
        fail("Unsupported portable file inventory")
    return manifest


def verify(root):
    check_dependencies(root)
    source_policy_preflight(root)
    files = inventory(root)
    sources = verify_sources(root, files)
    if (root / MANIFEST).exists():
        expected = read_manifest(root)["files"]
        actual = files + [record(local_file(root, HISTORY), HISTORY)]
        if sorted(expected, key=lambda row: row["path"]) != sorted(actual, key=lambda row: row["path"]):
            fail("Portable file inventory differs from disk; a file is missing, changed or unexpectedly added")
    if os.path.lexists(root / ".git"):
        git_state(root)
    elif not (root / HISTORY).is_file():
        fail("Neither an independent .git directory nor HISTORY.bundle is present")
    return {"files": len(files), "bytes": sum(row["bytes"] for row in files), "sourceInputs": sources}


def restore_history(root):
    if os.path.lexists(root / ".git"):
        return git_state(root)
    manifest = read_manifest(root)
    bundle = local_file(root, HISTORY)
    if record(bundle, HISTORY) not in manifest["files"]:
        fail("History bundle does not match portable inventory")
    state = manifest["git"]
    git(root, "init", "--quiet")
    normalization = state.get("normalization", {})
    git(root, "config", "core.autocrlf", normalization.get("autocrlf", "false"))
    git(root, "config", "core.eol", normalization.get("eol", "native"))
    git(root, "bundle", "verify", bundle)
    git(root, "fetch", "--quiet", "--no-tags", "--update-head-ok", bundle, "+refs/*:refs/*")
    if state.get("branch"):
        git(root, "check-ref-format", "refs/heads/" + state["branch"])
        git(root, "symbolic-ref", "HEAD", "refs/heads/" + state["branch"])
    else:
        git(root, "update-ref", "--no-deref", "HEAD", state["head"])
    # Restore only the index; extracted files and uncommitted edits stay intact.
    git(root, "reset", "--mixed", "--quiet", state["head"])
    restored = git_state(root)
    if any(restored.get(key) != value for key, value in state.items()):
        fail("Restored Git HEAD/branch/refs differ from the archive history inventory")
    return restored


def zip_entry(archive, path, row):
    info = zipfile.ZipInfo("MoonForest/" + row["path"], (1980, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    info.file_size = row["bytes"]
    sha, count = hashlib.sha256(), 0
    no_link(path)
    with path.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
        while block := source.read(CHUNK):
            target.write(block)
            sha.update(block)
            count += len(block)
    if count != row["bytes"] or sha.hexdigest() != row["sha256"]:
        fail(f"File changed before/during packaging: {row['path']}")


def pack(root, output=None):
    check_dependencies(root)
    if not os.path.lexists(root / ".git"):
        restore_history(root)
    state = git_state(root)
    destination = Path(os.path.abspath(root / (output or "exports/portable/MoonForest-portable.zip")))
    if not destination.is_relative_to(root / "exports") or destination.suffix.lower() != ".zip":
        fail("Archive output must be a .zip below this project's exports directory")
    portable_path(destination.relative_to(root).as_posix())
    for parent in reversed(destination.parents):
        if parent == root or parent.is_relative_to(root):
            if os.path.lexists(parent):
                no_link(parent)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if os.path.lexists(destination):
        no_link(destination)
    print("Portable: checking project files and source hashes...", file=sys.stderr, flush=True)
    source_policy_preflight(root)
    files = inventory(root)
    source_count = verify_sources(root, files)
    initial_tree = inventory(root, fingerprint=True)
    if [(row["path"], row["bytes"]) for row in initial_tree] != [(row["path"], row["bytes"]) for row in files]:
        fail("Project file list/size changed during verification")
    print(f"Portable: verified {len(files)} files and {source_count} registered inputs; creating independent Git history...", file=sys.stderr, flush=True)
    with tempfile.TemporaryDirectory(prefix="moonforest-portable-") as temporary:
        temporary = Path(temporary)
        bundle = temporary / HISTORY
        git(root, "-c", "pack.threads=1", "-c", "pack.window=0", "-c", "pack.depth=0", "-c", "pack.compression=6", "bundle", "create", bundle, "--all", "HEAD")
        git(root, "bundle", "verify", bundle)
        print(f"Portable: history bundle ready ({bundle.stat().st_size} bytes); writing ZIP64 archive...", file=sys.stderr, flush=True)
        rows = sorted(files + [record(bundle, HISTORY)], key=lambda row: row["path"])
        manifest = {"version": 1, "algorithm": "sha256", "root": "MoonForest", "git": state, "files": rows, "selfExcluded": MANIFEST, "sourceInputs": source_count, "policy": {"excludedDirectories": sorted(SKIP_DIRS | {"exports"}), "sourceWorkflowExportsException": "Sources/**/exports", "omittedTrackedDeployment": "ArcherPreviewSite", "bundledNpmException": NPM_RUNTIME, "unityRootOutputs": sorted(UNITY_OUTPUTS)}}
        manifest_path = temporary / MANIFEST
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        partial = destination.with_suffix(".zip.partial")
        try:
            if os.path.lexists(partial):
                no_link(partial)
            with zipfile.ZipFile(partial, "w", allowZip64=True, compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                written, next_progress = 0, 1024 ** 3
                for row in rows:
                    zip_entry(archive, bundle if row["path"] == HISTORY else local_file(root, row["path"]), row)
                    written += row["bytes"]
                    if written >= next_progress:
                        print(f"Portable: archived {written} input bytes...", file=sys.stderr, flush=True)
                        next_progress = written + 1024 ** 3
                zip_entry(archive, manifest_path, record(manifest_path, MANIFEST))
            print("Portable: checking the completed snapshot for concurrent edits...", file=sys.stderr, flush=True)
            if inventory(root, fingerprint=True) != initial_tree or git_state(root) != state:
                fail("Project files or Git HEAD/branch changed during packaging; retry after other work finishes")
            os.replace(partial, destination)
        finally:
            if partial.exists():
                partial.unlink()
        sidecar = destination.with_suffix(".files.json")
        if os.path.lexists(sidecar):
            no_link(sidecar)
        sidecar.write_bytes(manifest_path.read_bytes())
    sha = digest(destination)
    checksum = destination.with_suffix(".zip.sha256")
    if os.path.lexists(checksum):
        no_link(checksum)
    checksum.write_text(f"{sha}  {destination.name}\n", encoding="ascii")
    return {"archive": str(destination), "bytes": destination.stat().st_size, "sha256": sha, "files": len(rows) + 1, "sourceInputs": source_count, "inventory": str(sidecar)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["inventory", "verify", "duplicates", "pack", "restore-history"])
    parser.add_argument("--output", help="ZIP path below exports/ (pack only)")
    args = parser.parse_args()
    if args.command == "pack":
        result = pack(ROOT, args.output)
    elif args.command == "verify":
        result = verify(ROOT)
    elif args.command == "restore-history":
        result = restore_history(ROOT)
    elif args.command == "duplicates":
        result = duplicates(ROOT, args.output)
    else:
        check_dependencies(ROOT)
        files = inventory(ROOT)
        result = {"version": 1, "files": files, "sourceInputs": verify_sources(ROOT, files)}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print(f"Portable check failed: {error}", file=sys.stderr)
        sys.exit(1)
