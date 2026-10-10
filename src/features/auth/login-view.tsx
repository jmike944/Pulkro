"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { DEMO_USER_BY_ROLE } from "@/lib/seed";
import { ROLE_LABEL } from "@/lib/status";
import type { Role } from "@/lib/types";
import { PulkroMark } from "@/components/pk/brand";
import { Bubbles } from "@/components/pk/aurora";
import { PersonAvatar } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";

const ROLE_COPY: Record<Role, string> = {
  direccion: "Todas las unidades, indicadores y exportaciones.",
  administracion: "Alta de órdenes, postventa y reportes de su unidad.",
  supervisor: "Cuadrillas, jornadas con GPS, evidencia, cierre y envío.",
};

export function LoginView() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const hydrated = useAppStore((s) => s.hydrated);
  const users = useAppStore((s) => s.users);
  const signIn = useAppStore((s) => s.signIn);
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role>("supervisor");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  const enter = () => {
    signIn(DEMO_USER_BY_ROLE[role]);
    setLeaving(true);
    const next = params.get("next");
    setTimeout(() => router.replace(next && next.startsWith("/") && !next.startsWith("/login") ? next : "/"), 450);
  };

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side */}
      <div className="bg-aurora grain relative hidden overflow-hidden lg:block">
        <Bubbles />
        <div className="relative z-[2] flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <PulkroMark className="size-11 rounded-[13px]" />
            <span className="font-brand text-[22px] font-extrabold tracking-[0.18em] text-brand-deep">PULKRO</span>
          </div>
          <div className="max-w-xl">
            <motion.p
              initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.9, ease: EASE }}
              className="font-serif text-[58px] font-medium leading-[1.02] tracking-[-0.02em] text-ink"
            >
              Si piensas en limpio…
              <br />
              <span className="italic text-brand">¡piensa en Pulkro!</span>
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="mt-6 max-w-md text-[16px] leading-relaxed text-ink/70"
            >
              Control operativo y postventa de cuadrillas: de la orden autorizada al reporte con fotos, sin papel y aun sin señal.
            </motion.p>
          </div>
          <div className="flex gap-10 text-[13px] text-ink/60">
            <span>
              <b className="block text-[22px] font-medium text-ink">1985</b>Desde
            </span>
            <span>
              <b className="block text-[22px] font-medium text-ink">3</b>Unidades
            </span>
            <span>
              <b className="block text-[22px] font-medium text-ink">Offline</b>Captura en campo
            </span>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-5 sm:p-10">
        <AnimatePresence>
          {!leaving && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
              transition={{ duration: 0.5, ease: EASE }}
              className="w-full max-w-[440px] rounded-[28px] bg-white p-7 shadow-lift ring-1 ring-black/[0.03] sm:p-9"
            >
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <PulkroMark />
                <span className="font-brand text-[18px] font-extrabold tracking-[0.16em] text-brand-deep">PULKRO</span>
              </div>
              <h1 className="font-serif text-[34px] font-medium leading-tight text-ink">Bienvenido</h1>
              <p className="mt-2 text-[15px] text-subtle">Elige un perfil de demostración para entrar. Cada rol ve solo lo que le corresponde.</p>

              <div className="mt-7 space-y-3" role="radiogroup" aria-label="Perfil">
                {(["supervisor", "administracion", "direccion"] as Role[]).map((r, i) => {
                  const u = users.find((x) => x.id === DEMO_USER_BY_ROLE[r]);
                  const active = role === r;
                  return (
                    <motion.button
                      key={r}
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
                        active ? "border-transparent bg-[#f2f8fe] ring-2 ring-[#1667e0]" : "border-hairline hover:border-[#d5dbe3] hover:bg-[#fafbfc]",
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
                      <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full transition", active ? "bg-[#1667e0] text-white" : "border border-[#d5dbe3]")}>
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
              <p className="mt-5 flex items-start gap-2 text-[12.5px] leading-relaxed text-subtle">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-st-teal" />
                Prototipo navegable. En producción cada persona accede con su cuenta individual, sesiones seguras y bitácora de auditoría.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
