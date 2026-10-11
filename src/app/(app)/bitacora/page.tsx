import type { Metadata } from "next";
import { BitacoraView } from "@/features/bitacora/bitacora-view";

export const metadata: Metadata = { title: "Bitácora" };

export default function Page() {
  return <BitacoraView />;
}
