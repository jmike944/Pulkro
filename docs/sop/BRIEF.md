# SOP Nivel 2 · brief for procedure authors

Pulkro's documentation is a three-level pyramid:

- **L1** `PK-SOP-L1`: process map and policies (the *why*). Written separately.
- **L2** `PK-SOP-L2-NN`: procedures (the *who, what, when and which record*). **You write these.**
- **L3** `PK-SOP-L3`: the user manual (the *how*, screen by screen), already finished in `docs/manual/chapters/*.html`.

## Your model
`docs/sop/L2/chapters/06-cierre.html` (PK-SOP-L2-06 Cierre y validación del servicio) is the reference. Copy its structure,
components, tone and depth **exactly**:

1. The header: `section.chapter` with `data-code`, then `header.sop-head` (band with code, «Procedimiento · Nivel 2», h1 and
   purpose; `dl.meta` with Dueño del proceso, Participan, Versión «1.0 · borrador», Emisión «17 oct 2026», Empieza cuando,
   Termina cuando, Instrucción de trabajo (Nivel 3)).
2. Ten numbered sections, `<h2 class="section"><span class="no">N</span>Title</h2>`, always these titles: 1 Objetivo ·
   2 Alcance (`table.kv`: Aplica a, No incluye, Entradas, Salidas) · 3 Responsabilidades (`table.raci` + `.raci-legend`) ·
   4 Definiciones (`table.kv`, only the terms this procedure needs) · 5 Desarrollo (`.flowstrip` of 5–8 boxes, then
   `table.proc`; optional `h3` sub-procedures «5.1 …» with their own `table.proc`) · 6 Controles · 7 Excepciones y escalamiento ·
   8 Registros · 9 Indicadores · 10 Documentos relacionados.
3. Components available (see `docs/manual/assets/manual.css`, «SOP documents»): `.role.sup|adm|dir|cli|app|all`,
   `.ra.r|a|c|i`, `.pill.<tone>`, `.ui`, `.ui.primary`, `.mono` for codes, `.tbd` («Por definir»), `.note.*`, `table.proc`
   (`td.n > span` number, `span.dec > i` decision rhombus, `td.who`, `td.rec`, `b.t` step title, `span.l3` manual reference),
   `.flowstrip > .st.sup|adm|dir|cli|app|dec|end` with `<small>` role label. Do not add CSS or edit shared files; if you
   truly need a component that does not exist, report it.

## Language and truth
- Spanish (México), formal. Steps are written as **infinitives** («Abrir…», «Registrar…»); explanations in *usted* voice.
  No *tú*. UI labels exactly as in the app/manual, in `<span class="ui">`.
- **Everything must be true of the app today.** Sources, in this order: the manual chapters (`docs/manual/chapters/NN-*.html`,
  already verified against the app), `docs/requisitos.md`, `src/lib/permissions.ts` (who may do what → RACI),
  `src/lib/status.ts` (statuses and their tones), `src/lib/domain.ts` and `src/lib/store.ts` (rules), the feature code in
  `src/features/` when you need to confirm a detail.
- **Never invent policy**: no deadlines, frequencies, approval levels, escalation contacts or targets that neither the app nor
  `docs/requisitos.md` defines. Where an SOP would normally state one and Pulkro has not decided, write it with
  `<span class="tbd">Por definir</span>` (as 06 does for incident criteria and targets). Rules the app enforces go in
  **6 Controles**, worded as what the app does.
- **L3 references** (`span.l3` and the header's «Instrucción de trabajo») use the manual's real chapter titles and section
  titles (the `<h1>` and `<h2 class="section">` texts in `docs/manual/chapters/`): «Capítulo › Sección».
- RACI from `permissions.ts`: the role that does the activity is **R**; the role that answers for the result is **A** (when the
  same role does and answers, mark **A** only, as 06 does); roles that read it in the app are **I**; **C** only where someone
  is genuinely consulted before (e.g. the client). Columns: Supervisor · Administración · Dirección · Cliente (drop Cliente if
  the client never takes part).
- Indicators only if the app computes them (Indicadores › Operación/Calidad/Personal, Evidencias › Cumplimiento, Postventa…);
  otherwise say the measure and mark the target `Por definir`.
- Cross-references between procedures by code (`<span class="mono">PK-SOP-L2-04</span>`).

## Procedures
| File | Code | Title | Owner | Main L3 chapters |
|---|---|---|---|---|
| 01-alta-orden.html | PK-SOP-L2-01 | Alta de la orden de servicio | Administración | Nueva orden · Órdenes · Configuración (catálogos) · Clientes |
| 02-programacion.html | PK-SOP-L2-02 | Programación de jornadas y asignación de cuadrilla | Supervisor | Agenda y asignación · Órdenes |
| 03-jornada.html | PK-SOP-L2-03 | Ejecución de la jornada en campo | Supervisor | La jornada en campo · Mapa del día · Inicio y Pendientes |
| 04-incidencias.html | PK-SOP-L2-04 | Registro y resolución de incidencias | Supervisor | Incidencias · La jornada en campo |
| 05-evidencia.html | PK-SOP-L2-05 | Control de evidencia fotográfica | Supervisor | Evidencias · La jornada en campo |
| 06-cierre.html | PK-SOP-L2-06 | Cierre y validación del servicio | Supervisor | (written) |
| 07-reporte.html | PK-SOP-L2-07 | Reporte final y envío al cliente | Supervisor | Reportes y envío al cliente |
| 08-postventa.html | PK-SOP-L2-08 | Postventa: encuestas, quejas y seguimiento | Administración | Postventa · Encuesta de satisfacción · Clientes |
| 09-indicadores.html | PK-SOP-L2-09 | Seguimiento de indicadores y control operativo | Dirección | Indicadores · Inicio y Pendientes · Bitácora · Equipo |
| 10-usuarios.html | PK-SOP-L2-10 | Administración de usuarios, permisos y catálogos | Dirección | Configuración · Entrar a la app · Apéndice |
| 11-sin-conexion.html | PK-SOP-L2-11 | Operación sin conexión y sincronización | Todos los roles | Trabajo sin conexión y sincronización · Configuración |

Each procedure stays within its scope and hands off to the others by code (06 shows how: «No incluye» and the decision rows).

## Check your work
From `docs/sop`: `node ../manual/tools/build.cjs --doc L2 --only 03` → `L2/build/draft-03.pdf`. It must print
`no section that fits on a page was split` and no `OVERFLOW`. Look at the pages (`pdftoppm -r 60 -png L2/build/draft-03.pdf
L2/build/p03` and Read a few). Aim for 4–7 pages per procedure. Only create your own `docs/sop/L2/chapters/NN-*.html` files;
do not edit anything else, do not commit.

## Report back
Per procedure: pages, the `Por definir` items you flagged, and any fact you could not verify.
