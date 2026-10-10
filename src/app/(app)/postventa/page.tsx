import type { Metadata } from "next";
import { Suspense } from "react";
import { PostventaView } from "@/features/postventa/postventa-view";

export const metadata: Metadata = { title: "Postventa" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PostventaView />
    </Suspense>
  );
}
