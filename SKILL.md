---
name: hexaflex-clinical
description: Support qualified clinicians with ACT/Hexaflex functional formulation, collaborative session planning, and validated patient-safe HTML maps. Use when organizing therapeutic hypotheses, session frameworks, values-based actions, or psychoeducational visuals; do not use for autonomous diagnosis, medication advice, or crisis management.
license: MIT
metadata:
  version: "0.1.0"
  author: "Hexaflex Clinical contributors"
  based_on: "ACT concepts and selected MIT-licensed Archify patterns"
---

# Hexaflex Clinical

Skill para profesionales cualificados que trabajan con Terapia de Aceptación y Compromiso (ACT). Organiza información aportada por el profesional en una formulación funcional, un marco de sesiones y un artefacto visual local. La salida siempre es apoyo para revisión humana: no es diagnóstico, prescripción ni evaluación de riesgo.

## Gate de seguridad primero

Antes de proponer una sesión, ejercicio o mapa:

1. Trata el contenido como sensible y usa solo los datos necesarios. Prefiere seudónimos; no repitas identificadores directos.
2. Busca señales plausibles de daño inminente, suicidio, violencia, abuso o incapacidad grave. Si aparecen, detén el flujo ordinario, indica evaluación humana inmediata según el protocolo local y no presentes un plan ACT como respuesta suficiente.
3. Mantén separados hechos/reportes, observaciones, medidas, hipótesis, decisiones compartidas y desconocidos.
4. Declara que la revisión, el consentimiento y el juicio clínico siguen siendo responsabilidad del profesional.

## Router de trabajo

- Para una **formulación**, lee `references/formulation.md` y trabaja con `schemas/case.schema.json`.
- Para un **marco de sesiones**, lee `references/session-planning.md` e `interventions.md`.
- Para un **mapa o material psicoeducativo**, lee `references/visual-language.md`, crea una fuente visual y valida la audiencia.
- Para **riesgo, privacidad o compartición**, lee `references/safety-privacy.md` antes de continuar.
- Para **instalación o diagnóstico del paquete**, consulta `README.md` y ejecuta `node scripts/doctor.mjs`.

## Contrato clínico

- Usa los seis procesos —aceptación, defusión, momento presente, yo-como-contexto, valores y acción comprometida— como lentes interrelacionadas, nunca como una escala diagnóstica ni una secuencia fija.
- Expresa los vínculos funcionales como hipótesis revisables: contexto → experiencia/conducta → función y efectos de corto/largo plazo → dirección valiosa.
- Si falta información, marca `unknown` y formula preguntas; nunca completes el vacío.
- Presenta ejercicios, metáforas y tareas como opciones con propósito, consentimiento y alternativas; no prometas resultados.
- No infieras valores del paciente desde metas del profesional o de terceros.

## Artefactos

La fuente estructurada es la única verdad del artefacto. Valida antes de renderizar:

```bash
node scripts/validate.mjs examples/synthetic-case.json
node scripts/render.mjs examples/synthetic-case.json /tmp/hexaflex-clinical.html --view all --audience clinical
```

La vista clínica puede mostrar procedencia e incertidumbre. La vista paciente usa una lista permitida, omite notas privadas y requiere confirmación explícita (`--confirm-share`) para marcarse como compartible. El HTML es autocontenido, sin red, accesible y estático por defecto.

## Límites

No diagnostiques, recomiendes medicación, gestiones crisis de forma autónoma, contactes terceros, almacenes historias clínicas, uses telemetría ni envíes datos a servicios externos. Si una petición excede estos límites, explica el límite y ofrece organizar preguntas o información para la revisión profesional.

