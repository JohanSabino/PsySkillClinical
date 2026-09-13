# Política de fuentes

La sesión debe elegir una política explícita:

- `documents_only`: responder solo con los archivos seleccionados; lo que falte queda como desconocido.
- `documents_plus_external`: permitir búsqueda externa únicamente después de confirmación; cada afirmación externa conserva URL, fecha, título, fragmento y hash SHA-256 de respaldo.
- `external_blocked`: bloquear cualquier adaptador de red y devolver un diagnóstico si se intenta buscar.

Cambiar de política reinicia el recibo de fuentes y marca incompatible cualquier recibo previo cuyo `source_policy` no coincida. El renderer sigue siendo offline: una búsqueda autorizada se realiza en el flujo del agente, no desde el HTML. Las hipótesis se etiquetan como hipótesis y no se convierten en hechos por repetición.
