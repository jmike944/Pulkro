"use client";

/**
 * The hook moved to `@/components/pk/use-open-session` (one implementation for every modal); re-exported so existing
 * imports keep working. New code imports it from there.
 */
export { useOpenSession } from "@/components/pk/use-open-session";

/**
 * Footer buttons of the scheduling / crew modals. On phones (the modal is a FlowScreen) the primary action is the
 * 54px navy BigButton of the other flows; from lg it is the regular 44px dialog button.
 */
export const FOOTER_PRIMARY =
  "h-11 gap-2 rounded-[12px] px-5 text-[14px] font-semibold max-lg:h-[54px] max-lg:rounded-[14px] max-lg:text-[17px] max-lg:[&_svg:not([class*='size-'])]:size-5";
export const FOOTER_SECONDARY =
  "h-11 gap-2 rounded-[12px] border-line px-5 text-[14px] font-semibold max-lg:h-[54px] max-lg:rounded-[14px] max-lg:text-[17px] max-lg:[&_svg:not([class*='size-'])]:size-5";
