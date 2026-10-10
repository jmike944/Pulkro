/**
 * The client-facing PDF (react-pdf). Loaded lazily from the "Generar PDF" click handler only —
 * never import this module statically. Built-in Helvetica / Times-Roman fonts (WinAnsi: Spanish safe).
 */
import {
  Circle,
  Defs,
  Document,
  Font,
  Image,
  Line,
  LinearGradient,
  Link,
  Page,
  Path,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { fmtCoords, fmtDate, fmtDateTime, fmtDay, fmtHours, fmtTime } from "@/lib/format";
import { mapsLink } from "@/lib/domain";
import { CONFIDENTIAL_NOTE, paragraphs, type ReportModel, type ReportPhotoPair } from "./report-model";
import { gpsLayout } from "./gps-layout";

// Spanish words must not be hyphenated with the default (English) rules.
Font.registerHyphenationCallback((word) => [word]);

const C = {
  navy: "#023A63",
  deep: "#07243F",
  sky: "#7AD1F4",
  skySoft: "#E6F5FD",
  ink: "#0E1726",
  subtle: "#667085",
  faint: "#98A2B3",
  hairline: "#E9ECF1",
  soft: "#F4F7FA",
  amber: "#B86E00",
  amberSoft: "#FFF6E6",
  teal: "#12A594",
  tealSoft: "#E7F7F4",
  red: "#E5484D",
  redSoft: "#FDEEEE",
  blue: "#2F80ED",
};

const CONTENT_W = 515;
const PHOTO_W = (CONTENT_W - 10) / 2;
const PHOTO_H = PHOTO_W * 0.75;

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 66, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.2, color: C.ink, lineHeight: 1.42 },
  runLeft: { position: "absolute", top: 18, left: 40, fontSize: 7, color: C.faint, letterSpacing: 0.6 },
  runRight: { position: "absolute", top: 18, right: 40, fontSize: 7, color: C.faint, letterSpacing: 0.4, textAlign: "right" },
  footerRule: { position: "absolute", bottom: 50, left: 40, right: 40, height: 0.6, backgroundColor: C.hairline },
  footerNote: { position: "absolute", bottom: 23, left: 40, width: 380, fontSize: 6.4, color: C.faint, lineHeight: 1.35 },
  // `render` text is anchored from the top and kept single-line: react-pdf mis-measures dynamic text
  // (bottom anchoring / multi-line with inherited lineHeight push it off the page).
  pageFolio: { position: "absolute", bottom: 33, right: 40, width: 120, fontSize: 7, color: C.subtle, textAlign: "right" },
  pageNum: { position: "absolute", top: 809, right: 40, width: 120, fontSize: 7, lineHeight: 1, color: C.subtle, textAlign: "right" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "center" },
  wordmark: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 2.8, color: C.deep },
  brandSub: { fontSize: 7.6, color: C.subtle, marginTop: 3 },
  headerRight: { alignItems: "flex-end" },
  eyebrow: { fontFamily: "Helvetica-Bold", fontSize: 6.8, letterSpacing: 1.3, color: C.subtle },
  folio: { fontFamily: "Helvetica-Bold", fontSize: 15, lineHeight: 1.1, color: C.navy, marginTop: 3 },
  meta: { fontSize: 7.6, color: C.subtle, marginTop: 3 },
  title: { fontFamily: "Times-Roman", fontSize: 21, lineHeight: 1.15, color: C.ink, marginTop: 14 },
  subtitle: { fontSize: 8.4, color: C.subtle, marginTop: 4 },

  infoBox: { marginTop: 14, backgroundColor: C.soft, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap" },
  infoItem: { width: "50%", paddingVertical: 4, paddingRight: 10 },
  infoKey: { fontSize: 6.6, letterSpacing: 0.9, color: C.subtle, fontFamily: "Helvetica-Bold" },
  infoVal: { fontSize: 9, color: C.ink, marginTop: 1.5 },

  section: { marginTop: 18 },
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  sectionBar: { width: 12, height: 3, borderRadius: 1.5, backgroundColor: C.sky, marginRight: 6 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 7.4, letterSpacing: 1.2, color: C.navy },
  muted: { color: C.subtle },
  body: { fontSize: 9.4, lineHeight: 1.5 },

  th: { flexDirection: "row", backgroundColor: C.deep, borderTopLeftRadius: 5, borderTopRightRadius: 5, paddingVertical: 5, paddingHorizontal: 8 },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 6.6, letterSpacing: 0.8, color: "#FFFFFF" },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.6, borderBottomColor: C.hairline },
  td: { fontSize: 8.4 },
  tfoot: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: C.soft, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },

  bulletRow: { flexDirection: "row", marginBottom: 2.5 },
  bullet: { width: 10, color: C.sky, fontFamily: "Helvetica-Bold" },

  incident: { flexDirection: "row", marginBottom: 6, backgroundColor: C.soft, borderRadius: 6, overflow: "hidden" },
  incidentBar: { width: 3 },
  incidentBody: { flex: 1, paddingVertical: 6, paddingHorizontal: 9 },
  incidentTitle: { fontFamily: "Helvetica-Bold", fontSize: 8.4 },

  pair: { marginBottom: 10 },
  pairArea: { fontFamily: "Helvetica-Bold", fontSize: 8.2, marginBottom: 4 },
  pairRow: { flexDirection: "row", justifyContent: "space-between" },
  photoCell: { width: PHOTO_W },
  photo: { width: PHOTO_W, height: PHOTO_H, objectFit: "cover", borderRadius: 6 },
  photoTag: { position: "absolute", top: 6, left: 6, backgroundColor: "#FFFFFF", borderRadius: 4, paddingVertical: 2, paddingHorizontal: 5, fontFamily: "Helvetica-Bold", fontSize: 6, letterSpacing: 0.8 },
  photoCaption: { fontSize: 6.8, color: C.subtle, marginTop: 3 },
  photoEmpty: { width: PHOTO_W, height: PHOTO_H, borderRadius: 6, borderWidth: 0.8, borderStyle: "dashed", borderColor: "#C5CCD6", alignItems: "center", justifyContent: "center", backgroundColor: C.soft },

  peopleRow: { flexDirection: "row" },
  supBox: { width: 170, backgroundColor: C.skySoft, borderRadius: 8, padding: 10, marginRight: 12 },
  workers: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  worker: { width: "50%", paddingVertical: 3, paddingRight: 6 },

  confBox: { flexDirection: "row", borderWidth: 0.8, borderColor: C.hairline, borderRadius: 8, padding: 11 },
  sigBox: { width: 190, height: 74, borderRadius: 6, backgroundColor: C.soft, alignItems: "center", justifyContent: "center" },
  exception: { marginTop: 8, backgroundColor: C.amberSoft, borderRadius: 6, padding: 8 },

  gpsRow: { flexDirection: "row" },
  gpsTable: { flex: 1, marginLeft: 12 },
  gpsLine: { flexDirection: "row", paddingVertical: 3.2, borderBottomWidth: 0.6, borderBottomColor: C.hairline },

  closing: { marginTop: 18, paddingTop: 9, borderTopWidth: 0.6, borderTopColor: C.hairline, flexDirection: "row", justifyContent: "space-between" },
});

/** Pulkro mark: navy tile + sky swirl. The 32-unit swirl sits at 68% of the tile (no SVG transforms). */
function Mark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="-7.53 -7.53 47.06 47.06">
      <Rect x={-7.53} y={-7.53} width={47.06} height={47.06} rx={11.8} ry={11.8} fill={C.deep} />
      <Path d="M16 4.5a11.5 11.5 0 1 0 11.5 11.5" fill="none" stroke={C.sky} strokeWidth={3.2} strokeLinecap="round" />
      <Path d="M16 10.2a5.8 5.8 0 1 1-5.8 5.8" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={16} cy={16} r={1.9} fill={C.sky} />
    </Svg>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
    </View>
  );
}

/** Section whose heading always travels with its first item (never orphaned at the bottom of a page). */
function Section({ title, items, empty }: { title: string; items: ReactNode[]; empty?: string }) {
  const [first, ...rest] = items;
  return (
    <View style={s.section}>
      <View wrap={false}>
        <SectionHead title={title} />
        {first ?? <Text style={[s.body, s.muted]}>{empty}</Text>}
      </View>
      {rest}
    </View>
  );
}

function PhotoCell({ photo, kind, src }: { photo?: ReportPhotoPair["antes"]; kind: "ANTES" | "DESPUÉS"; src?: string }) {
  if (!photo || !src)
    return (
      <View style={s.photoCell}>
        <View style={s.photoEmpty}>
          <Text style={{ fontSize: 7.4, color: C.subtle }}>{photo ? "Foto no disponible en este dispositivo" : `Sin foto ${kind} seleccionada`}</Text>
        </View>
        <Text style={s.photoCaption}> </Text>
      </View>
    );
  return (
    <View style={s.photoCell}>
      <View>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the area name is printed above */}
        <Image src={src} style={s.photo} />
        <Text style={[s.photoTag, { color: kind === "ANTES" ? C.amber : C.teal }]}>{kind}</Text>
      </View>
      <Text style={s.photoCaption}>
        {fmtDay(photo.takenAt)} · {fmtTime(photo.takenAt)}
        {photo.lat !== undefined && photo.lng !== undefined ? ` · ${fmtCoords(photo.lat, photo.lng)}` : ""}
      </Text>
    </View>
  );
}

function GpsPlot({ m }: { m: ReportModel }) {
  const W = 150;
  const H = 112;
  const g = gpsLayout(m.site, m.gps, W, H);
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Rect x={0} y={0} width={W} height={H} rx={8} ry={8} fill={C.soft} />
      {[1, 2, 3].map((i) => (
        <Line key={`v${i}`} x1={(W / 4) * i} y1={6} x2={(W / 4) * i} y2={H - 6} stroke="#E1E6ED" strokeWidth={0.5} />
      ))}
      {[1, 2].map((i) => (
        <Line key={`h${i}`} x1={6} y1={(H / 3) * i} x2={W - 6} y2={(H / 3) * i} stroke="#E1E6ED" strokeWidth={0.5} />
      ))}
      {g.points.map((p) => (
        <Circle key={`${p.key}-a`} cx={p.x} cy={p.y} r={p.r} fill={p.kind === "entrada" ? C.teal : C.blue} fillOpacity={0.12} />
      ))}
      {g.points.map((p) => (
        <Circle key={p.key} cx={p.x} cy={p.y} r={2.4} fill={p.kind === "entrada" ? C.teal : C.blue} />
      ))}
      <Circle cx={g.cx} cy={g.cy} r={4.2} fill={C.deep} />
      <Circle cx={g.cx} cy={g.cy} r={1.6} fill={C.sky} />
      <Line x1={10} y1={H - 10} x2={10 + g.scaleBar.px} y2={H - 10} stroke={C.subtle} strokeWidth={1} />
    </Svg>
  );
}

/** The <Document>. Pass the model and the rasterized photos (photoId → data URL). */
export function buildReportDocument(m: ReportModel, images: Record<string, string>) {
  const info: [string, string][] = [
    ["CLIENTE", `${m.client.name} · ${m.client.segment}`],
    ["SITIO", m.site.name],
    ["DIRECCIÓN", `${m.site.address}, ${m.site.municipality}`],
    ["CONTACTO EN SITIO", `${m.siteContact.name} · ${m.siteContact.phone}`],
    ["FECHAS DEL SERVICIO", `${fmtDate(m.period.start)} – ${fmtDate(m.period.end)} · ${m.period.days} ${m.period.days === 1 ? "jornada" : "jornadas"}`],
    ["HORARIO PROGRAMADO", m.schedule],
    ["HORAS REALES", m.totalMinutes ? fmtHours(m.totalMinutes) : "—"],
    ["SUPERVISOR", m.supervisor.name],
  ];
  const sevColor = { baja: C.faint, media: "#F0A020", alta: C.red } as const;

  const tableHead = (
    <View style={s.th}>
      <Text style={[s.thText, { width: 52 }]}>JORNADA</Text>
      <Text style={[s.thText, { width: 92 }]}>FECHA</Text>
      <Text style={[s.thText, { width: 58 }]}>ENTRADA</Text>
      <Text style={[s.thText, { width: 58 }]}>SALIDA</Text>
      <Text style={[s.thText, { width: 58 }]}>HORAS</Text>
      <Text style={[s.thText, { flex: 1 }]}>GPS (PRECISIÓN)</Text>
    </View>
  );
  const jornadaRows = m.jornadas.map((j) => (
    <View key={j.id} style={s.tr} wrap={false}>
      <Text style={[s.td, { width: 52, fontFamily: "Helvetica-Bold" }]}>J{j.index}</Text>
      <Text style={[s.td, { width: 92 }]}>{fmtDate(j.date)}</Text>
      <Text style={[s.td, { width: 58 }]}>{j.entrada ? fmtTime(j.entrada) : "—"}</Text>
      <Text style={[s.td, { width: 58 }]}>{j.salida ? fmtTime(j.salida) : "—"}</Text>
      <Text style={[s.td, { width: 58, fontFamily: "Helvetica-Bold" }]}>{j.minutes ? fmtHours(j.minutes) : "—"}</Text>
      <Text style={[s.td, { flex: 1, color: C.subtle }]}>
        {j.gpsIn !== undefined ? `±${j.gpsIn} m` : "—"}
        {j.gpsOut !== undefined ? ` / ±${j.gpsOut} m` : ""}
        {j.manual ? " · manual" : ""}
        {j.offline ? " · sin conexión" : ""}
      </Text>
    </View>
  ));
  const tableFoot = (
    <View key="tfoot" style={s.tfoot} wrap={false}>
      <Text style={[s.td, { width: 260, color: C.subtle }]}>
        {m.period.executed} de {m.period.days} {m.period.days === 1 ? "jornada ejecutada" : "jornadas ejecutadas"}
      </Text>
      <Text style={[s.td, { width: 58, fontFamily: "Helvetica-Bold" }]}>{m.totalMinutes ? fmtHours(m.totalMinutes) : "—"}</Text>
      <Text style={[s.td, { flex: 1, color: C.subtle }]}>total real</Text>
    </View>
  );

  return (
    <Document
      title={`Reporte ${m.folio} v${m.version}`}
      author="Pulkro Compañía de Servicios"
      subject={m.title}
      creator="Pulkro Cuadrillas"
      producer="Pulkro Cuadrillas"
      keywords={`${m.folio}, ${m.client.shortName}, reporte de servicio`}
      language="es-MX"
    >
      <Page size="A4" style={s.page} wrap>
        {/* Page chrome first: fixed elements repeat on every page from where they appear. */}
        <Text fixed style={s.runLeft} render={({ pageNumber }) => (pageNumber > 1 ? "PULKRO · REPORTE DE SERVICIO" : "")} />
        <Text fixed style={s.runRight} render={({ pageNumber }) => (pageNumber > 1 ? `${m.folio} · ${m.client.shortName} · v${m.version}` : "")} />
        <View fixed style={s.footerRule} />
        <Text fixed style={s.footerNote}>
          {CONFIDENTIAL_NOTE}
        </Text>
        <Text fixed style={s.pageFolio}>
          {m.folio} · v{m.version}
        </Text>
        <Text fixed style={s.pageNum} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />

        {/* Brand header */}
        <View style={s.header}>
          <View style={s.brand}>
            <Mark />
            <View style={{ marginLeft: 9 }}>
              <Text style={s.wordmark}>PULKRO</Text>
              <Text style={s.brandSub}>Compañía de Servicios · desde 1985</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.eyebrow}>REPORTE DE SERVICIO</Text>
            <Text style={s.folio}>{m.folio}</Text>
            <Text style={s.meta}>
              Emisión {fmtDate(m.issuedAt)} · Versión {m.version}
            </Text>
          </View>
        </View>
        <Svg width={CONTENT_W} height={3} style={{ marginTop: 12 }}>
          <Defs>
            <LinearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={C.navy} />
              <Stop offset="0.55" stopColor={C.sky} />
              <Stop offset="1" stopColor="#B9C7FF" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={CONTENT_W} height={3} rx={1.5} ry={1.5} fill="url(#rule)" />
        </Svg>
        <Text style={s.title}>{m.title}</Text>
        <Text style={s.subtitle}>
          {m.serviceType}
          {m.commercialRef ? ` · Ref. ${m.commercialRef}` : ""}
          {m.unitName ? ` · ${m.unitName}` : ""}
        </Text>

        <View style={s.infoBox}>
          {info.map(([k, v]) => (
            <View key={k} style={s.infoItem}>
              <Text style={s.infoKey}>{k}</Text>
              <Text style={s.infoVal}>{v}</Text>
            </View>
          ))}
        </View>

        <Section
          title="Resumen de jornadas"
          items={[
            <View key="head">
              {tableHead}
              {jornadaRows[0]}
            </View>,
            ...jornadaRows.slice(1),
            tableFoot,
          ]}
        />

        <Section
          title="Descripción del servicio"
          empty="Sin descripción."
          items={paragraphs(m.summary).map((p, i) => (
            <Text key={i} style={[s.body, { marginBottom: 4 }]} orphans={2} widows={2}>
              {p}
            </Text>
          ))}
        />

        {m.activities.length > 0 && (
          <Section
            title="Actividades realizadas"
            items={m.activities.map((a, i) => (
              <View key={i} style={s.bulletRow} wrap={false}>
                <Text style={s.bullet}>•</Text>
                <Text style={[s.body, { flex: 1 }]}>{a}</Text>
              </View>
            ))}
          />
        )}

        <Section
          title="Incidencias"
          empty="Sin incidencias registradas durante el servicio."
          items={m.incidents.map((i) => (
            <View key={i.id} style={s.incident} wrap={false}>
              <View style={[s.incidentBar, { backgroundColor: sevColor[i.severityKey] }]} />
              <View style={s.incidentBody}>
                <Text style={s.incidentTitle}>
                  {i.folio} · {i.type} <Text style={{ fontFamily: "Helvetica", color: C.subtle }}>· severidad {i.severity.toLowerCase()} · {fmtDateTime(i.at)}</Text>
                </Text>
                <Text style={[s.body, { marginTop: 2 }]}>{i.description}</Text>
                <Text style={{ marginTop: 3, fontSize: 8.2, color: i.open ? C.red : C.teal }}>
                  {i.open ? "Abierta al momento de la emisión" : `Resolución: ${i.resolution ?? "registrada"}`}
                </Text>
              </View>
            </View>
          ))}
        />

        <Section
          title="Evidencia fotográfica · antes y después"
          empty="No se seleccionaron fotografías para este reporte."
          items={m.pairs.map((p) => (
            <View key={p.key} style={s.pair} wrap={false}>
              <Text style={s.pairArea}>{p.area}</Text>
              <View style={s.pairRow}>
                <PhotoCell photo={p.antes} kind="ANTES" src={p.antes ? images[p.antes.id] : undefined} />
                <PhotoCell photo={p.despues} kind="DESPUÉS" src={p.despues ? images[p.despues.id] : undefined} />
              </View>
            </View>
          ))}
        />

        <Section
          title="Supervisor y cuadrilla"
          items={[
            <View key="people" style={s.peopleRow}>
              <View style={s.supBox}>
                <Text style={s.infoKey}>SUPERVISOR</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.6, marginTop: 2 }}>{m.supervisor.name}</Text>
                <Text style={{ fontSize: 8, color: C.subtle }}>{m.supervisor.title}</Text>
                {m.supervisor.phone ? <Text style={{ fontSize: 8, color: C.subtle, marginTop: 3 }}>{m.supervisor.phone}</Text> : null}
              </View>
              <View style={s.workers}>
                {m.workers.length === 0 ? (
                  <Text style={[s.body, s.muted]}>Sin cuadrilla registrada.</Text>
                ) : (
                  m.workers.map((w) => (
                    <View key={w.id} style={s.worker}>
                      <Text style={{ fontSize: 8.8 }}>{w.name}</Text>
                      <Text style={{ fontSize: 7.2, color: C.subtle }}>{w.specialty}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>,
          ]}
        />

        <Section
          title="Conformidad del cliente"
          empty="Sin conformidad registrada en el cierre."
          items={[
            ...(m.conformity
              ? [
                  <View key="conf" style={s.confBox}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={s.infoKey}>{m.conformity.methodLabel.toUpperCase()}</Text>
                      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 3 }}>{m.conformity.name}</Text>
                      {m.conformity.role ? <Text style={{ fontSize: 8, color: C.subtle }}>{m.conformity.role}</Text> : null}
                      <Text style={{ fontSize: 8, color: C.subtle, marginTop: 4 }}>{fmtDateTime(m.conformity.at)}</Text>
                      {m.conformity.comment ? <Text style={[s.body, { marginTop: 4 }]}>“{m.conformity.comment}”</Text> : null}
                    </View>
                    <View style={s.sigBox}>
                      {m.conformity.signatureDataUrl ? (
                        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the signer's name is printed beside it
                        <Image src={m.conformity.signatureDataUrl} style={{ width: 176, height: 64, objectFit: "contain" }} />
                      ) : (
                        <Text style={{ fontSize: 7.4, color: C.subtle, textAlign: "center", paddingHorizontal: 10 }}>
                          {m.conformity.method === "firma" ? "Firma registrada en sitio (sin imagen digital)" : m.conformity.methodLabel}
                        </Text>
                      )}
                    </View>
                  </View>,
                ]
              : []),
            ...(m.exception
              ? [
                  <View key="exc" style={s.exception} wrap={false}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.6, color: C.amber, letterSpacing: 0.6 }}>EXCEPCIÓN DE EVIDENCIA AUTORIZADA</Text>
                    <Text style={[s.body, { marginTop: 2 }]}>{m.exception.reason}</Text>
                    <Text style={{ fontSize: 7.6, color: C.subtle, marginTop: 2 }}>
                      Autorizó {m.exception.authorizedBy} · {fmtDateTime(m.exception.at)}
                    </Text>
                  </View>,
                ]
              : []),
          ]}
        />

        <Section
          title="Ubicación GPS"
          items={[
            <View key="gps" style={s.gpsRow}>
              <View>
                <GpsPlot m={m} />
                <Text style={{ fontSize: 6.6, color: C.subtle, marginTop: 3 }}>Escala: {gpsLayout(m.site, m.gps, 150, 112).scaleBar.meters} m · centro = sitio</Text>
              </View>
              <View style={s.gpsTable}>
                <View style={s.gpsLine}>
                  <Text style={{ width: 82, fontSize: 7.8, fontFamily: "Helvetica-Bold" }}>Sitio</Text>
                  <Text style={{ flex: 1, fontSize: 7.8 }}>{fmtCoords(m.site.lat, m.site.lng)}</Text>
                  <Link src={mapsLink(m.site.lat, m.site.lng)} style={{ fontSize: 7.6, color: C.blue, textDecoration: "none" }}>
                    Ver en mapa
                  </Link>
                </View>
                {m.gps.map((p) => (
                  <View key={p.key} style={s.gpsLine}>
                    <Text style={{ width: 82, fontSize: 7.8, color: p.kind === "entrada" ? C.teal : C.blue }}>{p.label}</Text>
                    <Text style={{ flex: 1, fontSize: 7.8 }}>
                      {fmtCoords(p.lat, p.lng)} · ±{Math.round(p.accuracy)} m{p.source === "manual" ? " · manual" : ""}
                    </Text>
                    <Text style={{ fontSize: 7.6, color: C.subtle }}>{fmtDateTime(p.at)}</Text>
                  </View>
                ))}
              </View>
            </View>,
          ]}
        />

        <View style={s.closing} wrap={false}>
          <Text style={{ fontSize: 7.6, color: C.subtle }}>
            {m.validatedAt ? `Cierre validado por ${m.validatedBy} el ${fmtDateTime(m.validatedAt)}.` : "Cierre pendiente de validación."}
          </Text>
          <Text style={{ fontSize: 7.6, color: C.subtle }}>
            Emitido por {m.issuedBy} · {fmtDateTime(m.issuedAt)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
