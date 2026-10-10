"use client";

import Link from "next/link";
import { FileSearch, ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/pk/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One state for "this record does not exist" AND "it is outside your scope" (doc §2): it never says which, and never prints
 * the record's name or id, so deep links can't be used to confirm that something exists. Use it in every detail view
 * (order, jornada, report, client, case) instead of separate "no encontrado" / "fuera de su alcance" messages.
 *
 * `subject` is the sentence's subject, e.g. "Esta orden", "Este cliente", "Este caso" (default "Este registro").
 */
export function NotFoundOrOutOfScope({
  subject = "Este registro",
  backHref = "/",
  backLabel = "Volver a Inicio",
  className,
}: {
  subject?: string;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[60dvh] items-center justify-center", className)}>
      <EmptyState
        icon={<FileSearch />}
        title="No encontrado o fuera de su alcance"
        className="w-full max-w-lg border-none"
        action={
          <Button asChild className="h-10 rounded-[12px] px-5 font-semibold">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        }
      >
        {subject} no existe o no está dentro de lo que su rol puede consultar. Los supervisores ven sus órdenes asignadas,
        Administración las de su unidad y Dirección la unidad seleccionada.
      </EmptyState>
    </div>
  );
}

/** Shown by the app shell when the current role can't open the route at all (typed URL, old link, role switched). */
export function RouteNotAllowed({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[60dvh] items-center justify-center", className)}>
      <EmptyState
        icon={<ShieldOff />}
        title="No disponible para su rol"
        className="w-full max-w-lg border-none"
        action={
          <Button asChild className="h-10 rounded-[12px] px-5 font-semibold">
            <Link href="/">Volver a Inicio</Link>
          </Button>
        }
      >
        Esta sección corresponde a otro rol. Lo que sí puede consultar está en el menú; si necesita acceso, pídalo a Dirección.
      </EmptyState>
    </div>
  );
}
