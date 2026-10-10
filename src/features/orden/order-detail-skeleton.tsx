import { Shimmer } from "@/components/pk/feedback";

/** Loading placeholder that mirrors the order detail layout (header, tabs, two columns). */
export function OrderDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando orden">
      <Shimmer className="mb-5 h-5 w-40" />
      <Shimmer className="h-10 w-full max-w-[520px]" />
      <div className="mt-4 flex flex-wrap gap-3">
        <Shimmer className="h-5 w-32" />
        <Shimmer className="h-5 w-24" />
        <Shimmer className="h-5 w-28" />
      </div>
      <div className="mt-8 flex gap-7 border-b border-hairline pb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-5 w-20" />
        ))}
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Shimmer className="size-9 shrink-0 rounded-[11px]" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-4 w-1/2" />
                <Shimmer className="h-3.5 w-3/4" />
              </div>
            </div>
          ))}
        </div>
        <Shimmer className="h-[380px] rounded-[28px]" />
      </div>
    </div>
  );
}
