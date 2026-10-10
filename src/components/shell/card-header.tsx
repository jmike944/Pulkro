"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivityBell } from "./activity-feed";
import { type Crumb, useTrail } from "./crumbs";
import { SearchPill } from "./header-tools";
import { getMainScroller, onMainScroll } from "./main-scroll";

/**
 * The work panel's fixed top bar (desktop, from `lg`): breadcrumbs on the left, the ⌘K search pill and the activity bell on the
 * right. It sits above the scroller (`#main-scroll`) in the panel's flex column, so the page scrolls underneath it; its bottom
 * border and soft shadow appear once the page has scrolled. Below `lg` it does not render — phones and tablets keep the tools in
 * each PageHeader and the document scrolls as before.
 *
 * Its height is `--pk-card-header-h` (set in `app-shell.tsx`, which also subtracts it from `--pk-pane-h`).
 * Tab order follows the DOM: breadcrumbs → search → bell → page content.
 */
export function CardHeader() {
  const scrolled = useScrolled();
  return (
    <div
      data-card-header=""
      data-scrolled={scrolled || undefined}
      className={cn(
        // px = the scroller's lg:px-10 + the 10px scrollbar gutter it reserves on both edges, so the bar lines up with the content
        "relative z-20 hidden h-(--pk-card-header-h) shrink-0 items-center gap-4 border-b bg-surface px-[50px] transition-[border-color,box-shadow] duration-200 lg:flex print:hidden",
        scrolled ? "border-hairline shadow-[0_10px_18px_-14px_rgb(16_24_40/0.16)]" : "border-transparent shadow-[0_10px_18px_-14px_rgb(16_24_40/0)]",
      )}
    >
      <Breadcrumbs />
      <div className="flex shrink-0 items-center gap-2.5">
        <SearchPill />
        <ActivityBell compact />
      </div>
    </div>
  );
}

/** True once the main scroller has scrolled away from the top. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const sync = () => setScrolled((getMainScroller()?.scrollTop ?? 0) > 0);
    sync();
    return onMainScroll(sync);
  }, []);
  return scrolled;
}

/**
 * "Operación › Órdenes › OS-24391": group (plain text — a group has no page of its own), then links, then the current page.
 * Middle crumbs give way first when the line is tight; the group and the current page keep their room.
 */
function Breadcrumbs() {
  const trail = useTrail();
  if (trail.length === 0) return <div className="min-w-0 flex-1" />;
  return (
    <nav aria-label="Ruta" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-[14px]">
        {trail.map((c, i) => (
          <CrumbItem key={`${i}:${c.label}`} crumb={c} first={i === 0} last={i === trail.length - 1} />
        ))}
      </ol>
    </nav>
  );
}

function CrumbItem({ crumb, first, last }: { crumb: Crumb; first: boolean; last: boolean }) {
  // Only the current page gives up room when the line is tight (`truncate` needs the item to shrink); the group and the crumbs
  // before it keep their width — they are short — up to a cap.
  return (
    <li className={cn("flex min-w-0 items-center gap-1.5", last ? "shrink" : "max-w-[12rem] shrink-0")}>
      {!first && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ghost" />}
      {last ? (
        <span aria-current="page" title={crumb.label} className="truncate font-medium text-ink">
          {crumb.label}
        </span>
      ) : crumb.href ? (
        <Link
          href={crumb.href}
          title={crumb.label}
          className="-mx-1 truncate rounded-md px-1 py-1 text-subtle outline-none transition-colors hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/60"
        >
          {crumb.label}
        </Link>
      ) : (
        <span className="truncate text-subtle">{crumb.label}</span>
      )}
    </li>
  );
}
