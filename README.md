# Universal Science Lab

Plataforma universal de laboratorios científicos virtuales. Ver [docs/00-discovery.md](docs/00-discovery.md) para la investigación y definición maestra, [docs/01-architecture.md](docs/01-architecture.md) para la arquitectura (núcleo universal + adaptadores de motor) y [docs/02-roadmap.md](docs/02-roadmap.md) para las fases y criterios de aceptación.

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
- **Pendiente:** anatomía (bloqueada por decisión de licencia de modelos 3D), dinámica de robots (Webots/MuJoCo, evaluación pendiente), tutor de IA, aulas/evaluaciones, creación de laboratorios por usuarios, SoilGrids, editor por arrastre, colas/monitorización/CI-CD. Ver el roadmap.
- **Nota de seguridad pendiente:** `npm audit` reporta vulnerabilidades en la cadena de dependencias de Next.js 14.2.x (incluye un CVE de RCE en Windows en versiones no parcheadas); se fijó `next@14.2.35` (la última parchada en la rama 14) pero no se migró a Next 16 en esta sesión para no introducir un cambio mayor sin probarlo. Antes de exponer esto fuera de `localhost`, revisar `npm audit` y considerar la migración a Next 15/16.

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
