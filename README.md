# Universal Science Lab

Plataforma universal de laboratorios científicos virtuales. Ver [docs/00-discovery.md](docs/00-discovery.md) para la investigación y definición maestra, [docs/01-architecture.md](docs/01-architecture.md) para la arquitectura (núcleo universal + adaptadores de motor) y [docs/02-roadmap.md](docs/02-roadmap.md) para las fases y criterios de aceptación.

## Estado actual

- **Implementado:** núcleo con registro de adaptadores por disciplina (`apps/api/engines/registry.py`) y tres laboratorios reales de punta a punta, cada uno con editor, ejecución, diagrama/gráfico y comparación de corridas:
  - **Electrónica** (`electronics-dc`): análisis nodal DC propio en NumPy.
  - **Redes** (`networking-topology`): subnetting IPv4 real (`ipaddress`) + alcanzabilidad por grafo.
  - **Agricultura** (`agriculture-gdd`): modelo de grados-día de crecimiento (GDD).
- **Pendiente:** física, química, anatomía, robótica, IA, colaboración, SoilGrids, editor por arrastre, Postgres real, Docker. Ver el roadmap.
- **Nota de persistencia:** el MVP guarda proyectos en `apps/api/data/projects.json` (no en Postgres todavía) para poder demostrar el flujo completo sin levantar una base de datos primero.
- **Nota de seguridad pendiente:** `npm audit` reporta vulnerabilidades en la cadena de dependencias de Next.js 14.2.x (incluye un CVE de RCE en Windows en versiones no parcheadas); se fijó `next@14.2.35` (la última parchada en la rama 14) pero no se migró a Next 16 en esta sesión para no introducir un cambio mayor sin probarlo. Antes de exponer esto fuera de `localhost`, revisar `npm audit` y considerar la migración a Next 15/16.

## Correr en local

Backend (FastAPI):

```bash
cd apps/api
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

Frontend (Next.js), en otra terminal:

```bash
cd apps/web
npm install
npm run dev
```

Abrir `http://localhost:3000` (catálogo) → `/electronics`, `/networking` o `/agriculture`.
