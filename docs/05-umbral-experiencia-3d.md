# Umbral — experiencia 3D de laboratorio

## Idea central: lo invisible, hecho visible

Cada laboratorio tiene dos vistas del mismo modelo:

- **El mundo**: la escena 3D que se manipula (equipos de red, celda robótica, cuerpo humano).
- **La lente** (tecla `L`): revela el mecanismo que normalmente no se ve. Todo lo que muestra sale del cálculo, no de una animación decorativa.

Todas las misiones siguen el mismo ciclo didáctico, **Misión → Predice → Experimenta → Revela → Explica**, basado en el método Predecir–Observar–Explicar. El usuario se compromete con una predicción *antes* de ver el resultado; el contraste entre ambos queda en la **Bitácora** (tecla `B`), que se guarda en este navegador y alimenta el porcentaje de acierto que muestra el observatorio.

## Decisiones tomadas (con el usuario, 2026-11-10)

| Decisión | Elección |
|---|---|
| Alcance | Base + 3 laboratorios insignia: Anatomía, Redes y Robótica. Los otros 4 quedan como "archivo clásico". |
| Cálculo | En el navegador (TypeScript), verificado contra los solvers Python. El backend queda opcional (persistencia, colaboración y tutor de los laboratorios clásicos). |
| Audiencia | Universitaria: ecuaciones y cabeceras visibles, retos con rigor. |
| Estética | Instrumento cinematográfico: fondo casi negro, materiales PBR, datos en mono ámbar/cian, bloom solo en lo "vivo". |
| Física de robótica | Rapier (WASM, Apache-2.0). |
| Anatomía | Se añadieron los sistemas muscular, cardiovascular y nervioso de Z-Anatomy. |

## Qué hay en cada laboratorio

### Observatorio (`/`)
Escena 3D con tres pedestales y sus dioramas animados (un holograma humano, una red con paquetes en tránsito y un brazo en movimiento) y monolitos para los laboratorios clásicos. Al elegir uno, la cámara vuela hacia el pedestal y luego navega.

### LAB·01 Anatomía (`/anatomy`)
- 4 sistemas alineados en el mismo espacio de coordenadas de la fuente: 2.923 estructuras, ya excluidas las líneas guía de etiquetas (`.j` / `.i`).
- Capas con visibilidad y opacidad, botón "pelar capa", áreas de origen e inserción muscular sobre el hueso, y plano de corte sagital, coronal o transversal.
- Ficha por estructura: nombre de la fuente, lateralidad (del sufijo `.l`/`.r`), grupo funcional (del material de Z-Anatomy) y dimensiones de la caja envolvente.
- Lente de rayos X (shader fresnel) y búsqueda en inglés de la fuente o en español común.
- Reto **Localiza**: predices el sistema y luego señalas la estructura; el error se mide en cm sobre el modelo. Los 44 nombres traducidos se comprobaron contra los GLB.

### LAB·02 Redes (`/networking`)
- Equipos 3D procedurales (PC, switch, router, firewall, servidor, AP) que se arrastran y se cablean en arco.
- Herramientas: Mover, Cable, Ping y Cortar. Inspector con subred calculada en vivo, VLAN y reglas de firewall.
- Ping: el paquete recorre la ruta BFS calculada, con TTL por router y MAC lógica por tramo, y se detiene en el firewall que lo bloquea.
- Lente: distritos de subred, anillos de VLAN, cables cortados por VLAN y matriz de alcance L3 en la que se puede hacer clic para lanzar un ping.
- Misiones: dominio de difusión, la máscara engaña (/26), cruzar subredes (predecir el TTL), zona de invitados (firewall) y laboratorio libre.

### LAB·03 Robótica (`/robotics`)
- Brazo de 4 grados de libertad: IK cerrada (desacople de la muñeca) y verificación por cinemática directa.
- Rapier: mesa, cubos dinámicos, eslabones cinemáticos que empujan y agarre por restricción.
- Torque estático por gravedad en vivo. El hombro se limita a 45 N·m: si un movimiento lo supera, se detiene (saturación), y si un agarre lo supera, el agarre se rechaza con el valor requerido.
- Lente: envolvente de trabajo de la muñeca, anillo de alcance sobre la mesa, solución "fantasma" con el otro codo y la fórmula de torque.
- Misiones: envolvente de trabajo (predecir qué balizas son alcanzables), pick & place, carga límite (hay que empujar el bloque para acortar el brazo de palanca) y celda libre.

## Verificación

- `node tools/golden/run.ts` (con `python tools/golden/golden.py > tools/golden/expected.json` antes, si cambian los solvers Python): **213/213** comprobaciones entre TypeScript y Python para redes y robótica, más ida y vuelta IK→FK espacial.
- `npx tsc --noEmit` y `next build` sin errores.
- En navegador se probaron: el ciclo completo de la misión 01 de Redes (predicción, ping animado, objetivo, lente, traza y matriz); el observatorio y el vuelo de cámara a Robótica; la carga y el movimiento del brazo hacia el cubo; Anatomía con 4/4 capas, ficha, búsqueda y lente.

## Iteración 2 — auditoría y mejoras

Se auditó cada laboratorio en el navegador. Estos son los hallazgos y lo que se hizo:

| Hallazgo | Arreglo |
|---|---|
| Cerrar la pinza mientras el brazo aún baja hacía que los dedos aplastaran el cubo contra la mesa en vez de tomarlo. | Si la pinza está cerrada y vacía, toma el cubo en cuanto entra entre los dedos (tolerancia ajustada a las puntas). |
| El cubo es pequeño en pantalla y los clics caían en la mesa. Las balizas en el aire no se podían clicar. | Las balizas son clicables y hay accesos directos «Objetos · ir a» para cubos, balizas y zona de entrega. |
| En equipos lentos el brazo iba en cámara lenta: el paso de tiempo tenía un tope de 1/30 s. | El movimiento articular usa tiempo real (tope de 0,25 s). Además hay calidad adaptativa: si caen los FPS, baja la resolución y se apaga el bloom. |
| Un punto brillante suelto en la mesa (reflejo especular). | La mesa de la celda es mate y se quitó la fuente de luz con forma de anillo del entorno. |
| Sin WebGL, o con un fallo de GPU, la pantalla quedaba en blanco. | Detección de WebGL y barrera de errores con un mensaje que explica qué hacer. |
| Los paneles laterales tapaban parte de la red. | Se reencuadró la cámara de Redes. |

Funcionalidades nuevas:

- **Robótica · programa (teach pendant):** graba poses y estado de la pinza, ejecútalas en orden o en bucle, como se programa un robot industrial. Si el motor del hombro se satura, la ejecución se detiene.
- **Redes · encapsulación en vuelo:** una ficha viaja con el paquete y muestra las capas L2 Ethernet (con 802.1Q si hay VLAN), L3 IPv4 e ICMP del tramo actual. Resalta la MAC reescrita y el TTL decrementado en cada router; la IP de extremo a extremo se mantiene.
- **Progreso persistente:** las misiones completadas (y las estructuras localizadas en Anatomía) se guardan en el navegador y se ven en las tarjetas y pedestales del observatorio.
- **Diseño sonoro:** firmas sintetizadas con WebAudio (envío, salto, entrega, fallo, agarre, saturación, misión cumplida), sin archivos de audio y con botón para silenciar.
- **Guía de primer uso:** 3 pasos por laboratorio, solo la primera vez.

Verificado en navegador:

- La misión 02 de Robótica completa: agarre (21,3 N·m), traslado y entrega. Los dos objetivos quedan cumplidos y la fase pasa a «Explica».
- La ejecución de un programa de 2 puntos, que llega exactamente a cada pose grabada.
- La ficha de encapsulación en vuelo y el progreso en el observatorio.
- La traza a través de un router comprobada con Node: TTL de 64 a 63 y MAC reescrita solo en el tramo del router.

`window.__umbralRobot` expone la última telemetría del brazo, en solo lectura, para pruebas y depuración.

## Límites conocidos y pendientes

- La Bitácora vive en `localStorage` (por navegador); no se sincroniza con el backend.
- Los laboratorios insignia no usan todavía la colaboración en tiempo real ni el tutor de IA de los clásicos.
- Rendimiento: Anatomía carga ~24 MB de GLB (Draco) y unas 2.900 mallas. Va fluido en escritorio; en móvil no se midió.
- Siguen en el repositorio archivos del diseño anterior que ya no usa ninguna ruta: `anatomy/AnatomyViewer.tsx`, `robotics/ArmScene3D.tsx`, `robotics/types.ts`, `networking/canvasAdapter.tsx`, `networking/types.ts`.
- `/clasico` conserva el rediseño de inicio que estaba sin commitear al empezar esta fase.
