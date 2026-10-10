/**
 * Demo controls (in-app "Ver la app como…" role switch and "Restablecer datos demo").
 * NEXT_PUBLIC_DEMO is inlined at build time: unset (default) keeps the demo on; "0" builds a pilot / production app without them.
 * The login screen's role picker is the demo's sign-in and is not affected.
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO !== "0";
