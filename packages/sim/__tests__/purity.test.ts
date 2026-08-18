/**
 * Guards the hard prohibitions in CLAUDE.md §3 mechanically, so a violation
 * fails the suite instead of surviving review. Comments are stripped first —
 * §3 is discussed in the source and that must not trip the check.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");

function sourceFiles(): { name: string; code: string }[] {
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".ts"))
    .map((name) => ({
      name,
      code: readFileSync(join(SRC, name), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, ""),
    }));
}

const BANNED: { label: string; pattern: RegExp }[] = [
  { label: "Math.random (use rng.ts)", pattern: /Math\.random/ },
  { label: "wall clock (time is the tick counter)", pattern: /Date\.now|performance\.now|new Date\b/ },
  { label: "DOM access", pattern: /\bwindow\b|\bdocument\b|globalThis\./ },
  { label: "render or framework import", pattern: /from\s+["'](pixi\.js|react|next|zustand)/ },
  { label: "Math.sqrt (not guaranteed reproducible — use isqrt)", pattern: /Math\.sqrt/ },
];

describe("the sim stays pure (§3)", () => {
  const files = sourceFiles();

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const { label, pattern } of BANNED) {
    it(`contains no ${label}`, () => {
      const offenders = files.filter((f) => pattern.test(f.code)).map((f) => f.name);
      expect(offenders).toEqual([]);
    });
  }

  it("declares zero runtime dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(SRC, "..", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
