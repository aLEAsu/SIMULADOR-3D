# Umbral — Observatorio de simulación científica

**Lo invisible, hecho visible.** Laboratorios 3D en los que primero *predices*, después experimentas y luego enciendes la **lente** para ver el mecanismo oculto, calculado y no animado. Ver [docs/05-umbral-experiencia-3d.md](docs/05-umbral-experiencia-3d.md) para la visión, las decisiones y los límites.

- `/` Observatorio 3D · `/anatomy` LAB·01 Anatomía multicapa · `/networking` LAB·02 Redes · `/robotics` LAB·03 Robótica con física Rapier.
- Los motores de Redes y Robótica corren en el navegador (`apps/web/app/lib/engines`) y se verifican contra los solvers Python: `node tools/golden/run.ts` → 213/213.
- Los laboratorios de Electrónica, Física, Química y Agrociencia siguen disponibles como "archivo clásico" y usan la API Python.

Documentación histórica: [docs/00-discovery.md](docs/00-discovery.md), [docs/01-architecture.md](docs/01-architecture.md), [docs/02-roadmap.md](docs/02-roadmap.md), [docs/04-product-transformation.md](docs/04-product-transformation.md).

## Estado actual

- **Implementado:** núcleo con registro de adaptadores por disciplina (`apps/api/engines/registry.py`) y tres laboratorios reales de punta a punta, cada uno con editor, ejecución, diagrama/gráfico y comparación de corridas:
  - **Electrónica** (`electronics-dc`): análisis nodal DC propio en NumPy.
  - **Redes** (`networking-topology`): subnetting IPv4 real (`ipaddress`) + alcanzabilidad por grafo.
  - **Agricultura** (`agriculture-gdd`): modelo de grados-día de crecimiento (GDD).
  - **Física** (`physics-mechanics-rk4`): integrador RK4 de F=ma (gravedad, resorte de Hooke, amortiguamiento), verificado contra soluciones analíticas (caída libre, oscilador armónico, conservación de energía).
  - **Química** (`chemistry-titration-strong`): titulación ácido-base fuerte por balance de moles exacto, verificada contra el cálculo manual (pH=7.00 exacto en el punto de equivalencia).
  - **Robótica** (`robotics-arm2-kinematics`): cinemática inversa exacta de un brazo planar de 2 eslabones (ley de cosenos), verificada por cinemática directa (error ~10⁻¹⁵). Solo cinemática, sin dinámica ni motor físico.
  - **Colaboración en tiempo real** (`apps/api/connection_manager.py`, WebSocket en `/ws/projects/{id}`): cambios de escena y corridas se sincronizan en vivo entre todos los clientes conectados al mismo proyecto, con contador de presencia, en los 6 laboratorios. Verificado con dos pestañas reales. Sin resolución de conflictos ni permisos — último guardado gana.
  - **Persistencia real y Docker** (Fase 7): `apps/api/db.py` reemplazó el JSON por PostgreSQL (`asyncpg`, tablas `projects`/`runs`); `docker-compose.yml` orquesta `db` + `api` + `web`. Verificado con `docker compose up --build`: los 6 laboratorios probados en el navegador y los datos confirmados directamente por `psql` en la base real (no solo "se ve bien en la pantalla").
  - **Anatomía — sistema óseo** (`/anatomy`): visor 3D real con Three.js, modelo derivado de BodyParts3D vía Z-Anatomy (CC BY-SA 4.0, decisión confirmada por el usuario), convertido de FBX a GLB con Blender headless (`tools/anatomy/convert_fbx_to_glb.py`). 2029 estructuras óseas reales, filtro/selección/aislamiento verificados en navegador. Es un visor, no pasa por el registro de adaptadores (no hay "cálculo" que hacer). Atribución legal completa en la página.
  - **Tutor de IA** (`apps/api/tutor.py`): llama a la API de Anthropic con el estado real del proyecto como contexto; nunca inventa resultados numéricos, solo explica los que ya calculó el motor. Integrado en los 6 laboratorios. Requiere `ANTHROPIC_API_KEY` en un `.env` propio (ver `.env.example`) — **todavía no probado de punta a punta** porque no se cargó una clave real en este entorno.
- **Pendiente:** otros sistemas anatómicos (muscular, cardiovascular, etc. — mismo pipeline ya probado), dinámica de robots (Webots/MuJoCo, evaluación pendiente), aulas/evaluaciones, creación de laboratorios por usuarios, SoilGrids, editor por arrastre, colas/monitorización/CI-CD. Ver el roadmap.
- **Nota de seguridad pendiente:** `npm audit` reporta vulnerabilidades en la cadena de dependencias de Next.js 14.2.x (incluye un CVE de RCE en Windows en versiones no parcheadas); se fijó `next@14.2.35` (la última parchada en la rama 14) pero no se migró a Next 16 en esta sesión para no introducir un cambio mayor sin probarlo. Antes de exponer esto fuera de `localhost`, revisar `npm audit` y considerar la migración a Next 15/16.

## Tutor de IA (opcional)

```bash
cp .env.example .env
```

Completá `ANTHROPIC_API_KEY` en ese `.env` (nunca lo pegues en el chat ni lo commitees — ya está en `.gitignore`). Sin esa clave, el resto de la plataforma funciona igual; solo el tutor responde con un error claro en vez de romperse.

## Agregar otro sistema anatómico

Los demás archivos FBX (muscular, cardiovascular, nervioso, etc.) ya están identificados en `github.com/LluisV/Z-Anatomy` (carpeta `Resources/Models/FBX/`). Con Blender instalado:

```bash
blender --background --python tools/anatomy/convert_fbx_to_glb.py -- INPUT.fbx apps/web/public/models/anatomy/OUTPUT.glb
```

## Correr

### Opción A — todo en Docker (recomendado)

```bash
docker compose up --build
```

Levanta Postgres, el backend y el frontend. Abrir `http://localhost:3000`.

### Opción B — Postgres en Docker, backend y frontend en local (para iterar rápido)

```bash
docker compose up db
```

Backend (FastAPI), en otra terminal:

```bash
cd apps/api
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

Por defecto se conecta a `postgresql://usl:usl@localhost:5432/usl` (coincide con el puerto que publica `docker compose up db`); sobreescribible con la variable de entorno `DATABASE_URL`.

Frontend (Next.js), en otra terminal:

```bash
cd apps/web
npm install
npm run dev
```

Abrir `http://localhost:3000` (catálogo) → `/electronics`, `/networking`, `/agriculture`, `/physics`, `/chemistry` o `/robotics`.
