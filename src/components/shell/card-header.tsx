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
 * The work panel's fixed top bar (desktop, from `lg`): breadcrumbs on the left, the ⌘K search pill centered (the palette opens
 * out of it, aligned under it — command-menu.tsx) and the activity bell on the right. It sits above the scroller (`#main-scroll`) in the panel's flex column, so the page scrolls underneath it; its bottom
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
        // Equal side columns keep the pill in the middle of the bar whatever the breadcrumbs measure.
        "relative z-20 hidden h-(--pk-card-header-h) shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b bg-surface px-[50px] transition-[border-color,box-shadow] duration-200 lg:grid print:hidden",
        scrolled ? "border-hairline shadow-[0_10px_18px_-14px_rgb(16_24_40/0.16)]" : "border-transparent shadow-[0_10px_18px_-14px_rgb(16_24_40/0)]",
      )}
    >
      <Breadcrumbs />
      <SearchPill />
      <div className="flex items-center justify-end">
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
 * They live in the half-bar left of the centered search. Below xl (the expanded sidebar names the group already) the group is
 * left out; the links give way before the current page when the line is still tight.
 */
function Breadcrumbs() {
  const trail = useTrail();
  if (trail.length === 0) return <div className="min-w-0" />;
  return (
    <nav aria-label="Ruta" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[14px]">
        {trail.map((c, i) => (
          <CrumbItem key={`${i}:${c.label}`} crumb={c} index={i} last={i === trail.length - 1} />
        ))}
      </ol>
    </nav>
  );
}

function CrumbItem({ crumb, index, last }: { crumb: Crumb; index: number; last: boolean }) {
  // The group (index 0, when there is a trail after it) only from xl; the crumb after it then drops its chevron too. `truncate`
  // needs the items to shrink: the links shrink fully, the current page at a fraction, so it keeps most of its name.
  const group = index === 0 && !last;
  return (
    <li className={cn("flex min-w-0 items-center gap-1.5", group && "max-xl:hidden", last ? "shrink-[0.35]" : "max-w-[12rem] shrink")}>
      {index > 0 && <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-ghost", index === 1 && "max-xl:hidden")} />}
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
