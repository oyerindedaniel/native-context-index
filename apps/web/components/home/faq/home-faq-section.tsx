import Link from "next/link";
import { ArrowLongRightIcon } from "@heroicons/react/20/solid";
import {
  FaqItem,
  FaqList,
  FaqPanel,
  FaqRoot,
  FaqTrigger,
} from "@/components/home/faq/home-faq";
import { buttonVariants } from "@/components/ui/button";
import { HOME_FAQ_DEFAULT_OPEN_ID, HOME_FAQ_ITEMS } from "@/lib/home/home-faq";
import { cn } from "@/lib/utils";

export function HomeFaqSection() {
  return (
    <section
      className="bg-surface py-24 sm:py-32"
      aria-labelledby="home-faq-heading"
    >
      <div className="mx-auto max-w-[1050px] px-6">
        <div className="mb-12 max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
            Common questions
          </p>
          <h2
            id="home-faq-heading"
            className="mt-3 font-sans text-2xl font-semibold tracking-tight-sub text-ink sm:text-3xl"
          >
            Answers before you wire it in
          </h2>
          <p className="mt-6 text-base tracking-tight-p text-muted sm:text-lg">
            Short clarifications on what NCI indexes, how agents reach it, and
            what to expect in a real repo.
          </p>
        </div>

        <FaqRoot
          className="max-w-2xl"
          defaultOpenItemId={HOME_FAQ_DEFAULT_OPEN_ID}
        >
          <FaqList>
            {HOME_FAQ_ITEMS.map((faqItem) => (
              <FaqItem key={faqItem.id} itemId={faqItem.id}>
                <FaqTrigger itemId={faqItem.id}>{faqItem.question}</FaqTrigger>
                <FaqPanel itemId={faqItem.id}>{faqItem.answer}</FaqPanel>
              </FaqItem>
            ))}
          </FaqList>
        </FaqRoot>

        <div className="mt-10 max-w-2xl">
          <Link
            href="/docs"
            className={cn(
              buttonVariants({ variant: "outline", size: "md" }),
              "group inline-flex gap-2",
            )}
          >
            <span>Read the Introduction</span>
            <ArrowLongRightIcon
              className="size-4 shrink-0 text-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
