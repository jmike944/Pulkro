"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { CloudUpload, Download, LogOut, RotateCcw, Share, Smartphone, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore, useCurrentUser, useLookups, useSyncSummary } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { DEMO_ENABLED } from "@/lib/demo";
import { ROLE_LABEL } from "@/lib/status";
import { fmtAgo } from "@/lib/format";
import type { Role } from "@/lib/types";
import { PersonAvatar } from "@/components/pk/bits";
import { Segmented } from "@/components/pk/page";
import { MobileGreeting } from "@/components/pk/mobile";
import { staggerContainer, fadeUp } from "@/components/pk/motion";
import { Switch } from "@/components/ui/switch";
import { MobileToolbar } from "@/components/shell/header-tools";
import { ThemeSegmented, useThemeChoice } from "@/components/shell/theme-switcher";
import { UnitPickerSheet, useUnitScope } from "@/components/shell/unit-picker";
import { useInstallPrompt } from "@/components/shell/pwa";
import { DemoResetDialog } from "@/components/shell/demo-reset-dialog";

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={fadeUp} className={cn("rounded-[22px] border border-hairline bg-surface p-5", className)}>
      {children}
    </motion.section>
  );
}

/** Perfil — identity, unit scope (Dirección), sync, install and demo role switch. Section navigation lives in the phone Menú sheet. */
export function PerfilView() {
  const user = useCurrentUser();
  const lk = useLookups();
  const router = useRouter();
  const switchRole = useAppStore((s) => s.switchRole);
  const signOut = useAppStore((s) => s.signOut);
  const forced = useAppStore((s) => s.sync.forcedOffline);
  const setForced = useAppStore((s) => s.setForcedOffline);
  const { offline, pending, lastSyncAt } = useSyncSummary();
  const setSyncOpen = useUi((s) => s.setSyncOpen);
  const { canPrompt, standalone, ios, install } = useInstallPrompt();
  const unit = lk.units.get(user.unitId);
  const { allUnits, selected } = useUnitScope();
  const [unitOpen, setUnitOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const theme = useThemeChoice();
  const themeHint =
    theme.value === "system"
      ? `Sigue el modo del dispositivo${theme.resolved ? ` (ahora ${theme.resolved === "dark" ? "oscuro" : "claro"})` : ""}.`
      : theme.value === "dark"
        ? "Fondo oscuro: más cómodo de noche y en campo."
        : "Fondo claro, como en papel.";
  // Dirección's eyebrow shows the unit it is currently looking at, not its home unit.
  const scopeName = allUnits ? (selected?.name ?? "Todas las unidades") : (unit?.name ?? "");

  return (
    <div className="mx-auto max-w-2xl">
      <MobileGreeting eyebrow={`${ROLE_LABEL[user.role]} · ${scopeName}`} title="Perfil" avatar={<MobileToolbar avatar={false} unit={false} />} />

      <motion.div variants={staggerContainer(0.06)} initial="hidden" animate="show" className="space-y-4">
        <Card className="flex items-center gap-4">
          <PersonAvatar initials={user.initials} hue={user.hue} size={60} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-semibold text-ink">{user.name}</p>
            <p className="truncate text-[14px] text-subtle">{user.title}</p>
            <p className="truncate text-[13px] text-subtle">{user.email}</p>
          </div>
        </Card>

        {allUnits && (
          <Card className="p-2">
            <p className="px-3 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Unidad</p>
            <button type="button" onClick={() => setUnitOpen(true)} className="flex min-h-[60px] w-full items-center gap-3.5 rounded-[14px] px-3 py-2 text-left active:bg-sand">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-sand text-[13px] font-bold tracking-wide text-ink">{selected?.code ?? "PK"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-semibold text-ink">{scopeName}</span>
                <span className="block text-[13px] leading-snug text-subtle">Aplica a todas las secciones de la app.</span>
              </span>
              <span className="shrink-0 text-[14px] font-semibold text-link">Cambiar</span>
            </button>
            <UnitPickerSheet open={unitOpen} onOpenChange={setUnitOpen} />
          </Card>
        )}

        <Card>
          <div className="flex items-center gap-3">
            <span className={cn("inline-flex size-10 items-center justify-center rounded-[12px]", offline ? "bg-amber-tint text-amber-fg" : "bg-blue-tint text-azure-fg")}>
              {offline ? <WifiOff className="size-5" /> : <CloudUpload className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{offline ? "Sin conexión" : pending.length ? "Sincronizando" : "Sincronizado"}</p>
              <p className="text-[13.5px] text-subtle">{pending.length ? `${pending.length} registro(s) en el dispositivo` : `Última sincronización ${fmtAgo(lastSyncAt)}`}</p>
            </div>
            <button onClick={() => setSyncOpen(true)} className="-mr-2 inline-flex min-h-11 items-center px-2 text-[14px] font-semibold text-link">
              Ver cola
            </button>
          </div>
          <label className="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-4 text-[14.5px]">
            <span>
              <span className="block font-medium text-ink">Simular sin conexión</span>
              <span className="text-[13px] text-subtle">Prueba la captura en campo sin señal</span>
            </span>
            <Switch checked={forced} onCheckedChange={setForced} />
          </label>
        </Card>

        {!standalone && (
          <Card className="bg-aurora-frame grain relative overflow-hidden border-0 p-2.5">
            <div className="relative z-[2] flex items-center gap-4 rounded-[18px] bg-surface p-4">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-brand-deep text-white">
                <Smartphone className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Instalar Pulkro</p>
                <p className="text-[13px] leading-snug text-subtle">
                  {ios ? (
                    <>
                      En Safari toca <Share className="inline size-3.5" /> Compartir y luego “Agregar a inicio”.
                    </>
                  ) : canPrompt ? (
                    "Ábrela desde tu pantalla de inicio y trabaja sin señal."
                  ) : (
                    "Usa el menú del navegador → “Instalar app” o “Agregar a pantalla de inicio”."
                  )}
                </p>
              </div>
              {canPrompt && (
                <button
                  onClick={async () => {
                    const ok = await install();
                    if (!ok) toast("Puedes instalarla más tarde desde aquí");
                  }}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] bg-brand-deep px-3.5 text-[14px] font-semibold text-white"
                >
                  <Download className="size-4" /> Instalar
                </button>
              )}
            </div>
          </Card>
        )}

        {DEMO_ENABLED && (
          <Card>
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Ver la app como (demo)</p>
            <Segmented
              id="perfil-role"
              className="w-full justify-between [&>button]:flex-1"
              items={(["supervisor", "administracion", "direccion"] as Role[]).map((r) => ({ value: r, label: r === "administracion" ? "Admin." : ROLE_LABEL[r] }))}
              value={user.role}
              onChange={(r) => {
                switchRole(r);
                toast.success(`Ahora ves Pulkro como ${ROLE_LABEL[r]}`);
              }}
            />
          </Card>
        )}

        <Card>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-subtle">Apariencia</p>
          <p className="mb-3 text-[13.5px] leading-snug text-subtle">
            {themeHint}
          </p>
          <ThemeSegmented />
        </Card>

        <Card className="p-2">
          {DEMO_ENABLED && (
            <button
              onClick={() => setResetOpen(true)}
              className="flex h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3 text-left text-[15.5px] text-ink active:bg-sand"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-[11px] bg-sand">
                <RotateCcw className="size-[18px]" />
              </span>
              Restablecer datos demo
            </button>
          )}
          <button
            onClick={() => {
              signOut();
              router.push("/login");
            }}
            className="flex h-[52px] w-full items-center gap-3.5 rounded-[14px] px-3 text-left text-[15.5px] text-red-fg active:bg-sand"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-[11px] bg-red-soft">
              <LogOut className="size-[18px]" />
            </span>
            Cerrar sesión
          </button>
        </Card>
        <p className="pb-2 text-center text-[12px] text-subtle">Pulkro Cuadrillas · prototipo v1.0 · datos guardados en este dispositivo</p>
      </motion.div>
      <DemoResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  );
}
