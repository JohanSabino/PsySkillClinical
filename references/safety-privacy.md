# Seguridad, privacidad y audiencia

## Límites

La skill ayuda a profesionales cualificados. No diagnostica, prescribe, decide elegibilidad, reemplaza supervisión ni gestiona crisis de forma autónoma.

## Gate conservador de riesgo

El detector solo es un recordatorio. Si encuentra lenguaje compatible con daño inminente, suicidio, violencia, abuso o incapacidad grave, detén formulación, sesiones y materiales; solicita evaluación humana inmediata conforme al protocolo local. No prometas sensibilidad o especificidad clínica.

Las negaciones explícitas (“niega”, “no tiene intención”) y referencias históricas se clasifican como `review_required` si el contexto no es inequívoco. Nunca conviertas una negación textual en garantía de seguridad.

## Minimización

Usa un identificador de caso no directo. Evita nombre, documento, dirección, contacto, fecha de nacimiento y detalles no necesarios. El renderer no hace solicitudes de red, no almacena sesiones y no añade telemetría. El profesional controla rutas y copias.

La ingestión ocurre en dos zonas. La zona `raw` local puede leer el archivo seleccionado para extraer texto y activar el gate de seguridad; la zona `model-ready` se construye después con `scripts/privacy.mjs`. Redacta por defecto con tokens de tipo `[REDACTED_*]`. La pseudonimización consistente es opt-in: su mapping es efímero o cifrado local, no forma parte del payload y debe poder destruirse explícitamente.

No envíes el texto crudo a un segundo agente para que lo “camufle”. Si se habilita un redactor asistido, recibe únicamente texto ya minimizado, requiere consentimiento y revisión del diff. Si no se puede inspeccionar el payload final, el envío falla cerrado. La transformación reduce exposición; no equivale a anonimización perfecta ni garantiza que no existan identificadores indirectos.

Para preparar un payload local:

```bash
node scripts/privacy.mjs caso.json caso-model-ready.json --mode redact --name "Nombre de prueba"
```

El comando escribe el payload transformado y un recibo sin contenido clínico crudo. Los recibos registran hashes, reglas, conteos, audiencia y advertencias para una auditoría local.

## Audiencias

- `clinical`: puede incluir procedencia, incertidumbre, preguntas abiertas y notas privadas.
- `patient`: solo campos de una allowlist: título colaborativo, procesos explicados en lenguaje sencillo, recursos, valores confirmados, acciones acordadas y preguntas para conversar.
- `shareable`: solo se marca tras previsualización y confirmación explícita del profesional.

Si hay dudas, conserva la salida como privada. No escondas riesgo o incertidumbre mediante color, animación o lenguaje tranquilizador.
