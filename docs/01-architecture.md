# Universal Science Lab — Arquitectura

## 1. Principio: núcleo universal + adaptadores de motor

El núcleo **no calcula ciencia**. Administra entidades genéricas (usuarios, proyectos, escenas, componentes, experimentos, mediciones, resultados) y expone un contrato idéntico para que cualquier disciplina conecte su propio motor.

```
┌─────────────────────────────────────────────────────────┐
│                     NÚCLEO UNIVERSAL                     │
│  Auth · Roles · Catálogo · Escenas · Experimentos ·      │
│  Mediciones · Cuaderno · Versionado · Colaboración · IA  │
└───────────────┬───────────────┬───────────────┬─────────┘
                │ contrato       │ contrato       │ contrato
                ▼                ▼                ▼
      ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
      │ Adaptador        │ │ Adaptador   │ │ Adaptador        │
      │ Electrónica      │ │ Física      │ │ ... (N dominios) │
      │  → ngspice       │ │  → RK4 own  │ │                  │
      └─────────────────┘ └─────────────┘ └─────────────────┘
```

## 2. Contrato del adaptador (igual para todas las disciplinas)

Operaciones obligatorias: `validate(scene) -> ValidationResult`, `initialize(scene, params) -> RunHandle`, `run(handle) -> ResultSet`, `pause(handle)`, `step(handle, dt)`, `reset(handle)`, `checkpoint(handle) -> Snapshot`, `export_results(handle) -> ExportedData`.

Metadatos obligatorios por adaptador: nombre, versión, disciplina, nivel de fidelidad (1–5, ver sección 9 del encargo), componentes soportados, parámetros admitidos (con unidades), condiciones iniciales requeridas, límites de hardware, licencia del motor subyacente.

El núcleo se comunica con el adaptador por un **boundary de proceso** (no en memoria compartida): cada adaptador corre en su propio worker/contenedor con límites de CPU/memoria/tiempo. Esto es lo que permite cumplir la regla "no ejecutar código no confiable en el proceso principal del backend" incluso cuando el adaptador es de confianza (ngspice), porque el mismo mecanismo se reutiliza sin cambios cuando el adaptador viene de un laboratorio creado por un usuario.

## 3. Modelo de datos (subconjunto implementado en el MVP)

Entidades completas están en la sección 11 del encargo; el MVP implementa el subconjunto necesario para un experimento de electrónica de punta a punta:

- `User`, `Project`, `Scene`, `SceneObject` (instancia de un `Component` en una escena, con posición/propiedades),
- `Component`, `ComponentVersion` (catálogo: resistencia, fuente DC, cable, nodo de medición),
- `Experiment`, `ExperimentParameter`, `Run`, `Measurement`, `Result`,
- `EngineAdapter`, `EngineVersion` (registro de qué adaptador ejecutó cada `Run`, con su nivel de fidelidad).

Las demás entidades (cursos, rúbricas, publicaciones, IA) quedan en el modelo pero no se implementan hasta fases posteriores (ver roadmap).

## 4. Stack técnico (decisión para el MVP, revisable)

- **Frontend:** Next.js + React + TypeScript + Tailwind. Canvas 2D (no 3D todavía) para el editor de protoboard — el 3D se reserva para cuando se aborde física/anatomía, donde sí aporta valor real.
- **Backend:** FastAPI (Python) — porque el adaptador de electrónica llama a `ngspice` como proceso externo, y Python tiene bindings maduros para eso.
- **Motor de electrónica:** `ngspice` invocado como subproceso aislado, con un traductor interno de "componentes de la escena" → netlist SPICE → resultados parseados de vuelta a `Result`/`Measurement`.
- **Datos:** PostgreSQL para todo lo relacional; sin S3/MinIO todavía (no hay assets pesados en el MVP de electrónica — se añade cuando entre anatomía).
- **Sin Docker todavía en este primer corte**: se corre local (Node + Python) para iterar rápido; Docker Compose se añade en la fase de "escalabilidad" cuando haya más de un servicio real que orquestar.

## 5. Por qué electrónica como primer laboratorio

De los candidatos reales identificados en el discovery (ngspice, Webots/MuJoCo, myPhysicsLab, Z-Anatomy, SoilGrids), electrónica con ngspice es el que permite demostrar el contrato completo (`validate→run→export_results`) con:
- una licencia de motor sin ambigüedad (BSD-3-Clause),
- cálculo verificable contra un valor de referencia conocido (ley de Ohm / análisis nodal, fácil de comprobar a mano),
- sin dependencia de assets 3D con licencia incierta,
- sin necesitar GPU ni colas de trabajo pesadas.

Esto prueba la arquitectura sin heredar los riesgos legales/de rendimiento de los demás dominios.
