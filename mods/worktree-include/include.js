import {
  globstarNamesFolder,
  isLinkedWorktree,
  mainWorktree,
  otherWorktreePaths,
  patternKind,
  planIncludes,
  positivePatterns,
  splitByFolder,
} from "./core.js";

const INCLUDE_FILE = ".worktreeinclude";
const CHUNK = 100;

const nul = (text) => text.split("\0").filter((item) => item !== "");

export async function copyIncludes({ run, readText }, start) {
  const git = (cwd, args) => run("git", args, cwd);
  const top = await git(start, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) return { tag: "not-ready" };
  const folder = top.stdout.trim();
  const listed = await git(folder, ["worktree", "list", "--porcelain"]);
  if (listed.code !== 0) return { tag: "not-ready" };
  if (!isLinkedWorktree(listed.stdout, folder)) return { tag: "not-linked" };

  const source = mainWorktree(listed.stdout);
  const manifest = await readText(`${source}/${INCLUDE_FILE}`);
  if (manifest === null) return { tag: "no-manifest" };

  const candidates = await matchedCandidates({ run, git }, source, `${source}/${INCLUDE_FILE}`, manifest);
  const existing = await existingPaths(run, folder, candidates);
  const plan = planIncludes({ candidates, existing, otherWorktrees: otherWorktreePaths(listed.stdout) });

  const failures = [];
  let copied = 0;
  for (const item of plan) {
    if (item.step === "skip") continue;
    const result = await run(
      "sh",
      [
        "-c",
        'mkdir -p "$(dirname "$2")" && cp -n -P "$1" "$2"',
        "sh",
        `${source}/${item.path}`,
        `${folder}/${item.path}`,
      ],
      folder,
    );
    if (result.code === 0) copied += 1;
    else failures.push(`${item.path}: ${result.stderr.trim()}`);
  }
  return { tag: "applied", copied, failures };
}

async function matchedCandidates(tools, source, includePath, manifest) {
  const { git } = tools;
  const matched = await git(source, ["ls-files", "--others", "--ignored", "-z", `--exclude-from=${includePath}`]);
  const ignored = await onlyGitIgnored(git, source, nul(matched.stdout));
  const folders = await ignoredFolders(git, source);
  const { loose, inFolder } = splitByFolder(ignored, folders);
  const patterns = positivePatterns(manifest);
  const kept = [...loose];
  for (const [path, files] of inFolder) {
    if (await anyPatternTargets(tools, source, path, patterns)) kept.push(...files);
  }
  return kept;
}

async function onlyGitIgnored(git, source, paths) {
  const ignored = [];
  for (let at = 0; at < paths.length; at += CHUNK) {
    const result = await git(source, [
      "-c",
      "core.quotePath=false",
      "check-ignore",
      "--",
      ...paths.slice(at, at + CHUNK),
    ]);
    ignored.push(...result.stdout.split("\n").filter((line) => line !== ""));
  }
  return ignored;
}

async function ignoredFolders(git, source) {
  const listed = await git(source, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]);
  return onlyGitIgnored(
    git,
    source,
    nul(listed.stdout).filter((entry) => entry.endsWith("/")),
  );
}

async function anyPatternTargets({ run, git }, source, folder, patterns) {
  for (const pattern of patterns) {
    const kind = patternKind(pattern);
    if (kind === "any-depth" && globstarNamesFolder(pattern, folder)) return true;
    if (await patternMatchesFolderItself(run, source, folder, pattern)) return true;
    if (kind === "path" && (await patternMatchesInsideFolder(git, source, folder, pattern))) return true;
  }
  return false;
}

async function patternMatchesInsideFolder(git, source, folder, pattern) {
  const result = await git(source, ["ls-files", "--others", "--ignored", "-z", `--exclude=${pattern}`, "--", folder]);
  return nul(result.stdout).length > 0;
}

const IN_EMPTY_REPO = `d=$(mktemp -d) || exit 2
git -C "$d" init -q && printf '%s\\n' "$1" > "$d/pattern" && git -C "$d" -c core.excludesFile="$d/pattern" check-ignore --no-index -q "$2"
code=$?
rm -rf "$d"
exit $code`;

async function patternMatchesFolderItself(run, source, folder, pattern) {
  const result = await run("sh", ["-c", IN_EMPTY_REPO, "sh", pattern, folder], source);
  return result.code === 0;
}

async function existingPaths(run, target, paths) {
  const existing = new Set();
  for (let at = 0; at < paths.length; at += CHUNK) {
    const script = 'for p; do if [ -e "$p" ] || [ -L "$p" ]; then printf "%s\\0" "$p"; fi; done';
    const result = await run("sh", ["-c", script, "sh", ...paths.slice(at, at + CHUNK)], target);
    for (const path of nul(result.stdout)) existing.add(path);
  }
  return existing;
}
