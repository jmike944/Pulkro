"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { fmtCoords, fmtDate, fmtDateTime, fmtDay, fmtHours, fmtTime } from "@/lib/format";
import { mapsLink } from "@/lib/domain";
import { PulkroMark } from "@/components/pk/brand";
import { PersonAvatar } from "@/components/pk/bits";
import { PhotoImage } from "@/components/pk/scene-photo";
import { CONFIDENTIAL_NOTE, paragraphs, type ReportModel, type ReportPhotoPair } from "./report-model";
import { gpsLayout } from "./gps-layout";

/**
 * Content blocks of the A4 preview. Each block is atomic for pagination: the preview measures
 * every block offscreen ("measure" mode, photos as placeholders) and packs them into pages.
 */
export type BlockMode = "measure" | "page";
export type PaperBlock = { key: string; gap: number; keepWithNext?: boolean; animate?: boolean; render: (mode: BlockMode) => ReactNode };

const SECTION_GAP = 26;

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="h-[4px] w-4 rounded-full bg-sky" />
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">{children}</p>
      </div>
      {aside && <span className="text-[10.5px] text-subtle">{aside}</span>}
    </div>
  );
}

function Tag({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" }) {
  return (
    <span className={cn("ml-1.5 inline-flex rounded-[4px] px-1 py-px text-[8.5px] font-semibold", tone === "amber" ? "bg-[#fff6e6] text-[#b86e00]" : "bg-[#eef1f5] text-subtle")}>
      {children}
    </span>
  );
}

/* ───────────── header ───────────── */

function PaperHeader({ m }: { m: ReportModel }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          <PulkroMark className="size-[44px] rounded-[12px]" />
          <div className="leading-none">
            <p className="font-brand text-[21px] font-extrabold tracking-[0.2em] text-brand-deep">PULKRO</p>
            <p className="mt-1.5 text-[10.5px] text-subtle">Compañía de Servicios · desde 1985</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9.5px] font-bold tracking-[0.16em] text-subtle">REPORTE DE SERVICIO</p>
          <p className="mt-1 text-[21px] font-bold leading-none text-brand tabular">{m.folio}</p>
          <p className="mt-1.5 text-[10.5px] text-subtle">
            Emisión {fmtDate(m.issuedAt)} · Versión {m.version}
            {m.draft && <Tag tone="amber">borrador</Tag>}
          </p>
        </div>
      </div>
      <div className="mt-4 h-[4px] rounded-full bg-gradient-to-r from-brand via-sky to-[#b9c7ff]" />
      <h2 className="mt-5 font-serif text-[29px] font-medium leading-[1.12] tracking-[-0.01em] text-ink">{m.title}</h2>
      <p className="mt-1.5 text-[11.5px] text-subtle">
        {m.serviceType}
        {m.commercialRef && ` · Ref. ${m.commercialRef}`}
        {m.unitName && ` · ${m.unitName}`}
      </p>
    </div>
  );
}

function InfoGrid({ m }: { m: ReportModel }) {
  const items: [string, ReactNode][] = [
    ["Cliente", `${m.client.name} · ${m.client.segment}`],
    ["Sitio", m.site.name],
    ["Dirección", `${m.site.address}, ${m.site.municipality}`],
    ["Contacto en sitio", `${m.siteContact.name} · ${m.siteContact.phone}`],
    ["Fechas del servicio", `${fmtDate(m.period.start)} – ${fmtDate(m.period.end)} · ${m.period.days} ${m.period.days === 1 ? "jornada" : "jornadas"}`],
    ["Horario programado", m.schedule],
    ["Horas reales", m.totalMinutes ? fmtHours(m.totalMinutes) : "—"],
    ["Supervisor", m.supervisor.name],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-[10px] bg-[#f4f7fa] px-4 py-3.5">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-subtle">{k}</dt>
          <dd className="mt-0.5 text-[12px] leading-snug text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────── jornadas ───────────── */

const JCOLS = "grid grid-cols-[62px_118px_72px_72px_68px_minmax(0,1fr)] items-center gap-2";

function JornadasTable({ m }: { m: ReportModel }) {
  return (
    <div className="overflow-hidden rounded-[8px] ring-1 ring-hairline">
      <div className={cn(JCOLS, "bg-brand-deep px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white")}>
        <span>Jornada</span>
        <span>Fecha</span>
        <span>Entrada</span>
        <span>Salida</span>
        <span>Horas</span>
        <span>GPS (precisión)</span>
      </div>
      {m.jornadas.map((j, i) => (
        <div key={j.id} className={cn(JCOLS, "border-t border-hairline px-3 py-[7px] text-[11.5px] text-ink", i % 2 === 1 && "bg-[#fafbfc]")}>
          <span className="font-semibold">J{j.index}</span>
          <span>{fmtDate(j.date)}</span>
          <span className="tabular">{j.entrada ? fmtTime(j.entrada) : "—"}</span>
          <span className="tabular">{j.salida ? fmtTime(j.salida) : "—"}</span>
          <span className="font-semibold tabular">{j.minutes ? fmtHours(j.minutes) : "—"}</span>
          <span className="truncate text-subtle tabular">
            {j.gpsIn !== undefined ? `±${j.gpsIn} m` : "—"}
            {j.gpsOut !== undefined && ` / ±${j.gpsOut} m`}
            {j.manual && <Tag tone="amber">manual</Tag>}
            {j.offline && <Tag>sin conexión</Tag>}
          </span>
        </div>
      ))}
      <div className={cn(JCOLS, "border-t border-hairline bg-[#f4f7fa] px-3 py-[7px] text-[11px]")}>
        <span className="col-span-4 text-subtle">
          {m.period.executed} de {m.period.days} {m.period.days === 1 ? "jornada ejecutada" : "jornadas ejecutadas"}
        </span>
        <span className="font-bold text-ink tabular">{m.totalMinutes ? fmtHours(m.totalMinutes) : "—"}</span>
        <span className="text-subtle">total real</span>
      </div>
    </div>
  );
}

/* ───────────── photos ───────────── */

function PhotoCell({ photo, kind, mode }: { photo?: ReportPhotoPair["antes"]; kind: "antes" | "despues"; mode: BlockMode }) {
  const label = kind === "antes" ? "ANTES" : "DESPUÉS";
  return (
    <div className="min-w-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[8px] bg-[#eef1f5]" data-raster={photo && mode === "page" ? photo.id : undefined}>
        {photo ? (
          mode === "page" && <PhotoImage photo={photo} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[8px] border border-dashed border-[#c5ccd6] px-6 text-center text-[11px] text-subtle">
            Sin foto {label} seleccionada
          </div>
        )}
        {photo && (
          <span className={cn("absolute left-2 top-2 rounded-[5px] bg-white px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.1em]", kind === "antes" ? "text-[#b86e00]" : "text-st-teal")}>
            {label}
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[9.5px] text-subtle tabular">
        {photo ? (
          <>
            {fmtDay(photo.takenAt)} · {fmtTime(photo.takenAt)}
            {photo.lat !== undefined && photo.lng !== undefined && ` · ${fmtCoords(photo.lat, photo.lng)}`}
          </>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}

function PairRow({ pair, mode }: { pair: ReportPhotoPair; mode: BlockMode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-semibold text-ink">{pair.area}</p>
      <div className="grid grid-cols-2 gap-[14px]">
        <PhotoCell photo={pair.antes} kind="antes" mode={mode} />
        <PhotoCell photo={pair.despues} kind="despues" mode={mode} />
      </div>
    </div>
  );
}

/* ───────────── people, conformity, gps ───────────── */

function PeopleBlock({ m }: { m: ReportModel }) {
  return (
    <div>
      <SectionTitle aside={`${m.workers.length} ${m.workers.length === 1 ? "persona" : "personas"}`}>Supervisor y cuadrilla</SectionTitle>
      <div className="mt-2.5 flex gap-4">
        <div className="w-[226px] shrink-0 rounded-[10px] bg-sky-soft p-3.5">
          <p className="text-[9px] font-bold tracking-[0.12em] text-subtle">SUPERVISOR</p>
          <div className="mt-2 flex items-center gap-2.5">
            <PersonAvatar initials={m.supervisor.initials} hue={m.supervisor.hue} size={30} />
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-ink">{m.supervisor.name}</p>
              <p className="truncate text-[10.5px] text-subtle">{m.supervisor.title}</p>
            </div>
          </div>
          {m.supervisor.phone && <p className="mt-2 text-[10.5px] text-subtle tabular">{m.supervisor.phone}</p>}
        </div>
        {m.workers.length === 0 ? (
          <p className="text-[11.5px] text-subtle">Sin cuadrilla registrada.</p>
        ) : (
          <div className="grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-2.5">
            {m.workers.map((w) => (
              <div key={w.id} className="flex min-w-0 items-center gap-2">
                <PersonAvatar initials={w.initials} hue={w.hue} size={24} />
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-medium text-ink">{w.name}</p>
                  <p className="truncate text-[9.5px] text-subtle">{w.specialty}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConformityBlock({ m }: { m: ReportModel }) {
  const c = m.conformity;
  return (
    <div>
      <SectionTitle>Conformidad del cliente</SectionTitle>
      {c ? (
        <div className="mt-2.5 flex gap-4 rounded-[10px] p-3.5 ring-1 ring-hairline">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-subtle">{c.methodLabel}</p>
            <p className="mt-1 text-[14px] font-semibold text-ink">{c.name}</p>
            {c.role && <p className="text-[10.5px] text-subtle">{c.role}</p>}
            <p className="mt-1.5 text-[10.5px] text-subtle tabular">{fmtDateTime(c.at)}</p>
            {c.comment && <p className="mt-1.5 text-[11.5px] italic text-ink">“{c.comment}”</p>}
          </div>
          <div className="flex h-[96px] w-[250px] shrink-0 items-center justify-center rounded-[8px] bg-[#f4f7fa]">
            {c.signatureDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.signatureDataUrl} alt={`Firma de ${c.name}`} className="max-h-[84px] max-w-[230px] object-contain" />
            ) : (
              <p className="px-5 text-center text-[10.5px] leading-snug text-subtle">
                {c.method === "firma" ? "Firma registrada en sitio (sin imagen digital)" : c.methodLabel}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2.5 text-[11.5px] text-subtle">Sin conformidad registrada en el cierre.</p>
      )}
      {m.exception && (
        <div className="mt-2.5 rounded-[8px] bg-[#fff6e6] px-3.5 py-3">
          <p className="text-[9px] font-bold tracking-[0.12em] text-[#b86e00]">EXCEPCIÓN DE EVIDENCIA AUTORIZADA</p>
          <p className="mt-1 text-[11.5px] leading-snug text-ink">{m.exception.reason}</p>
          <p className="mt-1 text-[10px] text-subtle">
            Autorizó {m.exception.authorizedBy} · {fmtDateTime(m.exception.at)}
          </p>
        </div>
      )}
    </div>
  );
}

function GpsMiniMap({ m }: { m: ReportModel }) {
  const W = 200;
  const H = 150;
  const g = gpsLayout(m.site, m.gps, W, H, 16);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-[200px] shrink-0" role="img" aria-label="Mapa esquemático de registros GPS">
      <rect width={W} height={H} rx="10" fill="#f4f7fa" />
      {[1, 2, 3].map((i) => (
        <line key={`v${i}`} x1={(W / 4) * i} y1="8" x2={(W / 4) * i} y2={H - 8} stroke="#e1e6ed" strokeWidth="0.8" />
      ))}
      {[1, 2].map((i) => (
        <line key={`h${i}`} x1="8" y1={(H / 3) * i} x2={W - 8} y2={(H / 3) * i} stroke="#e1e6ed" strokeWidth="0.8" />
      ))}
      {g.points.map((p) => (
        <circle key={`${p.key}-a`} cx={p.x} cy={p.y} r={p.r} fill={p.kind === "entrada" ? "#12a594" : "#2f80ed"} fillOpacity="0.12" />
      ))}
      {g.points.map((p) => (
        <circle key={p.key} cx={p.x} cy={p.y} r="3.2" fill={p.kind === "entrada" ? "#12a594" : "#2f80ed"} stroke="#fff" strokeWidth="1.2" />
      ))}
      <circle cx={g.cx} cy={g.cy} r="6" fill="#07243f" />
      <circle cx={g.cx} cy={g.cy} r="2.2" fill="#7ad1f4" />
      <line x1="12" y1={H - 12} x2={12 + g.scaleBar.px} y2={H - 12} stroke="#667085" strokeWidth="1.4" strokeLinecap="round" />
      <text x="12" y={H - 17} fontSize="8" fill="#667085">
        {g.scaleBar.meters} m
      </text>
    </svg>
  );
}

function GpsBlock({ m }: { m: ReportModel }) {
  return (
    <div>
      <SectionTitle
        aside={
          <a href={mapsLink(m.site.lat, m.site.lng)} target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">
            Ver sitio en mapa
          </a>
        }
      >
        Ubicación GPS
      </SectionTitle>
      <div className="mt-2.5 flex gap-4">
        <GpsMiniMap m={m} />
        <div className="min-w-0 flex-1 text-[10.5px]">
          <div className="flex items-center gap-2 border-b border-hairline py-1.5">
            <span className="w-[88px] shrink-0 font-semibold text-ink">Sitio</span>
            <span className="flex-1 truncate text-ink tabular">{fmtCoords(m.site.lat, m.site.lng)}</span>
          </div>
          {m.gps.map((p) => (
            <div key={p.key} className="flex items-center gap-2 border-b border-hairline py-1.5">
              <span className={cn("w-[88px] shrink-0 font-medium", p.kind === "entrada" ? "text-st-teal" : "text-link")}>{p.label}</span>
              <span className="min-w-0 flex-1 truncate text-ink tabular">
                {fmtCoords(p.lat, p.lng)} · ±{Math.round(p.accuracy)} m{p.source === "manual" && " · manual"}
              </span>
              <span className="shrink-0 text-subtle tabular">{fmtDateTime(p.at)}</span>
            </div>
          ))}
          {m.gps.length === 0 && <p className="py-2 text-subtle">Sin registros GPS.</p>}
        </div>
      </div>
    </div>
  );
}

/* ───────────── description editor (desktop edit mode) ───────────── */

export const EDITOR_BOX = "block w-full rounded-[8px] border-[1.5px] border-dashed border-sky bg-sky-soft/50 px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink";

export type EditorFocus = { want: boolean; start: number; end: number };

/** Auto-growing textarea that survives being re-mounted on another page while typing. */
export function SummaryTextarea({ value, onChange, focusRef }: { value: string; onChange: (v: string) => void; focusRef: RefObject<EditorFocus> }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight + 3}px`;
  }, [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && focusRef.current.want) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(focusRef.current.start, focusRef.current.end);
    }
  }, [focusRef]);
  const remember = (el: HTMLTextAreaElement) => {
    focusRef.current.start = el.selectionStart;
    focusRef.current.end = el.selectionEnd;
  };
  return (
    <textarea
      ref={ref}
      data-summary-editor
      value={value}
      onChange={(e) => {
        remember(e.currentTarget);
        onChange(e.target.value);
      }}
      onSelect={(e) => remember(e.currentTarget)}
      onFocus={(e) => {
        focusRef.current.want = true;
        remember(e.currentTarget);
      }}
      onBlur={() =>
        setTimeout(() => {
          if (!(document.activeElement instanceof HTMLTextAreaElement && document.activeElement.dataset.summaryEditor !== undefined)) focusRef.current.want = false;
        }, 0)
      }
      aria-label="Descripción del servicio"
      placeholder="Describa el trabajo realizado para el cliente…"
      rows={3}
      className={cn(EDITOR_BOX, "resize-none overflow-hidden outline-none placeholder:text-subtle focus:border-solid focus:bg-white focus:ring-3 focus:ring-sky/30")}
    />
  );
}

/* ───────────── block list ───────────── */

export function buildPaperBlocks(m: ReportModel, opts: { editor?: (mode: BlockMode) => ReactNode } = {}): PaperBlock[] {
  const blocks: PaperBlock[] = [
    { key: "header", gap: 0, render: () => <PaperHeader m={m} /> },
    { key: "info", gap: 18, render: () => <InfoGrid m={m} /> },
    { key: "h-jornadas", gap: SECTION_GAP, keepWithNext: true, render: () => <SectionTitle aside={`${m.jornadas.length} ${m.jornadas.length === 1 ? "jornada" : "jornadas"} · un solo reporte`}>Resumen de jornadas</SectionTitle> },
    { key: "jornadas", gap: 10, render: () => <JornadasTable m={m} /> },
    { key: "h-desc", gap: SECTION_GAP, keepWithNext: true, render: () => <SectionTitle>Descripción del servicio</SectionTitle> },
  ];

  if (opts.editor) blocks.push({ key: "desc-edit", gap: 10, render: opts.editor });
  else {
    const ps = paragraphs(m.summary);
    if (ps.length === 0) blocks.push({ key: "desc-empty", gap: 10, render: () => <p className="text-[12.5px] italic text-subtle">Sin descripción.</p> });
    ps.forEach((p, i) => blocks.push({ key: `desc-${i}`, gap: i === 0 ? 10 : 6, render: () => <p className="text-[12.5px] leading-[1.6] text-ink">{p}</p> }));
  }

  if (m.activities.length) {
    blocks.push({ key: "h-act", gap: SECTION_GAP, keepWithNext: true, render: () => <SectionTitle>Actividades realizadas</SectionTitle> });
    blocks.push({
      key: "act",
      gap: 10,
      render: () => (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {m.activities.map((a, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink">
              <span className="mt-[6px] size-[5px] shrink-0 rounded-full bg-sky" />
              {a}
            </li>
          ))}
        </ul>
      ),
    });
  }

  blocks.push({ key: "h-inc", gap: SECTION_GAP, keepWithNext: true, render: () => <SectionTitle aside={m.incidents.length ? `${m.incidents.length} registradas` : undefined}>Incidencias</SectionTitle> });
  if (m.incidents.length === 0) blocks.push({ key: "inc-empty", gap: 10, render: () => <p className="text-[12px] text-subtle">Sin incidencias registradas durante el servicio.</p> });
  m.incidents.forEach((i, idx) =>
    blocks.push({
      key: `inc-${i.id}`,
      gap: idx === 0 ? 10 : 8,
      render: () => (
        <div className="flex overflow-hidden rounded-[8px] bg-[#f4f7fa]">
          <span className={cn("w-[3px] shrink-0", i.severityKey === "alta" ? "bg-st-red" : i.severityKey === "media" ? "bg-st-amber" : "bg-st-slate")} />
          <div className="min-w-0 flex-1 px-3.5 py-2.5">
            <p className="text-[11.5px] text-ink">
              <b className="font-semibold">
                {i.folio} · {i.type}
              </b>{" "}
              <span className="text-subtle">
                · severidad {i.severity.toLowerCase()} · {fmtDateTime(i.at)}
              </span>
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-ink">{i.description}</p>
            <p className={cn("mt-1 text-[11px]", i.open ? "text-st-red" : "text-st-teal")}>
              {i.open ? "Abierta al momento de la emisión" : `Resolución: ${i.resolution ?? "registrada"}`}
            </p>
          </div>
        </div>
      ),
    }),
  );

  blocks.push({
    key: "h-photos",
    gap: SECTION_GAP,
    keepWithNext: true,
    render: () => <SectionTitle aside={`${m.photoCount} ${m.photoCount === 1 ? "foto seleccionada" : "fotos seleccionadas"}`}>Evidencia fotográfica · antes y después</SectionTitle>,
  });
  if (m.pairs.length === 0) blocks.push({ key: "photos-empty", gap: 10, render: () => <p className="text-[12px] text-subtle">No se seleccionaron fotografías para este reporte.</p> });
  m.pairs.forEach((p, i) => blocks.push({ key: `pair-${p.key}`, gap: i === 0 ? 10 : 14, animate: true, render: (mode) => <PairRow pair={p} mode={mode} /> }));

  blocks.push({ key: "people", gap: SECTION_GAP, render: () => <PeopleBlock m={m} /> });
  blocks.push({ key: "conformity", gap: SECTION_GAP, render: () => <ConformityBlock m={m} /> });
  blocks.push({ key: "gps", gap: SECTION_GAP, render: () => <GpsBlock m={m} /> });
  blocks.push({
    key: "closing",
    gap: 22,
    render: () => (
      <div className="flex justify-between gap-4 border-t border-hairline pt-2.5 text-[10px] text-subtle">
        <span>{m.validatedAt ? `Cierre validado por ${m.validatedBy} el ${fmtDateTime(m.validatedAt)}.` : "Cierre pendiente de validación."}</span>
        <span>
          Emitido por {m.issuedBy} · {fmtDateTime(m.issuedAt)}
        </span>
      </div>
    ),
  });
  return blocks;
}

/* ───────────── page chrome ───────────── */

export function PaperRunningHeader({ m }: { m: ReportModel }) {
  return (
    <div className="absolute inset-x-[56px] top-[30px] flex items-center justify-between text-[9.5px] tracking-[0.08em] text-[#98a2b3]">
      <span className="flex items-center gap-2 font-semibold">
        <PulkroMark className="size-4 rounded-[5px] shadow-none" /> PULKRO · REPORTE DE SERVICIO
      </span>
      <span className="tabular">
        {m.folio} · {m.client.shortName} · v{m.version}
      </span>
    </div>
  );
}

export function PaperFooter({ m, page, total }: { m: ReportModel; page: number; total: number }) {
  return (
    <div className="absolute inset-x-[56px] bottom-[30px] flex items-start justify-between gap-6 border-t border-hairline pt-2.5">
      <p className="max-w-[520px] text-[8.5px] leading-snug text-[#98a2b3]">{CONFIDENTIAL_NOTE}</p>
      <p className="shrink-0 text-right text-[9.5px] leading-snug text-subtle tabular">
        {m.folio} · v{m.version}
        <br />
        Página {page} de {total}
      </p>
    </div>
  );
}

export function DraftWatermark() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex select-none items-center justify-center">
      <span className="-rotate-[28deg] font-brand text-[120px] font-extrabold tracking-[0.18em] text-sky/[0.13]">BORRADOR</span>
    </span>
  );
}
