# Universal Science Lab — Roadmap y riesgos

## Fases (según el encargo original, con alcance realista por fase)

- **Fase 0 — Discovery:** este documento + arquitectura. Hecho en esta sesión (versión v1, ampliable).
- **Fase 1 — Núcleo universal:** auth, proyectos, escenas, catálogo, experimentos, API de adaptadores. *En progreso en esta sesión (subconjunto mínimo para soportar el MVP de electrónica).*
- **Fase 2 — MVP de un laboratorio real (electrónica):** protoboard 2D, catálogo básico de componentes, adaptador sobre un solver propio de análisis nodal DC, instrumentos (voltaje/corriente/potencia), guardado/comparación de corridas. **Hecho** y verificado en navegador.
- **Fase 2b — Replicar el patrón a un segundo y tercer laboratorio.** **Hecho** (parcial respecto al plan original): se generalizó el núcleo a un registro de adaptadores por disciplina (`apps/api/engines/registry.py`) y se implementaron:
  - **Redes** (`networking-topology`): subnetting IPv4 real (`ipaddress` de Python) + alcanzabilidad por grafo (BFS) + regla de enrutamiento (requiere un router en la ruta entre subredes distintas). Simulador conceptual, no emulación de SO real — ver distinción A/B/C en docs/00-discovery.md §6.1.
  - **Naturaleza/Agricultura** (`agriculture-gdd`): modelo de grados-día de crecimiento (GDD), método agronómico real y citable; **no** usa SoilGrids todavía (quedó fuera de esta iteración) ni modela suelo/agua/plagas. Los umbrales por etapa son parámetros que ingresa el usuario, no datos de especie verificados — ver advertencia explícita en la UI.
  - Verificación manual: circuito DC (ley de Ohm), subred 192.168.1.0/24 con hosts/broadcast correctos y alcanzabilidad L3 vía router, y acumulación GDD (660 GDD en 60 días a 11 GDD/día) — todos coinciden con el cálculo a mano.
- **Fase 3 — Anatomía y biología:** requiere resolver primero la fuente de modelos 3D con licencia clara (candidato: Z-Anatomy/CC BY-SA) antes de escribir una sola línea del visor.
- **Fase 4 — Física y química:** motor propio sobre integrador numérico + ChemCollective/Avogadro como referencia de modelos químicos.
- **Fase 5 — Robótica e ingeniería:** evaluar en vivo Webots vs. MuJoCo antes de comprometerse a uno.
- **Fase 6 — IA, docencia y colaboración.**
- **Fase 7 — Escalabilidad y producción:** Docker, colas, monitorización, CI/CD — se introduce cuando haya más de un servicio real, no antes.

## Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Alcance del encargo original es multi-año/multi-equipo | Alto | Construir un dominio a la vez, de punta a punta, antes de replicar |
| Licencias de motores/assets de terceros (APSIM, Falstad original, BioDigital) | Alto / legal | Registro de procedencia obligatorio (`ModelSources`); nunca vendorizar sin confirmar con el licenciante |
| Ejecutar código de usuario (laboratorios creados por docentes) | Alto / seguridad | Aislamiento por proceso/contenedor desde el contrato de adaptador, no como parche posterior |
| Presentar animación como cálculo validado | Alto / integridad científica | Nivel de fidelidad visible y obligatorio en cada `Run` |
| Sobre-ingeniería temprana (Docker/colas/GPU antes de tener un MVP) | Medio | No introducir infraestructura hasta que la necesidad sea real (regla ya aplicada en Fase 1-2) |

## Criterios de aceptación del MVP de electrónica (Fase 2)

1. Crear un proyecto y una escena vacía.
2. Arrastrar componentes desde el catálogo (fuente DC, resistencias, cables) al protoboard.
3. Conectar los componentes entre sí.
4. Ejecutar el adaptador (`validate → initialize → run`).
5. Ver los resultados de voltaje/corriente en cada nodo, calculados por el solver (no inventados; `ngspice` sigue siendo el candidato de reemplazo del motor, ver docs/01-architecture.md §4).
6. Cambiar un valor de resistencia y volver a ejecutar: el resultado debe cambiar de forma consistente con la ley de Ohm.
7. Guardar el experimento y recuperarlo.

Si estos 7 puntos no funcionan de verdad, la Fase 2 no está terminada, sin importar cuántas pantallas existan.

## Criterios de aceptación de Fase 2b (verificados en navegador esta sesión)

**Redes:** crear topología (PCs, switches, router, enlaces) → ejecutar → ver red/máscara/broadcast/hosts usables calculados por `ipaddress`, y una matriz de alcanzabilidad que distingue conexión física (BFS) de alcanzabilidad L3 (requiere router entre subredes distintas) → guardar y recuperar tras recargar.

**Agricultura:** definir temperatura base y umbrales de GDD por etapa (como parámetros, no datos inventados de especie) → generar una serie de clima diario → ejecutar → ver la acumulación de GDD día a día y el día exacto en que se cruza cada umbral, consistente con el cálculo manual (`(tmax+tmin)/2 - tbase`, acumulado).

**Pendiente explícito de Fase 2b:** no se integró SoilGrids (datos de suelo reales vía API), no hay editor de topología por arrastre (es un formulario + diagrama generado, no un lienzo interactivo), y el modelo agrícola no considera agua, nutrientes ni plagas.
