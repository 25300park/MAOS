import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface RepositoryEntry {
  content: string;
  path: string;
}

const protectedPath =
  /(^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|db|sqlite|sqlite3|log))$/i;
const generatedPath =
  /(^|\/)(?:node_modules|dist|build|coverage|logs?|cache|tmp)(\/|$)/i;
const highConfidenceSecret =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bsk-[A-Za-z0-9]{32,}\b/;

export function scanEntries(entries: readonly RepositoryEntry[]): string[] {
  const findings: string[] = [];
  for (const entry of entries) {
    const path = entry.path.replaceAll("\\", "/");
    if (protectedPath.test(path)) findings.push(`${path}:PROTECTED_PATH`);
    else if (generatedPath.test(path))
      findings.push(`${path}:GENERATED_ARTIFACT`);
    else if (highConfidenceSecret.test(entry.content))
      findings.push(`${path}:HIGH_CONFIDENCE_SECRET`);
  }
  return findings;
}

function repositoryEntries(): RepositoryEntry[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .map((path) => {
      const buffer = readFileSync(path);
      return {
        content: buffer.includes(0) ? "" : buffer.toString("utf8"),
        path,
      };
    });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const findings = scanEntries(repositoryEntries());
  if (findings.length > 0) {
    process.stderr.write(`${findings.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Repository secret/artifact scan: PASS\n");
  }
}
