# Pulkro Cuadrillas — build conventions

Internal ERP for **Pulkro** (cleaning services, Monterrey, since 1985) to run field crews
("cuadrillas") from an authorized order to the client report and post-sale follow-up.
Requirements: `docs/requisitos.md` (read the sections for your module) · flow: `docs/flujo-operativo.png`.
UI language: **Spanish (México)**, usted-neutral, short and concrete. No English in the UI.

## Stack
- Next.js 16.4 App Router, **Cache Components on** (`cacheComponents: true`). React 19.3. TypeScript strict.
- Tailwind v4 (tokens in `src/app/globals.css`), shadcn/ui (Radix, `asChild` works) in `src/components/ui`.
- `motion` v14 → `import { motion, AnimatePresence } from "motion/react"`.
- zustand v5 store in `src/lib/store.ts` (persisted to IndexedDB, offline-first). lucide-react icons (named imports only — never `import * as`).
- date-fns v4 + `es` locale via helpers in `src/lib/format.ts`.

## Route pattern (Cache Components!)
Every page is a tiny **server** component that renders a **client** view from `src/features/<module>/`:

```tsx
// src/app/(app)/ordenes/page.tsx
import type { Metadata } from "next";
import { OrdersView } from "@/features/ordenes/orders-view";
export const metadata: Metadata = { title: "Órdenes" };
export default function Page() { return <OrdersView />; }
```

Dynamic params — pass the promise into Suspense, unwrap with `use()` in the client view:

```tsx
// src/app/(app)/ordenes/[folio]/page.tsx
import { Suspense } from "react";
import { OrderDetailView } from "@/features/orden/order-detail-view";
export default function Page({ params }: PageProps<"/ordenes/[folio]">) {
  return <Suspense fallback={null}><OrderDetailView params={params} /></Suspense>;
}
// client: const { folio } = use(params);
```

- Components using `useSearchParams()` MUST be inside a `<Suspense>` boundary.
- Do not use `"use cache"`, server actions, route handlers or `fetch` — all data is local (store).
- The `(app)` layout already renders the shell (sidebar, mobile nav, ⌘K, sync sheet) and waits for the store to hydrate, so views can read the store immediately.

## Data access (read `src/lib/hooks.ts`, `src/lib/store.ts`, `src/lib/types.ts`)
- `useScopedData()` → orders + related collections the **current role may see** (doc §2). Use this for lists/KPIs.
- `useOrderBundle(folioOrId)`, `useJornadaBundle(id)`, `useLookups()` (id→entity Maps), `useCurrentUser()`, `useCan(action)`, `useIsOffline()`, `useSyncSummary()`, `useNow(ms)`.
- Mutations: call store actions (`useAppStore((s) => s.checkIn)` …). They write the audit trail + sync queue for you. Never mutate arrays in place.
- **zustand v5 pitfall:** a selector must not build new arrays/objects (`s => s.orders.filter(...)` → infinite loop). Select raw slices and derive with `useMemo`, or use `useShallow`.
- Business rules live in `src/lib/domain.ts` (`orderEvidence`, `closureBlockers`, `nextAction`, `jornadaMinutes`, `whatsappLink`, `mailtoLink`, `mapsLink`). Indicators in `src/lib/metrics.ts`. Reuse, don't re-implement.
- Status labels/tones: `src/lib/status.ts` (`ORDER_STATUS`, `INCIDENT_TYPE`, `CASE_STATUS`, `SEVERITY`, …). Permissions: `src/lib/permissions.ts` — hide or disable actions the role can't do and say why in a tooltip.

## Design language (match the Clawback reference screens)
Read `src/features/inicio/dashboard-view.tsx` — it is the reference implementation. Then reuse:

| Need | Use |
|---|---|
| Page title row (serif title, narrative description with `<b>`, actions, `breadcrumb` for detail pages) | `PageHeader` from `@/components/pk/page` |
| ONE hero KPI block per page | `AuroraPanel` + `GlassCard` (`@/components/pk/aurora`) |
| Featured side card (e.g. "Listo para cierre") | `AuroraFrame` |
| Month bars / funnel capsules | `PillBars`, `CapsuleMeter` (`@/components/pk/pill-bars`) |
| Tabs with counts / segmented toggles | `UnderlineTabs`, `Segmented` (`@/components/pk/page`) |
| Status | `OrderStatusPill`, `TonePill`, `StatusDot`, `ToneText`, `SoftBadge` (`@/components/pk/status`) |
| Numbers | `AnimatedNumber` (`@/components/pk/bits`) — big KPI numbers `font-medium tracking-[-0.04em]` |
| Lists | `DateBadge`, `PersonAvatar`, `AvatarStack`, `SectionHeader`, `UnderlineLink`, `CornerLink`, `BarList`, `ProgressLine`, `MiniStat`, `IconTile`, `Insight`, `KeyValues`, `Panel`, `Eyebrow` (`@/components/pk/bits`) |
| Lifecycle | `Timeline` (`@/components/pk/timeline`) |
| Photos | `PhotoThumb`, `PhotoImage`, `BeforeAfter` (squeegee slider) (`@/components/pk/scene-photo`) |
| Capture photos | `PhotoCaptureButtons`, `usePhotoCapture`, `areaSuggestions` (`@/components/pk/photo-capture`) |
| Incidents | `IncidentSheet`, `INCIDENT_ICONS` (`@/components/pk/incident-sheet`) |
| Crew | `CrewPicker` (`@/components/pk/crew-picker`) |
| Maps / GPS | `GeoMap`, `readPosition`, `distanceMeters` (`@/components/pk/geo-map`) |
| Client logo | `ClientMark` (`@/components/pk/client-mark`) |
| Empty / loading / celebration | `EmptyState`, `Shimmer` (`@/components/pk/feedback`); fire the global burst with `useUi.getState().fireCelebrate()` (`@/lib/ui-store`) |
| Motion | `FadeIn`, `Stagger`/`StaggerItem`, `rowVariants`, `staggerContainer`, `EASE`, `pressable` (`@/components/pk/motion`) |
| Excel | `exportToExcel(filename, sheets)` (`@/lib/export`) |

Visual rules:
- **Desktop work panel (≥ lg):** the panel is fixed in the window; its top is a fixed **card header** (`src/components/shell/card-header.tsx`:
  breadcrumbs on the left, the ⌘K search pill and the notifications bell on the right) and the page scrolls inside `#main-scroll` underneath it
  (hairline + soft shadow appear once scrolled). Pages never draw search/bell themselves: `PageHeader` only draws them below `lg`. Breadcrumbs
  come from `nav.ts` (`Operación › Órdenes`); a detail page adds its tail by passing `breadcrumb` to `PageHeader` (`[{ label: "Órdenes", href: "/ordenes" }, { label: folio }]`),
  or `usePublishCrumbs()` (`shell/crumbs.ts`) where it has no PageHeader — the card header prefixes the group and shows it at `lg+`, PageHeader keeps
  its back-chevron trail below `lg`. Size sticky asides with `--pk-pane-h` (the scroller's height, header excluded), never `100dvh`.
- Canvas `bg-canvas`, the work panel (`bg-panel`) is provided by the shell. Cards: `rounded-[22px] border border-hairline bg-surface shadow-soft` (or `Panel`).
- Ink `text-ink`, secondary `text-subtle`, links `text-link`. Primary buttons are navy (`Button` default), secondary = `variant="outline"`. Buttons in tables: `h-10 rounded-[12px] px-4 font-semibold`.
- Section titles: `text-[19px] font-medium`. Table headers: `text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle`. Rows separated by `border-b border-hairline`, generous `py-4`.
- Two-column content under a hero: `grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]` with a vertical `lg:border-r` divider.
- Side detail panes = shadcn `Sheet` (right on desktop, `side="bottom"` on mobile via `useMediaQuery("(min-width: 768px)")`), title in `font-serif text-[26px]`.
- Confirmation modals = shadcn `Dialog` with a key-value summary and an explicit confirm checkbox (see the "Submit claim" reference).
- Animate with intent: stagger list rows (`rowVariants`), spring layout transitions (`layout`, `layoutId`), counters, bars growing. Respect reduced motion (MotionConfig is global). Never animate layout-thrashing properties in loops.
- **Mobile-first**: the doc says the product is used on phones by all roles. Every screen must work at 375px: stack columns, tables become cards (`md:` breakpoints), tap targets ≥ 40px, no horizontal page scroll. The shell adds `pb-28` for the bottom nav.
- Copy: Spanish, sentence case, numbers `tabular`. Dates via `fmtDay`, `fmtDate`, `fmtTime`, `fmtRelativeDay`, `fmtAgo`, `fmtDaysLeft`. Durations via `fmtDuration` / `fmtHours`.
- Voice: usted, never tú (`Escriba`, `Elija`, `su alcance`, `Está al día`; never `Escribe`, `tu`, `Estás`). Where an imperative would read as tú, use a noun phrase or an infinitive. No internal references in user text (`doc §2`, `PENDIENTE §5`): keep those in code comments.
- Back-out words: **Cancelar** abandons a form or confirmation, **Cerrar** dismisses a view, sheet or notice, **Volver** goes back one step or to the parent screen (`Volver a Postventa`). Never `Atrás`, `Regresar` or `Ir a` for going back; `Listo` only finishes an inline edit. Exception: where the primary action is itself "Cancelar …" (cancel an order), the secondary is `Volver`.
- Errors say what to change (`Escriba al menos 10 dígitos, con lada`, `Ya hay otra jornada ese día: elija otra fecha`), never only what failed. Empty states say what will appear and what to do next. Plurals go through `plural()`, never `registro(s)`.
- Accessibility: buttons have labels, icons-only buttons get `aria-label`, color is never the only signal.

## Theming (Claro / Oscuro / Sistema)
The app has a dark mode (next-themes, class `.dark` on `<html>`, default "Sistema", switch in the sidebar user menu, the phone Menú and Perfil).
Light must look exactly as designed; dark is a deliberate navy palette. Both live in `src/app/globals.css` as CSS variables, so **components never
branch on the theme: they use semantic color utilities and never a literal color**.

- **Never** write `bg-white`, `bg-[#f2f4f7]`, `text-[#b86e00]`, `border-[#dfe3ea]`, `ring-black/5`, inline `style={{ color: "#…" }}` or `fill="#…"` for UI colors. Use a token.
- Surfaces: `bg-canvas` (outer chrome) < `bg-panel` (work panel) < `bg-surface` (cards, inputs, popovers, what used to be `bg-white`). Neutral fills step away from it:
  `bg-wash` < `bg-soft` < `bg-tile` < `bg-well` < `bg-press` < `bg-track` < `bg-track-strong` (hover = one step up). `bg-sand` is the warm tile; `bg-field` the sand input fill.
- Lines: `border-hairline` (default) · `border-line` (card borders, was #dfe3ea) · `border-line-strong` · `border-line-heavy` · `border-input` · `ring-edge` / `border-edge` (faint 5% edge) · `border-edge-strong`.
- Text: `text-ink` > `text-ink-soft` > `text-ink-muted` > `text-subtle` > `text-faint` > `text-ghost`. Links `text-link`; action blue `text-azure-fg` / fills `bg-azure`.
- Tones `blue | amber | red | teal | violet`: tinted backgrounds/borders `bg-amber-wash < -soft < -tint < -mid`, `border-amber-line` (`-line-strong`), text `text-amber-fg` (`-ink`, `-deep` darker).
  Same for `red-*`, `teal-*`, `violet-*`, `blue-*`; sky text is `text-sky-fg`. Solid dots/bars stay `bg-st-*` (`bg-st-red text-white` is fine); but **text** in a tone is `text-red-fg` / `text-teal-fg` / `text-violet-fg`, never `text-st-red|teal|violet`.
  Prefer `toneText` / `toneSoftBg` / `toneDot` from `@/lib/status`; for inline `style` use `toneHex` (CSS variables).
- Navy: `bg-brand-deep text-white` = navy button/card (brighter navy in dark, white text stays). Navy **as text** (wordmark, headings) is `text-brand-ink`, never `text-brand-deep`.
  `bg-ink` (inverted chip) needs `text-on-ink`; a fill that stays light in both themes (`bg-sky`, `bg-white`, light gradients) needs `text-on-light`.
- `text-white` and translucent white overlays (`bg-white/10`, `ring-white/10`) are only for navy/aurora/photo surfaces that stay dark in both themes. `bg-white` is only for things that must stay white (photos, the report paper, white knobs on aurora). Use `bg-surface/70` for frosted cards.
- Photos and illustrations (`SceneSvg`, client logos, the PDF paper) keep their own colors. The report sheet is wrapped in `.theme-light` (re-declares the light palette for its whole subtree and disables `dark:` variants); wrap any other "paper" surface the same way.
- Charts / SVG: use classes (`stroke-well`, `fill-azure`, `text-ink-muted`) or `var(--token)` strings (`"var(--st-blue)"`), not hex.
- Gradients/shadows: `bg-aurora`, `bg-aurora-frame`, `glass-card`, `shimmer`, `shadow-soft|lift|glass` already re-theme. For a one-off inset highlight use `shadow-[0_1px_0_var(--hl)_inset]`.
- `dark:` variants are allowed only to adjust something a token cannot (e.g. `dark:bg-black/55` overlays); the shadcn components already carry theirs.
- Check both themes: `npx playwright` screenshots with `colorScheme: "dark"` (Sistema follows `prefers-color-scheme`), at 390 and 1440. Text must keep WCAG AA contrast.

## Ground rules for builder agents
- **Only create/edit files you own** (listed in your brief). Shared files (`src/lib/**`, `src/components/**`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `globals.css`) are read-only. If you truly need a shared helper, put it inside your feature folder.
- Do **not** run `next build`, `next dev`, or start servers; do not install packages. Verify with `npx tsc --noEmit` and `npx eslint <your files>`. Ignore errors in files you don't own (other agents are writing them concurrently).
- Respect doc rules: manual sharing never claims delivery; edits after closure create a new version; GPS + time on check-in/out; ANTES and DESPUÉS photos required to close unless an authorized, justified exception; offline shows pending-sync state.

## Definition of done
A change is done when every item holds for the files it touches. Each one is a class of review finding that kept coming back.

**(a) Awaits, identities, repeats.** After any `await`, re-check what you checked before it. State tied to an identity
(account, photo, token) resets when that identity changes. Single-flight anything that must not run twice.
```ts
const userId = useAppStore.getState().session.userId;        // named before the first await
await whenCapturesSettled(CAPTURE_WAIT_MS);
if (useAppStore.getState().session.userId !== userId) return; // the device changed hands meanwhile
useResetOnChange(userId, () => setDraft(EMPTY_DRAFT));        // src/lib/use-reset-on-change.ts
inflight ??= run().finally(() => { inflight = null; });       // one run at a time (see requestPull, sync/pull.ts)
```

**(b) Docs move with the code.** Docs change in the same commit as the behaviour they describe: no stale "not built yet",
no outdated promises. E.g. the commit that builds the users screen also rewrites its `docs/backend/architecture.md` section
from "planned" to what it does.

**(c) Claim only what you can verify.** Never show saved/done for something you cannot verify. Cache keys include every
input. Test the degraded paths: offline, a failed read, missing data. E.g. a photo handed to the share sheet is
«compartida», never «guardada» (it may have gone to a chat); `useMemo(() => scope(orders, unit), [orders, unit])`, not
`[orders]`; a site that is not on the device is never mapped at 0,0.

**(d) Name the account.** Anything that ends a session or applies a server answer names the account it acts for.
```ts
await endSessionOnDevice({ userId });                   // required by its type: never "whoever the cookies hold now"
if (store.getState().session.userId !== userId) return; // an answer fetched for A never lands in B's store
```

**(e) Accessibility.** Use the primitives (`Dialog`, `RadioGroup`, `Switch`, `ReasonTip`), support the keyboard, and move
focus into new dialogs and blockers. jsx-a11y's recommended rules are errors; a disable names why the rule is wrong there:
`// eslint-disable-next-line jsx-a11y/no-autofocus -- the field the person just opened takes the caret`.
```tsx
<DialogContent onOpenAutoFocus={(e) => { e.preventDefault(); safeRef.current?.focus(); }}> {/* focus on the safe choice */}
<span tabIndex={0} role="button" aria-disabled="true">{disabledButton}</span>           {/* a ReasonTip stop */}
```

**(f) Allowed, refused, neighbour.** Tests cover the allowed case, the refused case and the neighbouring case (archived and
cancelled; anon and service_role).
```js
assert.equal(can("administracion", "order.create"), true); // allowed
assert.equal(can("supervisor", "order.create"), false);    // refused
assert.equal(can("direccion", "order.create"), false);     // the neighbour that looks like it might be allowed
```

**(g) `next=` keeps the query.** Every `/login?next=` link comes from `loginHref(pathname, search)`
(`src/features/auth/safe-next.ts`), never built by hand: `loginHref(usePathname(), useSearchParams())` comes back to
`/incidencias?i=INC-0007`, not `/incidencias`. `scripts/check-safe-next.mjs` checks the round trip.

**(h) Usted.** Spanish copy uses the usted voice (see Voice above): «Entre de nuevo», «Elija una fecha», «su cuenta»;
never «Entra», «Elige», «tu».

## Process
- **One feature per PR**, opened as a **draft** first so the review bots review small increments.
- The **pre-PR review** reads every touched file through the Definition of done above, (a) to (h).
- **High and medium** findings are fixed in the PR; **low** ones go to a follow-up list.
- After each PR, the **most frequent finding category gets a guard**: a lint rule, a helper or a test template. So far:
  `endSessionOnDevice` requires `userId` (d), `loginHref` + `check-safe-next.mjs` (g), jsx-a11y and
  `react-hooks/exhaustive-deps` as errors (e, a), `useResetOnChange` (a).
- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request: `npx next typegen` → `npx tsc --noEmit -p .` →
  `npx eslint .` → `npm run build` (the demo build: no secrets) → `node scripts/check-safe-next.mjs` →
  `node scripts/check-permissions.mjs`. Run the same before pushing; on a fresh checkout `tsc` needs `next typegen` first
  (it generates the route types).

## Mobile / PWA language (phones & tablets < 1024 px)
The product is an installable PWA (manifest, `public/sw.js` offline shell, icons in `public/icons`). Below `lg` the shell
switches to the **mobile reference** (Today · Labor breakdown · Sent screens):
- Sand chrome (`bg-sand`, `--sand #f3f2ee`), the white panel is inset with 28px radius; 5-tab bar **Hoy · Órdenes · Agenda · Pendientes · Menú**
  (`/`, `/ordenes`, `/agenda`, `/pendientes` + a Menú *button*, `mobile-nav.tsx`). No top bar — `PageHeader` shows a round search button +
  initials avatar (→ Perfil, sync dot).
- **Menú** (`mobile-menu.tsx`, vaul `Drawer` bottom sheet, drag to dismiss, closes on navigation/any action) reaches everything else:
  profile row (→ Perfil), unit scope (Dirección), Nueva orden + Buscar (⌘K palette), every nav group as a 4-column tile grid with badge
  chips, Configuración / Centro de ayuda rows and a sync status row. The Menú tab is lit while the sheet is open or inside any route that is
  not a tab (`isSecondaryRoute`, Perfil included) and carries a red dot when a section that lives only in the sheet has a badge count.
  Perfil no longer lists sections.
- **Navigation model:** `src/components/shell/nav.ts` is the single source of truth — `NAV_HOME` (Inicio, Pendientes), `NAV_GROUPS`
  (Operación · Seguimiento · Gestión, each `{ key, label, icon, items }`), `NAV_FOOT` (Configuración, Centro de ayuda) and the flat `NAV_ALL`.
  The desktop sidebar, the Menú sheet and the ⌘K palette all render from it; add a section there, never in a component. In the sidebar a group is
  a collapsible row (group `icon` · label · chevron; open state saved in `pk.sidebar.groups`, the current route's group always opens) with
  icon-less page rows along a guide line; collapsed (84px) it is a single group icon that opens a flyout menu with its pages.
- `/` renders `TodayMobile` (`src/features/inicio/today-mobile.tsx`): date eyebrow, serif greeting, aurora next-step card, "Jornadas de hoy" list.
- Primitives in `@/components/pk/mobile`:
  `TimeTile` (sand "9:00 / a. m."), `MobileRow` (leading tile · bold title · meta · status dot · chevron), `NextStepCard` (aurora-framed
  message + full-width action), `BigButton` (54px navy / outline), `FlowScreen` (full-screen task flow on phones — X + centered small
  title + scroll body + sticky footer; centered dialog on desktop), `FlowHeading` (eyebrow logo+folio, serif title, description),
  `Stepper` + `StepperRow` (− 0.5 h +), `TotalCard` (light-blue total), `FieldCaption` ("NOTA PARA … · OPCIONAL"), `SandInput`,
  `SuccessHero` (blue check tile + serif "Enviado a…"), `ItemCard` (bordered item with status pill), `AuroraStat` (aurora-framed big stat),
  `MobileGreeting`.
- Every multi-step task on a phone (GPS entrada/salida, fotos, incidencia, cierre, compartir reporte, nuevo caso…) is a `FlowScreen`
  ending in a success screen (`SuccessHero` + `ItemCard` + optional `AuroraStat` + "Volver a Hoy" outline `BigButton`).
- Lists become `MobileRow`s; tables are desktop-only (`hidden lg:block` / `lg:hidden`). Use `useMediaQuery("(min-width: 1024px)")` when two
  very different trees are needed (safe: views render only after client hydration).
- Text sizes on phones: titles 30px serif, row titles 16px semibold, meta 13.5px, buttons 17px. Tap targets ≥ 44px.
