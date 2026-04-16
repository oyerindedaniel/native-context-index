import fs from "node:fs";
import path from "node:path";

interface SymbolEntry {
  name: string;
  id: string;
  filePath: string;
  kindName: string;
}

interface Report {
  packages: Array<{
    symbols: SymbolEntry[];
  }>;
}

const RUST_REPORT = path.resolve("packages/nci-engine/nci-report-rust.json");
const TS_REPORT = path.resolve("packages/nci-core/nci-report.json");

if (!fs.existsSync(RUST_REPORT) || !fs.existsSync(TS_REPORT)) {
  console.error("❌ Reports missing! Run both demo scripts first.");
  process.exit(1);
}

const rustData: Report = JSON.parse(fs.readFileSync(RUST_REPORT, "utf8"));
const tsData: Report = JSON.parse(fs.readFileSync(TS_REPORT, "utf8"));

const rustSymbols = rustData.packages[0].symbols;
const tsSymbols = tsData.packages[0].symbols;

console.log(`\n📊 Stat Comparison:`);
console.log(`   Rust symbols: ${rustSymbols.length.toLocaleString()}`);
console.log(`   TS symbols:   ${tsSymbols.length.toLocaleString()}`);
console.log(
  `   Gap:          ${(tsSymbols.length - rustSymbols.length).toLocaleString()}`,
);

const getSymbolKey = (symbol: SymbolEntry) =>
  `${path.basename(symbol.filePath)}::${symbol.name}`;

const rustSet = new Set(rustSymbols.map(getSymbolKey));
const missingInRust = tsSymbols.filter(
  (symbol) => !rustSet.has(getSymbolKey(symbol)),
);

console.log(
  `\n🔍 Analysis of ${missingInRust.length} missing symbols in Rust:`,
);

const kindCounts: Record<string, number> = {};
missingInRust.forEach((symbol) => {
  kindCounts[symbol.kindName] = (kindCounts[symbol.kindName] || 0) + 1;
});

console.log(`\nTop missing Symbol Kinds:`);
Object.entries(kindCounts)
  .sort((entryA, entryB) => entryB[1] - entryA[1])
  .slice(0, 10)
  .forEach(([kind, count]) => {
    const percentage = ((count / missingInRust.length) * 100).toFixed(1);
    console.log(
      ` - ${kind.padEnd(25)} ${count.toString().padStart(5)} (${percentage}%)`,
    );
  });

const fileCounts: Record<string, number> = {};
missingInRust.forEach((symbol) => {
  const fileName = path.basename(symbol.filePath);
  fileCounts[fileName] = (fileCounts[fileName] || 0) + 1;
});

console.log(`\nTop files with gaps:`);
Object.entries(fileCounts)
  .sort((entryA, entryB) => entryB[1] - entryA[1])
  .slice(0, 5)
  .forEach(([fileName, count]) => {
    console.log(` - ${fileName.padEnd(30)} ${count} symbols missing`);
  });

console.log(`\nExample missing symbols:`);
missingInRust.slice(0, 15).forEach((symbol) => {
  console.log(
    ` - [${symbol.kindName}] ${symbol.name} (in ${path.basename(symbol.filePath)})`,
  );
});
