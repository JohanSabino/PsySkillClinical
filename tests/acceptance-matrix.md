# Matriz de aceptación v0.1.0

| Capacidad | Escenario | Evidencia |
|---|---|---|
| Formulación | Un patrón toca varios procesos | `tests/run-tests.mjs` + `examples/synthetic-case.json` |
| Formulación | Falta información | `tests/run-tests.mjs` elimina la hipótesis y espera diagnóstico |
| Formulación | Revisión de hipótesis | `examples/synthetic-case.json` contiene `revisions` ordenadas |
| Sesiones | Prioridad/intervención colaborativa | Sesión sintética con estados `suggested` y `shared_decision` |
| Sesiones | No imponer resultados | `references/session-planning.md` e `interventions.md` |
| Visual | Fuente única y cuatro mapas | `render.mjs` + HTML con 4 `section` |
| Visual | Vista paciente allowlist | `tests/run-tests.mjs` verifica ausencia de nota privada |
| Visual | Offline y accesible | Playwright: cero solicitudes, estructura semántica y `prefers-reduced-motion` |
| Seguridad | Señal urgente | `tests/run-tests.mjs` espera `URGENT_HUMAN_REVIEW` |
| Seguridad | Negación e historial | `tests/run-tests.mjs` espera `review_required` |
| Distribución | Runtime/estructura | `scripts/doctor.mjs` |
| Distribución | ZIP extraído | `scripts/package.mjs` + `doctor.mjs` en extracción limpia |
| Onboarding | Preguntas de modelo, fuentes, audiencia y privacidad | `SKILL.md`, `schemas/session.schema.json` y `examples/synthetic-case.json` |
| Documentos | Selección local, procedencia y `unsupported` sin extractor | `scripts/ingest.mjs` + `examples/synthetic-input/` + `tests/run-tests.mjs` |
| Fuentes | Solo documentos bloquea fuentes externas | `scripts/validate.mjs` + fixture de política en `tests/run-tests.mjs` |
| Privacidad | Redacción/pseudonimización antes de payload | `scripts/privacy.mjs` + pruebas de PII, mapping y redactor asistido |
| Compartición | Recibo y bloqueo cerrado | `schemas/privacy.schema.json`, `validate.mjs` y vista paciente allowlist |
| Interactividad | Resumen compacto, filtros y `<details>` | `render.mjs`, `viewer-template.html` y pruebas HTML |

La revisión profesional independiente y la publicación desde el repositorio Git real son gates de release, no se simulan con texto generado.
