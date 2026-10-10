import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderDetailView } from "@/features/orden/order-detail-view";
import { OrderDetailSkeleton } from "@/features/orden/order-detail-skeleton";

type Props = { params: Promise<{ folio: string }> };

/** The folio comes from the URL, so the tab title streams with the rest of the (deferred) page. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { folio } = await params;
  return { title: `Orden ${decodeURIComponent(folio)}` };
}

/** Order detail + closure. Data lives on the device; the client view unwraps params inside Suspense. */
export default function OrderDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetailView params={params} />
    </Suspense>
  );
}
