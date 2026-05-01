import { FeatureCard } from "../features/feature-card";

export function IntegrationsSection() {
  return (
    <section className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-[1050px] px-6">
        <div className="mb-16 max-w-2xl">
          <h2 className="font-instrument-serif text-4xl font-normal text-ink sm:text-5xl">
            Interfaces for humans and agents
          </h2>
          <p className="mt-6 text-lg text-muted tracking-tight-p">
            NCI exposes its relational index through a high-performance CLI and
            a native MCP server for AI agents.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <FeatureCard
            title="CLI"
            body="Initialize, index, and query your declaration graph with a single native binary. Built for sub-millisecond response times and zero-config setup."
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            }
          />
          <FeatureCard
            title="MCP"
            body="Bridge the gap between code and intelligence. Connect AI agents directly to your local index via the Model Context Protocol."
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}
