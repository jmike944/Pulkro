import type { Metadata } from "next";
import Link from "next/link";
import { PulkroMark } from "@/components/pk/brand";

export const metadata: Metadata = { title: "Sin conexión" };

/** Served by the service worker when a screen hasn't been opened before and there's no signal. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sand p-5 dark:bg-canvas">
      <div className="w-full max-w-sm rounded-[28px] bg-surface p-8 text-center shadow-soft">
        <PulkroMark className="mx-auto size-14 rounded-[16px]" />
        <h1 className="mt-6 font-serif text-[30px] font-medium leading-tight text-ink">Sin conexión</h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-subtle">
          Esta pantalla todavía no se ha guardado en el dispositivo. Sus capturas siguen a salvo y se enviarán al volver la señal.
        </p>
        <Link href="/" className="mt-7 inline-flex h-[54px] w-full items-center justify-center rounded-[14px] bg-brand-deep text-[17px] font-semibold text-white">
          Volver a Hoy
        </Link>
      </div>
    </main>
  );
}
