import { notFound } from "next/navigation";

/** Unknown `/docs/*` paths (no matching MDX page) render `app/docs/not-found.tsx`. */
export default function DocsUnknownPage() {
  notFound();
}
