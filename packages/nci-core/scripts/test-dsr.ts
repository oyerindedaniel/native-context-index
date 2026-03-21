import path from "node:path";
import { crawl } from "../src/crawler.js";
import { buildPackageGraph } from "../src/graph.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const entryFile = path.resolve(__dirname, "../fixtures/cross-package-resolution/meta-package/index.d.ts");

console.log("Crawling meta-package...");
const result = crawl(entryFile, { maxDepth: 5 });

console.log(`Visited ${result.visitedFiles.length} files:`);
result.visitedFiles.forEach(f => console.log(` - ${path.relative(path.resolve(__dirname, ".."), f)}`));

const graph = buildPackageGraph({
  name: "meta-package",
  version: "1.0.0",
  dir: path.dirname(entryFile)
}, { maxDepth: 5 });

console.log("\nResolved Symbols in 'meta-package':");
for (const symbol of graph.symbols) {
  console.log(`[${symbol.kindName}] ${symbol.name}`);
  console.log(`  ID: ${symbol.id}`);
  console.log(`  Defined In: ${path.relative(path.resolve(__dirname, ".."), symbol.filePath)}`);
  console.log(`  Signature: ${symbol.signature}`);
  
  if (symbol.dependencies.length > 0) {
    console.log(`  Dependencies: ${symbol.dependencies.join(", ")}`);
  }

  if (symbol.isInherited) {
    console.log(`  Inherited from: ${symbol.inheritedFrom}`);
  }
}
