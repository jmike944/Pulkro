import type { Metadata } from "next";
import { ClientsView } from "@/features/clientes/clients-view";

export const metadata: Metadata = { title: "Clientes" };

export default function Page() {
  return <ClientsView />;
}
