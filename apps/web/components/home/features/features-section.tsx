import { FeatureCard } from "./feature-card";

export function FeaturesSection() {
  return (
    <section className="bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-[1050px] px-6">
        <div className="mb-16 max-w-2xl">
          <h2 className="font-instrument-serif text-4xl font-normal text-ink sm:text-5xl">
            Built for day-to-day engineering decisions
          </h2>
          <p className="mt-6 text-lg text-muted tracking-tight-p">
            Four practical workflows where NCI removes API guesswork and speeds
            up your development cycle.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <FeatureCard
            title="Search Real API Surfaces"
            body="Query exported symbols directly from declaration graphs to find what a package really exposes, beyond simple documentation."
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
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            }
          />
          <FeatureCard
            title="Trace Dependency Context"
            body="Inspect package versions and declared dependencies to understand integration impact before shipping to production."
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            }
          />
          <FeatureCard
            title="Build Fast, Repeatable Indexes"
            body="Index large node modules trees with cache-aware workflows so lookup stays fast across daily iteration."
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
                />
              </svg>
            }
          />
          <FeatureCard
            title="Discover Invisible Semantics"
            body="Extract deprecation warnings, version tags, and visibility levels directly from source JSDoc to avoid using outdated or internal APIs."
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                className="size-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.644m17.928.644a1.012 1.012 0 0 1 0-.644M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}
