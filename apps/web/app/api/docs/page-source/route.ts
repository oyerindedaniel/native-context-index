import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveDocsRoot(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "apps", "web", "app", "docs"),
    path.join(cwd, "app", "docs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function pathnameToPageMdx(pathname: string): string | null {
  if (!pathname.startsWith("/docs")) {
    return null;
  }
  const rest = pathname.replace(/^\/docs\/?/, "").replace(/\/+$/, "");
  const segments = rest ? rest.split("/").filter(Boolean) : [];
  const root = resolveDocsRoot();
  if (!root) {
    return null;
  }
  const filePath = path.join(root, ...segments, "page.mdx");
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved)) {
    return null;
  }
  return resolved;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathname = url.searchParams.get("pathname") ?? "";
  const raw = url.searchParams.get("raw") === "1";

  const filePath = pathnameToPageMdx(pathname);
  if (!filePath || !existsSync(filePath)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const source = await readFile(filePath, "utf8");
    if (raw) {
      return new NextResponse(source, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'inline; filename="page.mdx"',
        },
      });
    }
    return NextResponse.json({ source });
  } catch {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}
