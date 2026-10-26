import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");

function copyWorkspacePackage(
  artifactRoot: string,
  sourcePath: string,
  packageName: string,
): void {
  const target = join(artifactRoot, "node_modules", "@maos", packageName);
  mkdirSync(target, { recursive: true });
  cpSync(join(repositoryRoot, sourcePath, "dist"), join(target, "dist"), {
    recursive: true,
  });
  writeFileSync(
    join(target, "package.json"),
    readFileSync(join(repositoryRoot, sourcePath, "package.json")),
  );
}

test("serverless Web artifact imports without the database workspace package", () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), "maos-web-serverless-"));
  const webRoot = join(artifactRoot, "apps", "web");
  mkdirSync(webRoot, { recursive: true });
  cpSync(join(repositoryRoot, "apps", "web", "dist"), join(webRoot, "dist"), {
    recursive: true,
  });
  writeFileSync(
    join(webRoot, "package.json"),
    readFileSync(join(repositoryRoot, "apps", "web", "package.json")),
  );

  copyWorkspacePackage(artifactRoot, "packages/config", "config");
  copyWorkspacePackage(artifactRoot, "packages/logging", "logging");
  copyWorkspacePackage(artifactRoot, "modules/operations", "module-operations");

  const entrypoint = pathToFileURL(join(webRoot, "dist", "server.js")).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(entrypoint)})`,
    ],
    { cwd: artifactRoot, encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    "the Web serverless entrypoint must not load the database package",
  );
});
