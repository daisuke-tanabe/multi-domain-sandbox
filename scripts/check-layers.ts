import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * クリーンアーキテクチャの依存方向を検査する。ARCHITECTURE.md の「レイヤー規約」に対応する。
 *   domain → なし、application → domain、infrastructure → application / domain、interface → すべて
 * 相対 import はファイルの層で、パッケージ import は層ごとの許可リストで判定する。
 * 層の外にあるファイル (main、start、config、index、test-support、definition など) は検査しない。
 */
const ROOTS = [
  "packages/api-core/src",
  "apps/auth-api/src",
  "apps/crm-api/src",
  "apps/cms-api/src",
];
const LAYERS = ["domain", "application", "infrastructure", "interface"] as const;
type Layer = (typeof LAYERS)[number];
const RANK: Record<Layer, number> = { domain: 0, application: 1, infrastructure: 2, interface: 3 };

/** 層ごとに禁止する外部パッケージ。infrastructure と interface は制限しない */
const FORBIDDEN_PACKAGES: Record<Layer, ReadonlyArray<string>> = {
  domain: ["hono", "@hono/", "pg", "zod", "@sandbox/api-contract", "@aws-sdk/", "ioredis"],
  application: ["hono", "@hono/", "pg", "@sandbox/api-contract", "@aws-sdk/", "ioredis"],
  infrastructure: [],
  interface: [],
};

function layerOf(path: string): Layer | undefined {
  const segments = path.split("/");
  return LAYERS.find((layer) => segments.includes(layer));
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith(".ts")) yield path;
  }
}

const IMPORT_RE = /from\s+"([^"]+)"/g;
const violations: string[] = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const layer = layerOf(relative(root, file));
    // テストは対象と同じディレクトリに置くが、test-support など層の外を自由に使ってよい
    if (layer === undefined || file.endsWith(".test.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT_RE)) {
      const specifier = match[1] ?? "";
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        const targetLayer = layerOf(relative(root, target));
        if (targetLayer === undefined) {
          violations.push(`${file}: ${layer} は層の外 ${specifier} を参照できない`);
        } else if (RANK[targetLayer] > RANK[layer]) {
          violations.push(`${file}: ${layer} は ${targetLayer} を参照できない (${specifier})`);
        }
        continue;
      }
      if (specifier.startsWith("node:")) continue;
      const forbidden = FORBIDDEN_PACKAGES[layer].find(
        (pkg) => specifier === pkg || specifier.startsWith(pkg),
      );
      if (forbidden !== undefined) {
        violations.push(`${file}: ${layer} は ${specifier} を import できない`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  console.error(`\n${violations.length} 件の層の違反があります`);
  process.exit(1);
}
console.log("layer check passed");
