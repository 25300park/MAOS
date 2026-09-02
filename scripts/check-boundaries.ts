import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP_PACKAGES = new Set(["@maos/api", "@maos/web", "@maos/worker"]);

export function validateDependency(
  source: string,
  dependency: string,
): string | undefined {
  const normalized = source.replaceAll("\\", "/");
  const targetsApp = APP_PACKAGES.has(dependency);
  const targetsModule = dependency.startsWith("@maos/module-");

  if (normalized.startsWith("packages/") && (targetsApp || targetsModule)) {
    return "packages cannot import apps or modules";
  }
  if (normalized.startsWith("modules/") && targetsApp) {
    return "modules cannot import apps";
  }
  if (normalized.startsWith("modules/") && targetsModule) {
    return "modules cannot import other modules";
  }
  return undefined;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== "dist" &&
      entry.name !== "node_modules"
    )
      return sourceFiles(path);
    return entry.isFile() && extname(entry.name) === ".ts" ? [path] : [];
  });
}

export function checkBoundaries(root = process.cwd()): string[] {
  const violations: string[] = [];
  const importPattern = /(?:from\s+|import\s*\()['"]([^'"]+)['"]/g;

  for (const area of ["apps", "modules", "packages"]) {
    for (const file of sourceFiles(join(root, area))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(importPattern)) {
        const dependency = match[1];
        if (!dependency) continue;
        const violation = validateDependency(relative(root, file), dependency);
        if (violation)
          violations.push(
            `${relative(root, file)} -> ${dependency}: ${violation}`,
          );
      }
    }
  }
  return violations;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const violations = checkBoundaries();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Architecture/module boundaries: PASS");
  }
}
