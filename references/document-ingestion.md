# Ingestión local de documentos

## Cómo aportar archivos

Pide al profesional que copie los archivos autorizados a una carpeta `inputs/` dentro del proyecto o que pegue rutas locales concretas. Si `inputs/` no existe, propone `ensureInputDirectory(..., { confirmCreate: true })` y espera confirmación explícita; nunca la crees silenciosamente. Enumera primero los candidatos y espera confirmación del conjunto antes de extraer. No recorras el disco completo ni incluyas archivos ocultos, temporales o no seleccionados.

Formatos iniciales: PDF, DOCX, Markdown, texto y JSON. Markdown, texto y JSON se extraen con el runtime base. PDF usa `pdftotext` si está disponible y DOCX usa `pandoc` si está disponible; `doctor.mjs` muestra la capability. Si no hay adaptador, marca el archivo como `unsupported` y ofrece aportar texto extraído manualmente. Nunca envíes el documento a un OCR remoto por defecto.

Cada fragmento conserva archivo, SHA-256, página o sección, extractor y estado de legibilidad (`full`, `partial`, `unsupported` o `unreadable`). Una extracción parcial no autoriza a completar el contenido faltante.

## Límites recomendados

- 5 MB por archivo, 20 archivos y 100 páginas por lote como valores iniciales configurables.
- Confirmar el lote antes de formular o buscar.
- Conservar solo hashes y procedencia en recibos; no copiar el texto crudo a logs.
