import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const allowlistPath = resolve(projectRoot, "release/production-allowlist.txt");
const baseRef = process.env.RELEASE_BASE_REF || process.argv[2] || "origin/main";

const normalizePath = (value) => value.trim().replace(/^\.\//, "");

const readAllowlist = () =>
  readFileSync(allowlistPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(normalizePath);

const execGit = (args) =>
  execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();

const readStatusPaths = () => {
  const output = execGit(["status", "--short", "--untracked-files=all"]);
  if (!output) return [];

  return output
    .split("\n")
    .map((line) => line.replace(/^[ MADRCU?!]{1,2}\s+/, "").trim())
    .filter(Boolean)
    .map(normalizePath);
};

const readDiffPaths = (ref) => {
  const output = execGit(["diff", "--name-only", `${ref}...HEAD`]);
  if (!output) return [];
  return output.split("\n").map(normalizePath).filter(Boolean);
};

const uniq = (items) => [...new Set(items)];

const matchesRule = (file, rule) => {
  if (rule.endsWith("/**")) {
    const prefix = rule.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }

  return file === rule;
};

const allowlist = readAllowlist();
const changedFiles = uniq([...readDiffPaths(baseRef), ...readStatusPaths()]);

if (changedFiles.length === 0) {
  console.log(`[release:check] No changed files found against ${baseRef}.`);
  process.exit(0);
}

const disallowedFiles = changedFiles.filter(
  (file) => !allowlist.some((rule) => matchesRule(file, rule)),
);

if (disallowedFiles.length > 0) {
  console.error(`[release:check] Found files outside production allowlist (base: ${baseRef}):`);
  disallowedFiles.forEach((file) => console.error(`- ${file}`));
  console.error("\nAllowed patterns:");
  allowlist.forEach((rule) => console.error(`- ${rule}`));
  process.exit(1);
}

console.log(`[release:check] All changed files are allowed for production release (base: ${baseRef}).`);
changedFiles.forEach((file) => console.log(`- ${file}`));
