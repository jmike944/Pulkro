import type { Metadata } from "next";
import { Suspense } from "react";
import { OrdersView } from "@/features/ordenes/orders-view";

export const metadata: Metadata = { title: "Órdenes" };

/** Tabs and filters live in the URL (useSearchParams), so the client view sits inside Suspense. */
export default function OrdenesPage() {
  return (
    <Suspense fallback={null}>
      <OrdersView />
    </Suspense>
  );
}
