# Revisión visual v0.1.0 · visor compacto interactivo

Fecha: 2026-09-13. Artefacto: `dist/hexaflex.html`. Se inspeccionó con Playwright usando servidor local y URL versionada para evitar caché.

| Viewport | scrollWidth | innerWidth | scrollHeight | Secciones | Overflow horizontal |
|---|---:|---:|---:|---:|---|
| 1440×900 | 1440 | 1440 | 3011 | 4 | No |
| 1600×1000 | 1600 | 1600 | 3011 | 4 | No |
| 1920×1080 | 1920 | 1920 | 3011 | 4 | No |
| 390×844 | 390 | 390 | 5498 | 4 | No |
| 462×843 (visor Codex) | 462 | 447 | 6311 clínica / 2662 paciente | 5 | No |

Consola: 0 errores, 0 warnings. En el visor local se verificó el filtro de proceso (12→5 bloques en clínica y 11→2 en paciente), restablecimiento, expansión/plegado con teclado, navegación semántica, `aria-labelledby`, foco visible, texto equivalente y `prefers-reduced-motion`. Las capturas reproducibles viven en `output/playwright/` localmente y se excluyen del ZIP de distribución.
