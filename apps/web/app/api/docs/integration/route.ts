import {
  buildIntegration,
  buildIntegrationIndex,
  INTEGRATION_HOSTS,
} from "@repo/nci-agent-primer/integration";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MARKDOWN_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": "public, max-age=300",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = (url.searchParams.get("host") ?? "").trim().toLowerCase();

  if (!host) {
    return new NextResponse(buildIntegrationIndex(), {
      headers: MARKDOWN_HEADERS,
    });
  }

  const body = buildIntegration(host);
  if (!body) {
    return NextResponse.json(
      {
        error: "unknown_host",
        hosts: [...INTEGRATION_HOSTS],
      },
      { status: 404 },
    );
  }

  return new NextResponse(body, { headers: MARKDOWN_HEADERS });
}
