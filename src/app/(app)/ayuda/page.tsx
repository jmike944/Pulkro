import type { Metadata } from "next";
import { HelpView } from "@/features/ayuda/help-view";

export const metadata: Metadata = { title: "Centro de ayuda" };

export default function AyudaPage() {
  return <HelpView />;
}
