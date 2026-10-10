import { AppShell } from "@/components/shell/app-shell";

// Data lives on the device (IndexedDB, offline-first), so the first paint waits for client
// hydration. Navigations between pages after that are instant; opt the shell out of validation.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
