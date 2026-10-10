Pulkro Cuadrillas
Sistema de control operativo y postventa | Documento maestro de requerimientos funcionales
Versión 1.0 · 8 de octubre de 2026 · Para análisis, dimensionamiento y cotización del desarrollador
## Resumen ejecutivo
Aplicación exclusivamente interna para Dirección, Administración y Supervisores. El ciclo inicia con un servicio ya autorizado por un sistema comercial externo. El supervisor organiza cuadrillas variables, registra ejecución y evidencia, cierra el trabajo, genera y comparte el reporte con el cliente y gestiona postventa. El cliente no inicia sesión ni descarga una aplicación.
## Convenciones de alcance
| Etiqueta | Significado |
| CONFIRMADO | Decisión expresamente seleccionada por Pulkro |
| PROPUESTO | Recomendación funcional sujeta a aprobación |
| PENDIENTE | Definición necesaria para cotizar o implementar |

# 1. Alcance y exclusiones
CONFIRMADO: solo aplicación móvil para todos los roles; sin panel web.
CONFIRMADO: alta manual de órdenes al inicio y preparación para integración futura con sistema comercial.
CONFIRMADO: operaciones y postventa; no incluir captación, solicitudes, cotización ni autorización comercial.
CONFIRMADO: clientes reciben información por WhatsApp y correo, sin cuentas ni acceso.
CONFIRMADO: no se seleccionaron alertas automáticas para el MVP.
PENDIENTE: plataformas objetivo (Android/iOS), compatibilidad mínima y dispositivos corporativos/personales.
# 2. Roles y permisos
| Acción | Dirección | Administración | Supervisor |
| Ver todas las órdenes e indicadores | Sí | Sí (según unidad) | Según asignación |
| Crear/editar orden | Consulta (propuesto) | Sí | Editar datos operativos (propuesto) |
| Asignar cuadrilla | Consulta | Consulta | Sí |
| Capturar GPS, fotos e incidencias | Consulta | Consulta | Sí |
| Autorizar cierre y envío | Consulta | Consulta | Sí |
| Gestionar quejas/encuestas | Consulta | Sí (propuesto) | Sí (propuesto) |
| Exportar PDF/Excel | Sí | Sí | PDF propio (propuesto) |
| Administrar usuarios y permisos | Pendiente | Pendiente | No |

PENDIENTE: definir quién crea usuarios, edita órdenes cerradas y visualiza información de otras unidades. Recomendación: permisos por rol y unidad, auditoría de modificaciones.
# 3. Ciclo de vida de la orden
Estados PROPUESTOS: Borrador → Programada → En ejecución → Jornada cerrada (si es multidía) → Pendiente de validación → Finalizada → Reporte enviado → Seguimiento postventa → Archivada. Estados alternos: Cancelada, Reprogramada, Con incidencia, Reabierta. Los cambios deben registrar usuario, fecha y motivo.
## Flujo principal confirmado
1. Inicio: trabajo autorizado — Administración
2. Alta manual de orden de servicio — Administración
3. Asignar supervisor y cuadrilla variable — Supervisor
4. Programar jornada(s) y recursos — Supervisor
5. Registro de entrada: hora + GPS — Supervisor
6. Fotografías ANTES obligatorias — Supervisor
7. Ejecución y registro de incidencias — Supervisor
8. Registro de salida: hora + GPS — Supervisor
9. Fotografías DESPUÉS obligatorias — Supervisor
10. ¿Quedan jornadas pendientes? — Decisión
11. ¿Evidencia completa y cierre validado? — Decisión
12. Seleccionar fotos y generar PDF — Supervisor
13. Revisar y compartir WhatsApp / email — Supervisor
14. Encuesta, quejas y seguimiento — Postventa
15. Historial, métricas y exportación — Dirección / Administración
Regla propuesta: si el servicio dura varios días, conservar registros independientes por jornada y un único cierre definitivo. Si faltan fotos obligatorias, no permitir finalizar sin excepción autorizada y justificada.
# 4. Módulos y campos
## 4.1 Orden y programación
CONFIRMADO: personal asignado, dirección y ubicación, fecha y horario programado, actividades, materiales/productos, instrucciones especiales, contacto en sitio.
CONFIRMADO: cuadrillas variables por servicio; asignación a cargo del supervisor; trabajos de uno o varios días.
PROPUESTO: folio único, cliente ID/nombre, tipo de servicio, supervisor, estado, jornadas, historial de reasignaciones y referencia al sistema comercial.
PENDIENTE: catálogo de clientes, empleados, tipos de limpieza, productos y reglas de reprogramación.
## 4.2 Ejecución y evidencia
CONFIRMADO: supervisor captura y gestiona toda la operación; trabajadores sin acceso obligatorio.
CONFIRMADO: entrada y salida con hora y geolocalización; fotografía ANTES y DESPUÉS obligatorias.
CONFIRMADO: no se requiere checklist de actividades.
CONFIRMADO: supervisión presencial y remota; supervisor autoriza el cierre.
CONFIRMADO: incidencias de daños, faltantes de material/personal, trabajos adicionales, retrasos/ausencias, solicitudes/quejas y otras con fotos.
PROPUESTO: guardar coordenadas, precisión GPS, hora del dispositivo y hora del servidor, usuario capturista, fotos con metadatos, comentarios y bitácora por jornada.
PENDIENTE: definir política cuando GPS no esté disponible y qué evidencia constituye conformidad del cliente.
## 4.3 Reporte y comunicación
CONFIRMADO: un reporte final por servicio, aun cuando abarque varias jornadas.
CONFIRMADO: incluir cliente, dirección, fechas, horarios, fotos antes/después seleccionadas, descripción, incidencias, supervisor, trabajadores, firma/conformidad y ubicación GPS.
CONFIRMADO: supervisor revisa y envía manualmente por WhatsApp o email.
PROPUESTO: PDF con marca Pulkro, folio, fecha de emisión, resumen de jornadas y pie de confidencialidad; historial de versiones y de intentos de envío.
PENDIENTE: elegir envío mediante hoja de compartir del teléfono (MVP) o integración oficial/API con registro de entrega. No asumir envío automático ni confirmación de lectura.
## 4.4 Postventa
CONFIRMADO: registro/seguimiento de quejas, historial de servicios por cliente, seguimiento posterior y encuesta de satisfacción.
CONFIRMADO: permitir encuesta mediante enlace externo sin instalar app y registro manual de comentarios.
PROPUESTO: folio de caso, categoría, severidad, responsable, fecha compromiso, evidencia, resolución, estado y vínculo con orden original.
PENDIENTE: plazos de seguimiento, responsable de quejas, preguntas de encuesta, reglas de cierre y autorización de firma.
# 5. Indicadores y fuentes de datos
| Indicador CONFIRMADO | Dato requerido / criterio PROPUESTO |
| Servicios por día/semana/mes | Fecha de cierre y folio |
| Pendientes / en proceso / terminados | Estado actual e historial |
| Número y tipo de incidencias | Categoría, orden, fecha |
| Horas reales por servicio | Entrada/salida de cada jornada; sumar intervalos |
| Servicios con quejas | Casos vinculados a orden |
| Productividad por supervisor | Órdenes cerradas y horas por supervisor; definir denominador |
| Satisfacción del cliente | Respuestas de encuesta / escala |
| Cumplimiento fotográfico | Fotos antes y después por orden |
| Productividad por trabajador | Asignaciones, jornadas y horas individuales: dato aún no definido |
| Costos y rentabilidad | Mano de obra, materiales, traslado, otros costos e ingreso; aún no definidos |
| Consumo de materiales | Cantidades entregadas y usadas por orden; aún no definidas |

ADVERTENCIA DE ALCANCE: se solicitaron métricas de costos, productividad individual y consumo, pero las etapas anteriores no definieron captura de costos, tiempos individuales ni consumos reales. Se requiere módulo de captura o integración antes de prometer estos indicadores.
# 6. Requisitos técnicos y no funcionales
CONFIRMADO: operación sin internet con captura local y sincronización posterior.
CONFIRMADO: exportaciones PDF y Excel.
PENDIENTE: almacenamiento en nube o servidor propio; desarrollador debe proponer opciones, costo mensual, retención y respaldos.
PROPUESTO: autenticación individual, sesiones seguras, cifrado en tránsito y reposo, permisos por rol, registro de auditoría, copias de seguridad y recuperación.
PROPUESTO: cola de sincronización, reintentos, estados pendientes/sincronizados/error, prevención de duplicados y manejo de conflictos; fotografías pendientes visibles.
PROPUESTO: consentimiento y aviso de privacidad para fotos, GPS, firmas y datos de clientes; políticas de acceso y eliminación según normativa aplicable.
PENDIENTE: almacenamiento estimado por mes, límites de fotos, compresión, soporte offline de mapas/GPS, servicio de correo, proveedor WhatsApp y hosting.
# 7. Pantallas sugeridas de la app
| Pantalla | Roles | Propósito |
| Inicio / tablero | Todos según permiso | Resumen, órdenes, filtros |
| Órdenes / detalle | Todos según permiso | Datos, jornadas y estados |
| Agenda y asignación | Supervisor | Personal, fechas, recursos |
| Jornada | Supervisor | Entrada, salida, GPS |
| Evidencias | Supervisor | Fotos antes/después y selección |
| Incidencias | Supervisor | Registro, fotos, resolución |
| Cierre / validación | Supervisor | Verificación y conformidad |
| Reporte / compartir | Supervisor | Vista previa PDF y compartir |
| Postventa / encuesta | Supervisor, Administración | Seguimiento y calificaciones |
| Indicadores / exportar | Dirección, Administración | Métricas y archivos |
| Configuración / catálogos | Por definir | Usuarios, roles, clientes, materiales |

# 8. Reglas de negocio y excepciones
Una orden puede tener múltiples jornadas y cambios de personal; registrar historial por fecha.
Entrada y salida deben pertenecer a la misma jornada; validar secuencia temporal y duplicados.
Fotografías antes y después son obligatorias para cierre; contemplar excepción documentada y autorizada.
Si hay incidencia abierta, supervisor decide si impide cierre: PENDIENTE definir criterios.
Compartir por WhatsApp/email es acción manual; almacenar cuándo se generó y quién inició el envío, sin afirmar entrega si no hay confirmación técnica.
En offline, permitir captura con marca de pendiente; bloquear compartir PDF definitivo si aún faltan datos por sincronizar, salvo política explícita.
Las ediciones posteriores al cierre deben generar nueva versión y trazabilidad.
# 9. Priorización para estimación
| Fase | Incluye |
| MVP 1 | Login/roles; órdenes manuales; agenda y asignación; jornadas GPS; fotos antes/después; incidencias; cierre supervisor; PDF; compartir manual; historial; offline; exportación básica. |
| MVP 1 / validar | Encuesta por enlace, registro de quejas, tablero de métricas operativas básicas; confirmar costo y esfuerzo. |
| Fase 2 | Integración con sistema comercial, indicadores avanzados de costo/rentabilidad y consumo, productividad individual, mejoras postventa, automatizaciones opcionales. |

# 10. Criterios de aceptación iniciales
Un supervisor puede crear o recibir una orden manual, asignar trabajadores y fechas y consultar el detalle desde la app.
Puede registrar entrada/salida y GPS de una jornada, con o sin conexión; la app indica claramente el estado de sincronización.
Puede adjuntar fotos ANTES y DESPUÉS; no cierra sin ambas categorías, salvo excepción autorizada.
Una orden de tres días guarda tres jornadas y emite un único reporte final con datos agregados.
Puede registrar una incidencia con tipo, descripción y fotos y verla en el historial.
Puede revisar un PDF, seleccionar fotos y abrir WhatsApp o email para compartirlo manualmente.
Dirección consulta órdenes e indicadores autorizados; supervisor no ve información restringida.
Se pueden exportar PDF de orden y Excel de indicadores habilitados.
Las encuestas y quejas quedan asociadas a cliente y orden, según el alcance finalmente contratado.
# 11. Preguntas pendientes para reunión con desarrollador
¿Android, iOS o ambas? ¿Una sola app multiplataforma?
¿Cómo se capturará conformidad/firma del cliente si no usa la app? ¿Firma presencial en dispositivo del supervisor?
¿Qué significa “productividad por trabajador”: servicios, horas o rendimiento?
¿Qué datos y fórmulas alimentarán costos, ingreso, utilidad y consumo de materiales?
¿Quién administra catálogos, usuarios y recuperación de cuentas?
¿Cómo se gestionarán quejas recibidas por teléfono/WhatsApp y encuestas por enlace?
¿Cuál es la política de GPS, precisión, permisos, ausencia de señal y privacidad?
¿Qué almacenamiento y respaldo convienen por volumen de fotos?
¿Cuál será el alcance exacto de compartir PDF versus envío integrado y comprobante de entrega?
¿Se requiere multiunidad/multiciudad desde el inicio?
# 12. Entregables esperados del proveedor
Mapa de pantallas y prototipo navegable por rol.
Modelo de datos y arquitectura offline/sincronización.
Estimación desglosada por módulo, costo inicial y costo recurrente.
Cronograma de diseño, desarrollo, pruebas, piloto y despliegue.
Plan de seguridad, respaldo, mantenimiento y propiedad de código/datos.
Propuesta de pruebas con supervisores reales y criterios de aceptación.
