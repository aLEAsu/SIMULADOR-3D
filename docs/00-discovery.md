# Universal Science Lab — Fase 0: Discovery y Definición Maestra

**Estado del documento:** v1 — primera pasada honesta, pensada para ampliarse. No es un documento legal ni un benchmark certificado; es la base de decisión para arrancar el núcleo y el primer laboratorio.

**Nota de alcance.** El encargo original pide investigar y verificar 100 referentes con enlaces oficiales para cada uno. Eso es un proyecto de investigación en sí mismo (semanas de trabajo dedicado), no algo que se pueda hacer con rigor en una sesión de desarrollo. Lo que sigue es una investigación real de ~30 referentes conocidos y verificables, con los hechos legalmente sensibles (licencias) confirmados por búsqueda; el resto del conocimiento proviene del conocimiento general del modelo y está marcado con nivel de confianza. **No se inventó ningún dato de licencia, puntaje o característica** — donde no hay certeza, se dice explícitamente "sin verificar" en vez de afirmarlo.

---

## 1. Respuestas a las 15 preguntas del encargo

**1. ¿Qué arquitectura es la más apropiada?**
Núcleo universal + adaptadores de motor (ver sección 3 y [01-architecture.md](01-architecture.md)). El núcleo no sabe de física, química ni redes: solo administra usuarios, proyectos, escenas, catálogo de objetos, experimentos, mediciones y resultados. Cada disciplina se conecta mediante un contrato (`validate/initialize/run/pause/step/reset/checkpoint/export_results`) idéntico para todas. Esto es obligatorio dado que redes, electrónica, anatomía y agricultura no comparten ningún modelo matemático común — forzarlos a un "motor universal" produciría o bien un motor inútil para todas, o quince motores disfrazados de uno.

**2. ¿Qué funcionalidades deben compartirse?**
Auth/roles, catálogo de objetos y biblioteca, editor de escena 2D/3D genérico, panel de propiedades dinámico (esquema por tipo de objeto), sistema de mediciones/gráficas, cuaderno de laboratorio, versionado de experimentos, comparación de corridas, colaboración y auditoría. Lo que **no** se comparte: la lógica de cálculo de cada dominio.

**3. ¿Qué motores especializados conviene utilizar (en vez de escribir desde cero)?**
Ver matriz en sección 4. Resumen por dominio:
- Electrónica → **ngspice** (motor de cálculo, BSD-3-Clause, embebible) + geometría propia para el protoboard 2D.
- Redes (nivel conceptual) → motor propio simple de topología/paquetes; **ns-3** u **OMNeT++** solo si en una fase posterior se necesita fidelidad de protocolo real (licencias académicas distintas a uso comercial — revisar antes).
- Física → **myPhysicsLab** (Apache-2.0) como referencia de modelos; motor propio sobre un integrador numérico (RK4) por control total del contrato de datos.
- Robótica → evaluar **Webots** (Apache-2.0, confirmado) o **MuJoCo** (Apache-2.0, confirmado) antes de escribir un motor de cuerpo rígido propio.
- Anatomía → **sin motor de "simulación"**; es un visor 3D jerárquico. Modelos: **Z-Anatomy** (datos derivados de BodyParts3D/Life Sciences DB, CC BY-SA) son el candidato con licencia más clara para reutilización; BioDigital/Complete Anatomy/Visible Body son plataformas cerradas, no fuentes de assets.
- Agricultura → lógica propia basada en ecuaciones publicadas (no se puede "integrar" DSSAT/APSIM como librería ligera: son suites completas en Fortran/.NET con su propio licenciamiento).

**4. ¿Qué partes debemos desarrollar desde cero?**
El núcleo universal completo, el contrato de adaptadores, el editor de escena, el sistema de instrumentación/gráficas, el cuaderno de laboratorio, el tutor de IA con sus herramientas, y los modelos de dominio donde no existe una librería embebible con licencia compatible (agricultura, redes conceptuales, anatomía como UI).

**5. ¿Qué proyectos de código abierto podríamos integrar?**
Confirmados por licencia esta sesión: **ngspice** (BSD-3-Clause/"Modified BSD"), **Webots** (Apache-2.0), **MuJoCo** (Apache-2.0, bindings Python de DeepMind), **myPhysicsLab** (Apache-2.0), **KiCad** (GPL — cuidado, GPL en el propio KiCad no afecta a ngspice porque éste es un proceso/engine separado con licencia permisiva, pero si se vendoriza código GPL sí aplica). **CircuitJS1** (fork JS del simulador de Falstad) está en GPL-2.0 — el *original* de Falstad **no** es open source estándar, tiene una licencia de autor restrictiva para uso no modificado en aula; no integrar el código original sin permiso explícito.

**6. ¿Qué riesgos técnicos existen?**
- Mezclar fidelidad: presentar un modelo conceptual como si fuera cálculo validado (prohibido explícitamente por el encargo).
- Rendimiento: motores de física/robótica en el navegador vs. backend — decidir por dominio, no de forma global.
- Modelos 3D pesados (anatomía) rompiendo el rendimiento en equipos medios si no hay LOD/streaming.
- Ejecutar contenido generado por usuarios (laboratorios creados por docentes) sin sandboxing adecuado.
- Deriva de alcance: el encargo original es, literalmente, un programa de varios años con equipo completo; el riesgo más alto del proyecto es intentar construir todo a la vez.

**7. ¿Qué licencias debemos evitar o revisar especialmente?**
- **APSIM**: no es dominio público ni MIT/Apache. Tiene licencia "No-Commercial R&D" gratuita y una licencia comercial de pago separada, con cláusulas que el licenciante retiene el derecho de sublicenciar a terceros. **Revisar con el APSIM Initiative antes de integrar nada**, incluso en modo educativo.
- **Falstad.com (original)**: licencia de autor, no redistribución/modificación comercial sin permiso.
- **Cisco Packet Tracer**: gratuito solo bajo cuenta de Cisco Networking Academy, no es para redistribuir ni embeber.
- **BioDigital Human / Complete Anatomy / Visible Body**: propietario, modelos no reutilizables fuera de su propia plataforma/API de pago.
- **DSSAT / AquaCrop**: gratuitos para uso educativo/investigación pero no son librerías con licencia de código abierto estándar; "integrarlos" significaría llamarlos como proceso externo bajo sus propios términos, no vendorizar su código.
- Cualquier imagen de sistema operativo de red real (IOS, etc.) usada en GNS3/EVE-NG: requiere licencia propia del fabricante, nunca redistribuible.

**8. ¿Cómo se gestionarán modelos 3D de alta calidad?**
Pipeline de importación → validación (polycount, licencia, escala, unidades) → optimización (Draco/meshopt, LODs) → publicación a almacenamiento de objetos (S3/MinIO), nunca binarios pesados en la base de datos relacional. Metadato de procedencia y licencia obligatorio por asset (campo `ModelSources` del esquema, sección 11 del encargo).

**9. ¿Cómo aseguraremos la precisión científica?**
Sistema de niveles de fidelidad (1–5) visible en cada experimento (sección 9 del encargo), valores de referencia para pruebas de regresión numérica, y la regla dura: ningún resultado se "anima"; todo resultado sale de resolver el modelo (sistema de ecuaciones, integrador, solver) con sus condiciones iniciales reales.

**10. ¿Cómo construiremos un catálogo de objetos extensible?**
Cada objeto es `Component` + `ComponentVersion`, con un esquema de propiedades (`JSON Schema`) propio por disciplina, validado en el adaptador correspondiente. Nuevas disciplinas no requieren cambios en el núcleo, solo un nuevo esquema + adaptador.

**11. ¿Cómo se integrará el tutor de IA?**
Como un consumidor más del núcleo (sección 12 del encargo): lee estado de escena/experimento vía API interna de solo-lectura, puede proponer pero no ejecutar cambios directos sin pasar por las mismas validaciones que usaría un humano, y nunca sustituye un resultado numérico por una respuesta generada.

**12. ¿Cómo se ejecutarán simulaciones complejas en la nube?**
Separación motor de cálculo (worker, cola) vs. motor de render (cliente). Simulaciones ligeras (circuito DC, física 2D) en el propio navegador/WASM cuando sea posible; simulaciones pesadas (robótica, CFD) en workers backend con límites de CPU/tiempo por ejecución.

**13. ¿Cómo se garantizará la seguridad?**
Nunca ejecutar código de usuario en el proceso principal; aislamiento por contenedor/worker con límites de recursos; auth/roles desde el día uno aunque el MVP sea pequeño.

**14. ¿Cómo se controlará el presupuesto?**
Empezar con todo autogestionado en Docker Compose (sin servicios cloud de pago) hasta validar el MVP; evaluar el costo de cómputo GPU (robótica/anatomía) solo cuando esa fase se aborde, no antes.

**15. ¿Cómo se construirá un MVP demostrable y profesional?**
Un solo laboratorio, de punta a punta, con cálculo real verificable — no tres laboratorios a medias. Ver sección 6.

---

## 2. Investigación comparativa (acotada)

| # | Referente | Disciplina | Licencia (confianza) | Función principal | Qué podemos reutilizar |
|---|---|---|---|---|---|
| 1 | Cisco Packet Tracer | Redes | Propietario, gratis solo vía Cisco NetAcad (alta) | Simulación conceptual de topologías Cisco | Nada reutilizable; referencia de UX |
| 2 | GNS3 | Redes | GPL (motor), pero requiere imágenes de SO de terceros con licencia propia (alta) | Emulación de dispositivos reales | Arquitectura de topología; no las imágenes |
| 3 | EVE-NG | Redes | Community gratis / Pro de pago (media) | Emulación multi-vendor | Referencia de arquitectura |
| 4 | Mininet | Redes | BSD (media-alta, no verificado esta sesión) | Emulación SDN ligera con namespaces Linux | Potencial motor de "redes reales" en fases avanzadas |
| 5 | ns-3 | Redes | GPLv2 (media, no verificado esta sesión) | Simulación de eventos discretos de red | Fidelidad de protocolo si se necesita en fases avanzadas |
| 6 | OMNeT++ | Redes | Académico gratis / OMNEST comercial (media) | Simulación de eventos discretos | — |
| 7 | Wokwi | Electrónica/IoT | Propietario, freemium (alta) | Simulación de microcontroladores en el navegador | Referencia de UX; no el motor |
| 8 | Tinkercad Circuits | Electrónica | Propietario, Autodesk (alta) | Circuitos simplificados + bloques Arduino | Referencia de UX para principiantes |
| 9 | Falstad Circuit Simulator (original) | Electrónica | Licencia de autor restrictiva (**verificado esta sesión**) | Simulación visual de circuitos en tiempo real | Inspiración de UX, no el código |
| 10 | CircuitJS1 (fork JS de Falstad) | Electrónica | GPL-2.0 (**verificado esta sesión**) | Mismo que el anterior, portado a JS | Código reutilizable bajo GPL-2.0 (atención a copyleft) |
| 11 | LTspice | Electrónica | Gratis, propietario (alta) | SPICE profesional | Referencia de resultados para validar nuestro solver |
| 12 | KiCad | Electrónica | GPL (alta) | EDA completo (esquemático + PCB) | Referencia de formato; ngspice como motor |
| 13 | ngspice | Electrónica | **BSD-3-Clause / "Modified BSD" (verificado esta sesión)** | Motor de simulación SPICE | **Candidato real para el MVP** |
| 14 | Logisim-evolution | Electrónica digital | GPL (media) | Simulación de lógica digital | Modelo de referencia para un laboratorio digital futuro |
| 15 | PhET Interactive Simulations | Física/Química/Matemática | Licencia propia tipo "uso educativo libre", código parcialmente abierto (media) | Simulaciones HTML5 pedagógicas | Principal referencia de UX pedagógica de toda la plataforma |
| 16 | Algodoo | Física | Propietario (alta) | Sandbox de física 2D | Referencia de UX de "jugar" con física |
| 17 | myPhysicsLab | Física | **Apache-2.0 (confianza alta, no reverificado esta sesión pero es dato público estable)** | Simulaciones físicas con ecuaciones reales | Modelos de referencia para validar nuestro integrador |
| 18 | ChemCollective | Química | Gratis, uso educativo (media) | Laboratorio virtual de química | Referencia pedagógica de instrumentos |
| 19 | Avogadro | Química | GPL/BSD mixto (media) | Editor molecular 3D | Formatos moleculares de referencia |
| 20 | Jmol / JSmol | Química | LGPL (media-alta) | Visor molecular | Candidato de visor embebible a futuro |
| 21 | BioDigital Human | Anatomía | Propietario, freemium + API de pago (alta) | Atlas anatómico 3D | Solo referencia de UX; no assets |
| 22 | Complete Anatomy | Anatomía | Propietario, suscripción (alta) | Atlas anatómico de altísima calidad | Referencia de UX |
| 23 | Visible Body | Anatomía | Propietario, suscripción (alta) | Atlas anatómico | Referencia de UX |
| 24 | Z-Anatomy | Anatomía | Datos CC BY-SA derivados de BodyParts3D (media) | Modelo anatómico en Blender | **Candidato real de assets reutilizables** citando procedencia |
| 25 | DSSAT | Agricultura | Gratis para uso no comercial, no es OSS estándar (media) | Simulación de cultivos | Ecuaciones publicadas como referencia, no el binario |
| 26 | APSIM | Agricultura | **No-Commercial R&D / Comercial de pago, con cláusulas de retención de derechos (verificado esta sesión)** | Simulación de sistemas agrícolas | Solo como referencia científica; **no integrar sin autorización legal explícita** |
| 27 | AquaCrop / AquaCrop-OS | Agricultura | FAO gratis (binario) / AquaCrop-OS open source (media) | Modelo de productividad agua-cultivo | AquaCrop-OS como posible motor futuro |
| 28 | SoilGrids | Agricultura/Geociencias | CC-BY, API abierta (alta) | Datos globales de suelo | **Integrable directamente vía su API** |
| 29 | Gazebo | Robótica | Apache-2.0 (alta) | Simulación física de robots | Candidato real para laboratorio de robótica |
| 30 | Webots | Robótica | **Apache-2.0 (verificado esta sesión, open-source desde dic. 2018)** | Simulación de robots | **Candidato real** |
| 31 | MuJoCo | Robótica | **Apache-2.0 (verificado esta sesión, bindings de DeepMind)** | Motor de física para control/RL | **Candidato real** para física de cuerpo rígido de alta fidelidad |
| 32 | CoppeliaSim | Robótica | Edición educativa gratis / Pro de pago (media) | Simulación de robots | Referencia |
| 33 | OpenFOAM | Ingeniería/CFD | GPL (alta) | CFD | Fase avanzada únicamente, no MVP |
| 34 | QGIS | Geociencias | GPL (alta) | SIG de escritorio | Integrable como referencia de capas geoespaciales |
| 35 | CesiumJS | Geociencias | Apache-2.0 (alta) | Visualización 3D geoespacial | Candidato real para laboratorios de geociencias a futuro |

**Nota metodológica:** la ponderación pedida por el encargo (precisión 18%, interacción 15%, etc.) requiere evaluar cada herramienta de forma práctica (instalarla, probarla, medir). Asignar puntajes de 0-10 sin haber hecho eso sería literalmente inventar datos — algo que las reglas no negociables del propio encargo prohíben. Se deja la tabla de puntuación para una iteración futura en la que se evalúen en vivo los 5-6 candidatos reales por dominio (ngspice, Webots/MuJoCo, myPhysicsLab, Z-Anatomy, AquaCrop-OS, SoilGrids), no las 35 herramientas listadas aquí.

### Hallazgos (versión honesta, no forzada a 20 ítems)

**Mejores características observadas en el mercado:**
1. Cálculo real verificable (ngspice, myPhysicsLab, ns-3) en vez de animación.
2. Edición directa de topología/escena por arrastre (Packet Tracer, Tinkercad).
3. Instrumentación realista (osciloscopio, multímetro) con lectura en vivo (Wokwi, LTspice).
4. Exploración anatómica por capas/sistemas (BioDigital, Complete Anatomy).
5. Niveles de fidelidad física seleccionables (Webots, MuJoCo, Gazebo).
6. Modelos basados en ecuaciones publicadas y citables (DSSAT, APSIM, AquaCrop).
7. API abierta de datos científicos reutilizable (SoilGrids).
8. Edición colaborativa en tiempo real (plataformas LMS modernas tipo Open edX).

**Limitaciones recurrentes:**
1. Fragmentación: cada disciplina vive en una herramienta distinta, sin cuaderno de laboratorio común.
2. Licencias que impiden reutilización de assets (BioDigital, Complete Anatomy, Falstad original).
3. Fidelidad oculta: muchas herramientas educativas no declaran su nivel de validación científica.
4. Motores pesados (CFD, robótica) difíciles de llevar al navegador sin backend dedicado.
5. Modelos agrícolas no pensados para interacción en tiempo real (DSSAT/APSIM corren por lotes).

**Oportunidades de innovación reales para este proyecto:**
1. Cuaderno de laboratorio y sistema de comparación de experimentos **transversal a todas las disciplinas** — ninguno de los referentes lo ofrece así.
2. Contrato único de adaptador de motor que permita añadir disciplinas sin tocar el núcleo.
3. Tutor de IA que lea el estado real de la simulación (no solo texto) y distinga explicación pedagógica de resultado calculado.
4. Trazabilidad de fidelidad y procedencia visible en cada experimento, no oculta en documentación aparte.

---

## 3. Qué sigue

Ver [01-architecture.md](01-architecture.md) para el contrato de adaptadores y el modelo de datos, y [02-roadmap.md](02-roadmap.md) para las fases. El MVP de esta sesión implementa **un solo adaptador real (electrónica, sobre ngspice)** para validar el contrato de punta a punta antes de replicarlo a otras disciplinas.
