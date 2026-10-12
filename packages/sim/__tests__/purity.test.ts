/**
 * Guards CLAUDE.md "The one rule" and the dependency arrow in "Architecture"
 * mechanically, so a violation fails the suite instead of surviving review.
 * Lint is easy to disable inline; this is not. Comments are stripped first —
 * the rules are discussed in the source and that must not trip the check.
 *
 * Every file under src/ is checked, at any depth, so content tables in
 * subdirectories are held to the same rules as the engine.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PKG = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(PKG, "src");

type SourceFile = { name: string; path: string; code: string };

function sourceFiles(): SourceFile[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((name) => {
      const path = join(SRC, name);
      return {
        name,
        path,
        code: readFileSync(path, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, ""),
      };
    });
}

/** Every module specifier: static, side-effect, re-export, dynamic, require. */
function importSpecifiers(code: string): string[] {
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const out: string[] = [];
  for (const p of patterns) for (const m of code.matchAll(p)) out.push(m[1]!);
  return out;
}

const BANNED: { label: string; pattern: RegExp }[] = [
  { label: "Math.random (use rng.ts)", pattern: /Math\.random/ },
  { label: "wall clock (time is the tick counter)", pattern: /Date\.now|performance\.now|new Date\b/ },
  { label: "DOM access", pattern: /\bwindow\b|\bdocument\b|globalThis\./ },
  {
    label: "browser globals",
    pattern: /\b(navigator|localStorage|sessionStorage|requestAnimationFrame|HTML\w*Element|CanvasRenderingContext2D)\b/,
  },
  { label: "render or framework import", pattern: /from\s+["'](pixi\.js|@pixi\/|react|next|zustand)/ },
  { label: "Math.sqrt (not guaranteed reproducible — use isqrt)", pattern: /Math\.sqrt/ },
];

describe("the sim stays pure (CLAUDE.md, the one rule)", () => {
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
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual([]);
  });

  it("compiles without DOM types", () => {
    const base = JSON.parse(readFileSync(join(PKG, "..", "..", "tsconfig.base.json"), "utf8")) as {
      compilerOptions: { lib?: string[] };
    };
    const own = JSON.parse(readFileSync(join(PKG, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { lib?: string[]; types?: string[] };
    };
    const lib = own.compilerOptions?.lib ?? base.compilerOptions.lib ?? [];
    expect(lib.length).toBeGreaterThan(0); // unset lib would mean the default, which includes DOM
    expect(lib.filter((l) => /^dom/i.test(l))).toEqual([]);
    expect(own.compilerOptions?.types).toEqual([]);
  });
});

describe("the dependency arrow (CLAUDE.md, architecture)", () => {
  const files = sourceFiles();

  it("finds the imports it checks", () => {
    expect(files.flatMap((f) => importSpecifiers(f.code)).length).toBeGreaterThan(10);
  });

  it("imports nothing from apps/web or packages/levels, by package name or by path", () => {
    const offenders = files.flatMap((f) =>
      importSpecifiers(f.code)
        .filter((s) => /^@siege\/(web|levels)\b|apps\/web|packages\/levels|\/levels\//.test(s))
        .map((s) => `${f.name}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it("imports only relative paths that stay inside packages/sim/src", () => {
    const offenders = files.flatMap((f) =>
      importSpecifiers(f.code)
        .filter((s) => {
          if (!s.startsWith("./") && !s.startsWith("../")) return true;
          const target = relative(SRC, resolve(dirname(f.path), s));
          return target.startsWith("..") || target.startsWith(sep);
        })
        .map((s) => `${f.name}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
