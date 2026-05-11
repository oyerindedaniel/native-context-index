"use client";

import * as React from "react";
import {
  AgentLoopRoot,
  AgentLoopStage,
  AgentLoopProgress,
  AgentLoopControls,
  type AgentLoopFrameDescriptor,
} from "@/components/docs/widgets/agent-loop";
import { AgentLoopCode } from "@/components/docs/widgets/agent-loop-code";

const PKG_QUERY_ACTIVE = `{
  "subcommand": "active_package",
  "name": "zod"
}`;

const PKG_QUERY_EVIDENCE = `{
  "subcommand": "evidence",
  "package_name": "zod",
  "package_version": "3.23.8",
  "symbols": ["ZodObject"]
}`;

const TOOL_RESULT_JSON = `{
  "ok": true,
  "data": {
    "symbols": [
      {
        "id": "zod@3.23.8::ZodObject",
        "name": "ZodObject",
        "kindName": "ClassDeclaration"
      }
    ],
    "snippets": {
      "zod@3.23.8::ZodObject":
        "ZodObject<T extends ZodRawShape, …>\\n  omit<Mask>(mask): ZodObject<…>"
    }
  }
}`;

const RESPONSE_TS = `const Profile = z.object({
  name: z.string(),
  age: z.number(),
}).pick({ name: true });`;

const FRAMES: AgentLoopFrameDescriptor[] = [
  {
    id: "thought-1",
    kind: "thought",
    label: "I need the shape of zod's ZodObject",
    body: (
      <p>
        The user asked for an object schema. I should look up{" "}
        <code className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
          ZodObject
        </code>{" "}
        in their installed version of zod before I write a snippet — and pin the
        exact{" "}
        <code className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
          package_version
        </code>
        .
      </p>
    ),
    durationMs: 2400,
  },
  {
    id: "tool-call-1",
    kind: "toolCall",
    label: "nci_query · subcommand: active_package",
    body: <AgentLoopCode code={PKG_QUERY_ACTIVE} language="json" />,
    durationMs: 2200,
  },
  {
    id: "tool-call-2",
    kind: "toolCall",
    label: "nci_query · subcommand: evidence",
    body: <AgentLoopCode code={PKG_QUERY_EVIDENCE} language="json" />,
    durationMs: 2400,
  },
  {
    id: "tool-result-1",
    kind: "toolCall",
    label: "ok: true · data.symbols + data.snippets",
    body: <AgentLoopCode code={TOOL_RESULT_JSON} language="json" />,
    durationMs: 2600,
  },
  {
    id: "response",
    kind: "response",
    label: "Cite from data.snippets — done.",
    body: <AgentLoopCode code={RESPONSE_TS} language="typescript" />,
    durationMs: 2800,
  },
];

export function IntegrationAgentLoopDemo() {
  return (
    <AgentLoopRoot frames={FRAMES}>
      <div className="flex min-w-0 w-full items-center justify-between gap-3">
        <AgentLoopProgress />
        <AgentLoopControls />
      </div>
      <AgentLoopStage />
    </AgentLoopRoot>
  );
}
