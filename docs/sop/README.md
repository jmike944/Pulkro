# SOP · Pulkro Cuadrillas

Standard operating procedures, in the three-level document pyramid (Spanish, México), with the same design as the manual:

| Level | Document | File |
|---|---|---|
| L1 | Mapa de procesos y políticas operativas (`PK-SOP-L1`) | `Pulkro_Cuadrillas_SOP_L1_Procesos_y_Politicas.pdf` |
| L2 | Procedimientos operativos estándar (`PK-SOP-L2-01` … `-11`) | `Pulkro_Cuadrillas_SOP_L2_Procedimientos.pdf` |
| L3 | Manual de usuario (`PK-SOP-L3`) | `../manual/Pulkro_Cuadrillas_Manual_de_Usuario.pdf` |

Sources: `L1/chapters/*.html`, `L2/chapters/*.html` (each folder's `doc.json` names its PDF and labels). `BRIEF.md` is the
style guide for L2 procedures; `L2/chapters/06-cierre.html` is the reference procedure.

```bash
node docs/manual/tools/build.cjs --doc docs/sop/L1          # → docs/sop/Pulkro_Cuadrillas_SOP_L1_Procesos_y_Politicas.pdf
node docs/manual/tools/build.cjs --doc docs/sop/L2          # → docs/sop/Pulkro_Cuadrillas_SOP_L2_Procedimientos.pdf
node docs/manual/tools/build.cjs --doc docs/sop/L2 --only 03  # draft of one procedure → docs/sop/L2/build/
```
Everything Pulkro has not decided yet is marked «Por definir» and listed in L1 › Decisiones pendientes.
