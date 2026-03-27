import fs from "node:fs";
import path from "node:path";

interface ReportSymbol {
  id: string;
  name: string;
  kindName: string;
  filePath: string;
}

interface Report {
  packages: Array<{
    symbols: ReportSymbol[];
  }>;
}

const TS_REPORT_PATH = "packages/nci-core/nci-report.json";
const RUST_REPORT_PATH = "packages/nci-engine/nci-report-rust.json";

function fuzzyAudit(): void {
  if (!fs.existsSync(TS_REPORT_PATH) || !fs.existsSync(RUST_REPORT_PATH)) {
    console.error("❌ Error: Reports missing.");
    return;
  }

  const tsReport: Report = JSON.parse(fs.readFileSync(TS_REPORT_PATH, "utf-8"));
  const rustReport: Report = JSON.parse(fs.readFileSync(RUST_REPORT_PATH, "utf-8"));

  const tsSymbols = tsReport.packages[0]!.symbols;
  const rustSymbols = rustReport.packages[0]!.symbols;

  const rustSymbolIds = new Set(rustSymbols.map((item) => item.id));
  const missingInRust = tsSymbols.filter((item) => !rustSymbolIds.has(item.id));

  console.log(`🔍 FUZZY AUDIT: Analyzing ${missingInRust.length} missing IDs...\n`);

  const fuzzyMatches: string[] = [];
  const totalNamesakes = new Map<string, number>();

  missingInRust.forEach((tsSymbol) => {
    // strip # suffix for fuzzy matching (e.g. Random#3 -> Random)
    const baseName = tsSymbol.name.split("#")[0]!;
    
    // Find symbols in Rust that have the same name (or base name) and same file
    const matches = rustSymbols.filter((rustItem) => {
      const rustBaseName = rustItem.name.split("#")[0]!;
      return rustBaseName === baseName && rustItem.filePath === tsSymbol.filePath;
    });

    if (matches.length > 0) {
      fuzzyMatches.push(
        `TS: ${tsSymbol.id} (${tsSymbol.kindName}) -> RUST: ${matches.map(m => m.id).join(", ")}`
      );
      totalNamesakes.set(baseName, (totalNamesakes.get(baseName) || 0) + 1);
    }
  });

  console.log(`✅ FOUND ${fuzzyMatches.length} FUZZY MATCHES (Same Name/File, Different ID)\n`);
  
  if (fuzzyMatches.length > 0) {
    console.log("Top 10 Fuzzy Match Samples:");
    fuzzyMatches.slice(0, 10).forEach(matchLine => console.log(`   ${matchLine}`));
    
    console.log("\nTop Colliding Names (TS counts):");
    const sortedNames = Array.from(totalNamesakes.entries())
      .sort((itemA, itemB) => itemB[1] - itemA[1])
      .slice(0, 10);
    
    sortedNames.forEach(([name, count]) => {
      console.log(`   - ${name}: ${count} missing IDs`);
    });
  }

  const reallyMissing = missingInRust.filter(tsSymbol => {
    const baseName = tsSymbol.name.split("#")[0]!;
    return !rustSymbols.some(rustItem => {
        const rustBaseName = rustItem.name.split("#")[0]!;
        return rustBaseName === baseName && rustItem.filePath === tsSymbol.filePath;
    });
  });

  console.log(`\n❌ REALLY MISSING (No name/file match at all in Rust): ${reallyMissing.length}`);
  if (reallyMissing.length > 0) {
    reallyMissing.slice(0, 10).forEach(item => {
      console.log(`   - ${item.id} [${item.filePath}]`);
    });
  }
}

fuzzyAudit();
