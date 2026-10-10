"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Building2, Camera, CircleDashed, Copy, Download, HardHat, MapPin, PenLine, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useAppStore, useCurrentUser, useScopedData, useShallow } from "@/lib/hooks";
import { downloadBlob } from "@/lib/export";
import { fmtNum } from "@/lib/format";
import { SectionHeader } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { DocTag, type DocStatus } from "./shared";
import { PRIVACY_NOTICE, noticeAsText } from "./privacy-notice";

const POLICIES: { title: string; status: DocStatus; ref: string; proposal: string }[] = [
  { title: "Plazo de conservación de fotos y reportes", status: "pendiente", ref: "§6", proposal: "Definir junto con el almacenamiento (nube o servidor propio) y el costo por volumen." },
  { title: "Conservación de la bitácora de auditoría", status: "pendiente", ref: "§6", proposal: "Mismo plazo que la orden, para conservar la trazabilidad de cada cambio." },
  { title: "Eliminación a solicitud del titular", status: "pendiente", ref: "§6", proposal: "Atender por el medio del aviso; la eliminación queda registrada sin conservar el dato." },
  { title: "Acceso a información de otras unidades", status: "pendiente", ref: "§2", proposal: "Dirección ve todas; Administración solo su unidad; Supervisor solo sus asignaciones." },
  { title: "Política cuando el GPS no está disponible", status: "pendiente", ref: "§4.2", proposal: "Registro con justificación escrita y marca de captura manual." },
  { title: "Cifrado en tránsito y en reposo", status: "propuesto", ref: "§6", proposal: "TLS en todas las conexiones y cifrado de la base de datos y de las fotos almacenadas." },
  { title: "Respaldos y recuperación", status: "pendiente", ref: "§6", proposal: "Copias automáticas diarias con prueba periódica de restauración." },
  { title: "Recuperación de cuentas", status: "pendiente", ref: "§11", proposal: "Dirección restablece el acceso; cada restablecimiento queda en bitácora." },
];

const CONSENT = [
  "Al iniciar la jornada, el supervisor informa al contacto en sitio que se tomarán fotografías de las áreas de trabajo.",
  "Las fotos se enfocan en instalaciones: evitar rostros, documentos, pantallas y placas de vehículos.",
  "La ubicación se registra solo al marcar entrada y salida; la app no rastrea de forma continua.",
  "Antes de firmar la conformidad, la persona en sitio ve el resumen del servicio y su nombre queda en el reporte.",
  "La encuesta por enlace muestra un aviso breve con vínculo a este aviso completo.",
];

export function PrivacyTab() {
  const { orders, jornadas, photos, surveys } = useScopedData();
  const user = useCurrentUser();
  const { clients, workers } = useAppStore(useShallow((s) => ({ clients: s.clients, workers: s.workers })));

  const counts = useMemo(() => {
    const clientIds = new Set(orders.map((o) => o.clientId));
    return {
      photos: photos.length,
      gps: jornadas.reduce((n, j) => n + (j.checkIn ? 1 : 0) + (j.checkOut ? 1 : 0), 0),
      signatures: orders.filter((o) => o.closure?.conformity?.method === "firma").length,
      conformities: orders.filter((o) => o.closure?.conformity).length,
      clients: clients.filter((c) => clientIds.has(c.id)).length,
      surveys: surveys.filter((s) => s.respondedAt).length,
      workers: workers.filter((w) => user.role === "direccion" || w.unitId === user.unitId).length,
    };
  }, [orders, jornadas, photos, surveys, clients, workers, user.role, user.unitId]);

  const DATA = [
    { icon: <Camera />, title: "Fotografías", value: counts.photos, sub: "Antes, después, incidencias y postventa, con hora y coordenadas." },
    { icon: <MapPin />, title: "Ubicación GPS", value: counts.gps, sub: "Registros de entrada y salida con precisión y hora de dispositivo y servidor." },
    { icon: <PenLine />, title: "Firmas y conformidad", value: counts.conformities, sub: `${fmtNum(counts.signatures)} con firma en pantalla; el resto verbal o por correo.` },
    { icon: <Building2 />, title: "Contactos de clientes", value: counts.clients, sub: `Nombre, teléfono y correo · ${fmtNum(counts.surveys)} encuestas respondidas.` },
    { icon: <HardHat />, title: "Personal de cuadrilla", value: counts.workers, sub: "Nombre, teléfono y especialidad; no usan la app." },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(noticeAsText());
      toast.success("Aviso copiado", { description: "Pégalo en el documento para revisión legal." });
    } catch {
      toast.error("No se pudo copiar", { description: "Usa la descarga en texto." });
    }
  };
  const download = () => {
    downloadBlob(new Blob([noticeAsText()], { type: "text/plain;charset=utf-8" }), "aviso-de-privacidad-pulkro-borrador.txt");
    toast.success("Aviso descargado");
  };

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:gap-0">
      <article className="min-w-0 xl:border-r xl:border-hairline xl:pr-10">
        <div className="relative overflow-hidden rounded-[24px] border border-hairline bg-white shadow-soft">
          <div className="bg-aurora-frame grain relative px-5 pb-6 pt-6 sm:px-8 sm:pt-8">
            <div className="relative z-[2]">
              <div className="flex flex-wrap items-center gap-2">
                <DocTag status="propuesto" />
                <span className="text-[12.5px] font-medium text-ink/70">Borrador para revisión legal · basado en el documento maestro v1.0</span>
              </div>
              <h2 className="mt-3 font-serif text-[30px] font-medium leading-tight text-ink sm:text-[36px]">Aviso de privacidad</h2>
              <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-ink/75">
                Fotografías, ubicación GPS, firmas y datos de contacto que la app recaba para documentar cada servicio (doc §6).
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Button onClick={copy} className="h-11 rounded-[12px] px-4 font-semibold">
                  <Copy className="size-4" /> Copiar texto
                </Button>
                <Button variant="outline" onClick={download} className="h-11 rounded-[12px] border-white bg-white/80 px-4 font-semibold">
                  <Download className="size-4" /> Descargar .txt
                </Button>
              </div>
            </div>
          </div>
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            <ol className="space-y-7">
              {PRIVACY_NOTICE.map((s, i) => (
                <motion.li
                  key={s.title}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="grid gap-x-4 sm:grid-cols-[32px_minmax(0,1fr)]"
                >
                  <span className="mb-1 font-serif text-[18px] text-[#98a2b3] tabular sm:mb-0 sm:pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-ink">
                      {s.title}
                      {s.pending && <DocTag status="pendiente" />}
                    </h3>
                    {s.body.map((p, j) => (
                      <p key={j} className="mt-2 text-[14.5px] leading-relaxed text-ink/80">
                        {p}
                      </p>
                    ))}
                    {s.list && (
                      <ul className="mt-3 space-y-2">
                        {s.list.map((li) => (
                          <li key={li} className="flex gap-2.5 text-[14px] leading-relaxed text-ink/80">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky" />
                            {li}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </article>

      <aside className="min-w-0 space-y-10 xl:pl-10">
        <section>
          <SectionHeader title="Datos que maneja la app" subtitle="Volumen visible para tu rol en este dispositivo." />
          <ul className="space-y-1">
            {DATA.map((d, i) => (
              <motion.li
                key={d.title}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05, duration: 0.4, ease: EASE }}
                className="flex items-start gap-3 border-b border-hairline py-3.5 last:border-0"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e3f1fd] text-[#1667e0] [&_svg]:size-[17px]">{d.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-[14.5px] font-semibold text-ink">{d.title}</span>
                    <span className="text-[15px] font-semibold text-ink tabular">{fmtNum(d.value)}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-subtle">{d.sub}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeader title="Consentimiento en campo" subtitle={<span className="flex items-center gap-2">Prácticas propuestas <DocTag status="propuesto" /></span>} />
          <ul className="space-y-3">
            {CONSENT.map((c, i) => (
              <li key={c} className="flex gap-3 text-[14px] leading-relaxed text-ink/80">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[12px] font-semibold text-ink tabular">{i + 1}</span>
                {c}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeader title="Políticas por definir" subtitle="Retención y acceso: decisiones antes de producción." />
          <ul className="space-y-2">
            {POLICIES.map((p, i) => (
              <motion.li
                key={p.title}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: EASE }}
                className="flex gap-3 rounded-[16px] border border-hairline p-3.5"
              >
                <CircleDashed className={p.status === "pendiente" ? "mt-0.5 size-5 shrink-0 text-st-amber" : "mt-0.5 size-5 shrink-0 text-st-blue"} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold text-ink">
                    {p.title}
                    <DocTag status={p.status} />
                    <span className="text-[11.5px] font-medium text-subtle">doc {p.ref}</span>
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-subtle">
                    <span className="font-semibold text-ink/75">Propuesta: </span>
                    {p.proposal}
                  </p>
                </div>
              </motion.li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-snug text-subtle">
            <ScrollText className="mt-0.5 size-4 shrink-0" />
            Este borrador no sustituye la revisión de un especialista en protección de datos personales.
          </p>
        </section>
      </aside>
    </div>
  );
}
