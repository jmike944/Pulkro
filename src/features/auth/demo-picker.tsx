"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { DEMO_USER_BY_ROLE } from "@/lib/seed";
import { ROLE_LABEL } from "@/lib/status";
import type { Role } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";

const ROLE_COPY: Record<Role, string> = {
  direccion: "Todas las unidades, indicadores y exportaciones.",
  administracion: "Alta de órdenes, postventa y reportes de su unidad.",
  supervisor: "Cuadrillas, jornadas con GPS, evidencia, cierre y envío.",
};

/** The demo's sign-in: one demo profile per role over the local demo dataset. `onEntered` runs once the session started. */
export function DemoPicker({ onEntered }: { onEntered: () => void }) {
  const hydrated = useAppStore((s) => s.hydrated);
  const users = useAppStore((s) => s.users);
  const signIn = useAppStore((s) => s.signIn);
  const [role, setRole] = useState<Role>("supervisor");

  const enter = () => {
    if (signIn(DEMO_USER_BY_ROLE[role])) onEntered();
  };

  return (
    <>
      <div className="mt-7 space-y-3" role="radiogroup" aria-label="Perfil">
        {(["supervisor", "administracion", "direccion"] as Role[]).map((r, i) => {
          const u = users.find((x) => x.id === DEMO_USER_BY_ROLE[r]);
          const active = role === r;
          return (
            <motion.button
              key={r}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${ROLE_LABEL[r]}${u ? ` · ${u.name}` : ""}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.07, ease: EASE }}
              onClick={() => setRole(r)}
              onDoubleClick={enter}
              className={cn(
                "flex w-full items-center gap-4 rounded-[18px] border p-4 text-left transition-all",
                active ? "border-transparent bg-blue-wash ring-2 ring-azure" : "border-hairline hover:border-line-strong hover:bg-wash",
              )}
            >
              {u ? <PersonAvatar initials={u.initials} hue={u.hue} size={44} /> : <span className="size-11 rounded-full shimmer" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  {ROLE_LABEL[r]}
                  {u && <span className="truncate font-normal text-subtle">· {u.name.split(" ").slice(0, 2).join(" ")}</span>}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-subtle">{ROLE_COPY[r]}</span>
              </span>
              <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full transition", active ? "bg-azure text-white" : "border border-line-strong")}>
                {active && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </motion.button>
          );
        })}
      </div>

      <Button onClick={enter} disabled={!hydrated} size="lg" className="group mt-7 h-12 w-full rounded-[14px] text-[15px] font-semibold">
        {hydrated ? "Entrar" : "Preparando datos…"}
        <ArrowRight className="transition-transform group-hover:translate-x-1" />
      </Button>
    </>
  );
}
