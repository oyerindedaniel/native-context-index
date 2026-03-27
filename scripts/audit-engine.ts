import fs from "node:fs";
import path from "node:path";

interface ReportSymbol {
  id: string;
  name: string;
  kindName: string;
  filePath: string;
}

interface ReportPackage {
  symbols: ReportSymbol[];
  totalFiles?: number;
  total_files?: number;
}

interface Report {
  packages: ReportPackage[];
}

const TS_REPORT_PATH = "packages/nci-core/nci-report.json";
const RUST_REPORT_PATH = "packages/nci-engine/nci-report-rust.json";

function analyzeReports(): void {
  if (!fs.existsSync(TS_REPORT_PATH) || !fs.existsSync(RUST_REPORT_PATH)) {
    console.error("❌ Error: One or both report files are missing.");
    return;
  }

  const tsReport: Report = JSON.parse(fs.readFileSync(TS_REPORT_PATH, "utf-8"));
  const rustReport: Report = JSON.parse(fs.readFileSync(RUST_REPORT_PATH, "utf-8"));

  const tsPackage = tsReport.packages[0]!;
  const rustPackage = rustReport.packages[0]!;

  const tsSymbolIds = new Set(tsPackage.symbols.map((symbolNode) => symbolNode.id));
  const rustSymbolIds = new Set(rustPackage.symbols.map((symbolNode) => symbolNode.id));

  const onlyInTs = tsPackage.symbols.filter((symbolNode) => !rustSymbolIds.has(symbolNode.id));
  const onlyInRust = rustPackage.symbols.filter((symbolNode) => !tsSymbolIds.has(symbolNode.id));

  const tsFiles = new Set(tsPackage.symbols.map((symbolNode) => symbolNode.filePath));
  const rustFiles = new Set(rustPackage.symbols.map((symbolNode) => symbolNode.filePath));

  const filesOnlyInRust = Array.from(rustFiles).filter((filePath) => !tsFiles.has(filePath));

  console.log("🔍 NCI ENGINE AUDIT REPORT (SUMMARY)\n");
  console.log(`📦 Symbols (TS):   ${tsPackage.symbols.length}`);
  console.log(`📦 Symbols (Rust): ${rustPackage.symbols.length}`);
  console.log(`📂 Unique Files (TS):     ${tsFiles.size}`);
  console.log(`📂 Unique Files (Rust):   ${rustFiles.size}\n`);

  if (onlyInTs.length > 0) {
    console.log(`❌ Symbols missing in Rust (${onlyInTs.length}):`);
    onlyInTs.forEach((symbolNode) => {
      console.log(`   - ${symbolNode.id} (${symbolNode.kindName}) [${symbolNode.filePath}]`);
    });
    console.log("");
  }

  if (onlyInRust.length > 0) {
    console.log(`➕ Extra symbols in Rust (${onlyInRust.length}):`);
    onlyInRust.slice(0, 10).forEach((symbolNode) => {
      console.log(`   - ${symbolNode.id} (${symbolNode.kindName}) [${symbolNode.filePath}]`);
    });
    if (onlyInRust.length > 10) console.log("   ...");
    console.log("");
  }

  if (filesOnlyInRust.length > 0) {
    console.log(`📄 Directory Summary for Extra Files in Rust (${filesOnlyInRust.length}):`);
    const directoryCounts = new Map<string, number>();
    filesOnlyInRust.forEach((filePath) => {
      const directoryPath = path.dirname(filePath);
      directoryCounts.set(directoryPath, (directoryCounts.get(directoryPath) || 0) + 1);
    });

    Array.from(directoryCounts.entries())
      .sort((countA, countB) => countB[1] - countA[1])
      .forEach(([dir, count]) => {
        console.log(`   - ${dir}: ${count} files`);
      });
  }

  if (onlyInTs.length === 0 && onlyInRust.length === 0 && filesOnlyInRust.length === 0) {
    console.log("✅ PARITY ACHIEVED: Both engines produced identical symbol sets and file visibility.");
  }
}

analyzeReports();
