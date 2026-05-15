export interface FlagCopyInput {
  long?: string;
  short?: string;
  valuePlaceholder?: string;
  subcommand?: string;
  copyText?: string;
}

/** Paste-ready CLI fragment: `nci …` + subcommand chain + flag (+ value placeholder). */
export function buildFlagCopyText(flag: FlagCopyInput): string {
  if (flag.copyText) {
    return flag.copyText;
  }

  const flagToken = flag.long ?? flag.short ?? "";
  if (!flagToken) {
    return "";
  }

  const valueSuffix = flag.valuePlaceholder ? ` ${flag.valuePlaceholder}` : "";
  const flagClause = `${flagToken}${valueSuffix}`;

  if (!flag.subcommand || flag.subcommand === "global") {
    return `nci ${flagClause}`.trim();
  }

  return `nci ${flag.subcommand} ${flagClause}`.trim();
}
