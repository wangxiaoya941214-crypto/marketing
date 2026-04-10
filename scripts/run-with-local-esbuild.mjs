import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const binaryName = process.platform === "win32" ? "esbuild.exe" : "esbuild";
const packageName = `${process.platform}-${process.arch}`;

const commandArgs = process.argv.slice(2);

if (commandArgs.length === 0) {
  console.error("No command provided.");
  process.exit(1);
}

const [scriptPath, ...scriptArgs] = commandArgs;
const resolvedScriptPath = resolve(projectRoot, scriptPath);

const findBinaryForScript = (entryPath) => {
  const candidatePaths = [];
  let currentDir = dirname(entryPath);

  while (currentDir.startsWith(projectRoot)) {
    candidatePaths.push(resolve(currentDir, `node_modules/@esbuild/${packageName}/bin/${binaryName}`));

    if (currentDir === projectRoot) {
      break;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  candidatePaths.push(resolve(projectRoot, `node_modules/@esbuild/${packageName}/bin/${binaryName}`));
  return candidatePaths.find((candidate) => existsSync(candidate));
};

const sourceBinary = findBinaryForScript(resolvedScriptPath);

if (!sourceBinary) {
  console.error(`Unable to find an esbuild binary for ${packageName}.`);
  process.exit(1);
}

const child = spawn(process.execPath, [resolvedScriptPath, ...scriptArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    ESBUILD_BINARY_PATH: sourceBinary,
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
