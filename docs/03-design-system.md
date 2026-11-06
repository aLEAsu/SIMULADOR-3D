# Universal Science Lab — sistema de diseño (v2, piloto en Electrónica)

> **v2 — consola de instrumento.** La v1 (tokens + piezas con geometría real)
> seguía teniendo la coreografía de un dashboard genérico: título, párrafo,
> card con borde, tabla. v2 reemplaza ese shell por la metáfora de que cada
> laboratorio es un instrumento apagado hasta que armás el experimento y lo
> energizás. Ver sección 6.

Este documento fija las decisiones de diseño para que no se reinventen laboratorio por
laboratorio. Alcance actual: tokens compartidos (todos los labs los heredan vía
`globals.css`) + piezas con geometría real en **Electrónica**, como piloto. Networking,
agriculture y las dos escenas 3D (robótica/física) todavía usan la representación
anterior y se migran en etapas siguientes, una por una, con verificación en navegador
entre cada una (ver `docs/02-roadmap.md`).

## 1. Tokens (`apps/web/app/globals.css`)

Todo color/tamaño/espaciado/transición se referencia por variable CSS, nunca hardcodeado
en un componente:

- **Superficies**: `--surface-0/1/2` (fondo de página / tarjeta / tarjeta anidada) +
  `--field-bg` para inputs y el lienzo. `--bg`/`--panel` quedan como alias de
  `--surface-0/1` por compatibilidad con reglas viejas.
- **Texto**: `--text`, `--text-strong` (títulos), `--muted`.
- **Semánticos**: `--accent`, `--good`, `--bad`, `--warn`.
- **Por laboratorio**: `--lab-accent` (ya existía) + `--lab-accent-soft` (halo/fondo al
  16% de opacidad vía `color-mix`, usado en el punto de título y en hovers).
- **Tipografía**: `--font-ui` (Inter) y `--font-mono` (JetBrains Mono) + escala de
  tamaño/peso/tracking (`--fs-*`, `--fw-*`, `--tracking-*`). Regla: cualquier número que
  venga de un `Run` real (voltaje, corriente, GDD, pH, etc.) se muestra en `.mono` — la
  tipografía marca "esto es instrumental", no decorativo.
- **Espaciado/radios**: `--space-1..8`, `--radius-sm/md/lg/xl`.
- **Movimiento**: `--ease-standard`, `--dur-fast/base/slow` — toda transición/animación
  del proyecto usa estos tokens, no un valor suelto.
- **Tema claro**: bloque `[data-theme="light"]` redefine la misma lista de variables.
  Toggle en `apps/web/app/lib/ThemeToggle.tsx`, persistido en `localStorage("usl-theme")`,
  aplicado antes del primer paint por un script inline en `layout.tsx` (evita el flash).

## 2. Iconografía

- **Interfaz** (rotar, eliminar, exportar, info, sol/luna, éxito/error): `lucide-react`
  (npm). Liviano, tree-shakeable, sin ambigüedad de licencia — nunca emoji.
- **Piezas del lienzo** (resistencia, LED, capacitor, fuente, interruptor, y lo que siga
  en networking/agriculture): SVG propio dibujado a mano dentro del `canvasAdapter` de
  cada laboratorio, no un ícono de librería. Razón: una pieza tiene que *codificar un
  dato real* (las bandas de color de una resistencia según su valor, el halo del LED
  solo si el resultado dice `on: true`), algo que un ícono genérico no puede hacer.

## 3. Contrato "pieza con geometría real" (`InteractiveCanvas.tsx`)

`PieceType` acepta un `renderBody?: (ctx: { piece, selected }) => ReactNode` opcional.
Si está presente, el lienzo lo usa en vez del rectángulo+glifo genérico; si no, cae al
comportamiento anterior — así un laboratorio no migrado sigue funcionando igual hasta que
se lo toque explícitamente.

**Regla no negociable**: un `renderBody` sólo puede leer estado que ya viene de un `Run`
real (`piece.state`, `piece.badge`, o las props guardadas del componente — `value`,
`closed`, etc.). Ningún `renderBody` puede inventar ni interpolar un valor que el backend
no calculó. Ejemplo concreto: el halo del LED en `electronics/canvasAdapter.tsx` sólo se
pinta cuando `piece.state === "good"`, y ese estado lo pone `electronics/page.tsx` a
partir de `r.on` del resultado real — el componente de dibujo no decide por su cuenta
cuándo "se ve prendido".

Ejemplo de pieza real: `resistorColorBands(value)` en `electronics/canvasAdapter.tsx`
deriva las 4 bandas de color con el código real de resistencias (100Ω →
marrón-negro-marrón-dorado, 220Ω → rojo-rojo-marrón-dorado), no con colores decorativos.

## 4. Modelos 3D (robótica/física) — decisión explícita, para cuando se aborden

**Geometría procedural con materiales PBR, no modelos importados.**
`docs/01-architecture.md` ya exige evitar "assets 3D con licencia incierta" como regla de
proyecto; a diferencia del esqueleto de `apps/web/app/anatomy/` (Z-Anatomy, fuente y
licencia confirmadas explícitamente por el usuario), no hay para robótica/física una
fuente de engranajes/servos ya evaluada. Cilindros/conos con `MeshPhysicalMaterial` o
`MeshStandardMaterial` bien parametrizados, sombras reales (`shadow maps`) y un entorno de
luz sintético (`RoomEnvironment` de `three/examples/jsm/environments`, generado en
runtime, sin descargar un HDRI de terceros) alcanzan el nivel visual pedido sin riesgo de
procedencia. Si en el futuro se confirma una fuente de modelos con licencia clara, se
documenta igual que exige `docs/01-architecture.md` antes de vendorizarla — no se asume.

## 5. Micro-interacciones

- `.canvas-piece.is-good` dispara un pulso (`usl-pulse`) cuando una pieza pasa a tener un
  resultado "bueno" en la corrida actual.
- `.error` dispara un shake corto (`usl-shake`) al aparecer un error.
- Ambas respetan `prefers-reduced-motion`.
- Pensadas para reutilizarse en los otros labs sin redefinir nada nuevo.

## 6. Consola de instrumento (shell v2)

**Metáfora**: un laboratorio no es una página con un formulario, es una consola de
instrumento que está apagada hasta que armás el experimento y lo energizás. Tres estados:

- **Armado** (edición): el lienzo es la superficie principal — `.lab-console` reemplaza la
  card con borde de antes por un panel sin caja que compite con el instrumento. La paleta
  de piezas se acopla como un cajón de herramientas colapsable sobre el borde inferior del
  lienzo (`InteractiveCanvas` con `paletteDocked`), no una fila de botones aparte. Cada
  pieza nueva entra con un pequeño rebote al asentarse en la grilla (`usl-piece-in`, se
  dispara solo en el mount real del nodo DOM, no en cada re-render).
- **Energizado**: al ejecutar, un pulso recorre los cables **ya conectados de verdad**
  (`InteractiveCanvas` con `energizing`, clase `.wire-pulse`) durante como mínimo
  `MIN_ENERGIZE_MS` (550ms en electrónica) — ver `electronics/page.tsx`. Es pura
  coreografía de transición: el valor que se muestra después siempre es exactamente el
  que devolvió el backend, nunca uno inventado durante la espera.
- **Resultado**: `RunConsole` (`apps/web/app/lib/RunConsole.tsx`) reemplaza la tabla de
  resultados por una tarjeta de instrumento por componente, con una lectura real en
  `SevenSegmentReadout` (dígitos de 7 segmentos de verdad, no una fuente que los imita —
  `apps/web/app/lib/SevenSegmentReadout.tsx`). El conteo ascendente de un dígito al
  actualizarse es la única animación: es una transición cosmética entre dos valores
  reales (el anterior y el nuevo), igual que una barra de progreso — nunca presenta un
  cuadro intermedio como si fuera una medición. `RunFilmstrip`
  (`apps/web/app/lib/RunFilmstrip.tsx`) reemplaza la tabla de comparación de corridas por
  una tira horizontal de tarjetas.
- El párrafo largo de "qué hace este laboratorio" ya no es permanente: vive en un
  popover que abre el ícono de info (`lucide-react`) al lado del título, para que el
  chrome no compita con la consola.
- **Textura por disciplina**: `InteractiveCanvas` acepta `gridStyle="breadboard"` (rieles
  rojo/azul arriba/abajo) opt-in por laboratorio — electrónica lo usa ya; cada laboratorio
  define su propia textura al migrarse, nunca se hardcodea una sola en el componente
  compartido.

**Deliberadamente no incluido en esta etapa**: `OscilloscopeTrace` (trazo tipo
osciloscopio para series temporales) no se construyó todavía porque electrónica no tiene
series temporales que mostrar — se construye recién cuando se migre física, química o
agricultura (que sí las tienen), para no mantener un componente sin un uso real
(`docs/02-roadmap.md` ya señala la sobre-ingeniería temprana como riesgo del proyecto).

## 7. Materiales reales + energizado con impacto (ajuste sobre v2)

Primer pase de v2 quedó visualmente plano y el energizado apenas se notaba. Ajuste:

- **Materiales**: cada pieza de electrónica tiene su propio degradé (no color plano),
  una sombra proyectada real (`feDropShadow` vía `<filter>`, no `box-shadow` CSS — las
  piezas son SVG) y, en la resistencia, un brillo especular a lo largo del eje del
  cilindro. Los ids de gradiente/filtro están namespaced por `piece.uid`
  (`wire-sheen-${uid}`, `res-shadow-${uid}`, etc.) — nunca un id fijo repetido entre
  piezas del mismo tipo, que sería inválido en SVG.
- **Protoboard**: la grilla de agujeros ahora es real (un `<circle>` con sombreado
  radial por cada perforación, generados desde `width`/`gridSize`, no una textura CSS
  decorativa) y hay una viñeta (`usl-vignette`) para dar profundidad al conjunto.
- **Paleta**: superficies más oscuras/contrastadas (`--surface-0` casi negro) + grano de
  ruido muy sutil en `.lab-console::before` (SVG `feTurbulence` como `background-image`,
  `mix-blend-mode: overlay`) para que la consola lea como un material, no un degradé
  plano.
- **Energizado con impacto**: ya no es solo el pulso en los cables — cada pieza del
  circuito brilla al ritmo del pulso (`.canvas-piece.is-energizing`, clase que pone
  `InteractiveCanvas` mientras `energizing` es true) y un barrido de luz cruza todo el
  lienzo (`<animate>` SVG nativo sobre un gradiente, no CSS, porque la posición depende
  del `width` real del lienzo). Duración mínima subida a 900ms
  (`MIN_ENERGIZE_MS` en `electronics/page.tsx`) para que se note.

## 8. Networking migrado al mismo patrón

Replicó el shell completo de electrónica (punto 6) a redes, sin reinventarlo:

- **Piezas reales** (`networking/canvasAdapter.tsx`): PC (monitor + base), router (caja +
  2 antenas + notches de puertos), switch (caja + tira de 8 puertos), firewall (escudo de
  verdad con forma de polígono/path, con ojo de cerradura, no el emoji ⛨) y AP (puck +
  arcos de señal Wi-Fi — los arcos son un marcador de identidad de "este dispositivo es
  inalámbrico", no una lectura de intensidad de señal: el backend no calcula eso, así que
  no se inventa). Los materiales (gradiente + sombra proyectada) se extrajeron a
  `apps/web/app/lib/pieceMaterials.tsx` porque ya los usan dos labs — electrónica también
  se migró a importarlos de ahí en vez de duplicarlos.
- **Textura propia**: `gridStyle="rack"` en `InteractiveCanvas` — rieles de rack de 19"
  con agujeros de montaje reales en los bordes, no la misma textura de breadboard.
- **Mismo ritual armado→energizado→resultado**, mismo `MIN_ENERGIZE_MS` (900ms).
- **Resultados**: las dos tablas (subred por dispositivo, alcanzabilidad) pasaron a
  `RunConsole`. Subred usa `usable_hosts` como lectura principal (es un número real con
  sentido de instrumento); alcanzabilidad usa `hops` — pero cuando no hay camino
  (`hops: null`), `RunConsole` no muestra "0" (sería un dato inventado): se agregó
  `ReadoutItem.noReading` para ese caso, que pinta un placeholder atenuado en vez de un
  número falso. La tabla de "tipo de enlace" se dejó como tabla porque es un editor de
  configuración, no una lectura de resultado — no todo tiene que volverse instrumento.

## 9. Agriculture migrado — y primer uso real de `OscilloscopeTrace`

- **Parcela con etapa real** (`agriculture/canvasAdapter.tsx`): la geometría de la planta
  (nada / brote con 2 hojas / tallo con flor / tallo con espiga dorada) se deriva de
  `PlotResult.current_stage`, los 4 strings reales que devuelve
  `apps/api/engines/agriculture/solver.py` ("sin germinar", "germinada, en desarrollo
  vegetativo", "floración", "madurez") — no de un umbral recalculado en el frontend. El
  string llega a `renderBody` igual que `props` en electrónica: `agriculture/page.tsx`
  agrega un campo `stage` a cada `Piece` antes de pasarlo a `InteractiveCanvas`.
- **Textura propia**: `gridStyle="field"` — surcos de tierra (paths ondulados), no dots
  ni breadboard ni rack.
- **`OscilloscopeTrace`** (`apps/web/app/lib/OscilloscopeTrace.tsx`) construido ahora,
  como estaba previsto ("se construye recién cuando se migre física, química o
  agricultura"): reemplaza el `GrowthChart.tsx` ad-hoc (eliminado) por un trazo tipo
  osciloscopio reutilizable — grilla fósforo, brillo (`drop-shadow`), animación de
  "dibujado" al cambiar la serie real. Genérico (`points`, `thresholds`), listo para
  física/química sin reescribirlo.
- **Resultados**: la tabla de "día en que se alcanzó cada etapa" y la de comparación de
  parcelas pasaron a `RunConsole`. Verificado con datos reales: 660 GDD en 60 días →
  floración alcanzada en el día 55, madurez **no alcanzada** → se muestra el placeholder
  "— —" de `noReading`, nunca un día inventado.

## 10. Chemistry migrado — el caso sin `InteractiveCanvas`

Química no usa piezas/paleta: ya tenía su propio banco (`TitrationBench.tsx`, bureta +
matraz dibujados a mano, con el color del líquido ya atado al pH real). No se reconstruyó
nada de eso — se le aplicó el mismo tratamiento de shell que al resto:

- `.lab-console` envuelve el banco (antes vivía en una `.panel` genérica).
- **Energizado genérico**: `TitrationBench` ahora acepta una prop `energizing` y aplica
  una clase `.is-energizing` nueva en `globals.css` — el mismo glow que usan las piezas
  de `InteractiveCanvas`, pero sin depender de esa clase base, porque este banco no pasa
  por `InteractiveCanvas`. Cualquier componente hecho a mano puede reusar `.is-energizing`
  directamente.
- **Materiales**: vidrio con degradé + sombra proyectada (mismo `materialDefs` compartido)
  en la bureta y el matraz, en vez de relleno plano.
- `OscilloscopeTrace` ganó dos capacidades genéricas que química necesitaba de verdad
  (no especulativas): `verticalMarkers` (una línea vertical en un x constante — el
  volumen de equivalencia, antes solo había líneas horizontales a y constante) y `yMax`
  (eje fijo 0–14 para pH, en vez de autoescalar). `TitrationChart.tsx` quedó eliminado.
- El punto de equivalencia pasó de un párrafo con `<strong>` a una tarjeta `RunConsole`
  de una sola lectura — consistente con los demás labs aunque sea un solo número.
- Verificado con una corrida real: ácido fuerte 0.1M/50mL vs base fuerte 0.1M → equivalencia
  en 50.00 mL, pH exactamente 7.00 (coincide con la verificación manual de
  `docs/02-roadmap.md`), curva sigmoide real dibujada en el osciloscopio.

## 11. Las dos escenas 3D (robótica, física) — materiales PBR reales

Se ejecutó la decisión ya documentada en la sección 4: geometría procedural +
`MeshPhysicalMaterial` + sombras reales + un entorno de luz sintético, nunca modelos
importados.

- **Entorno compartido** (`apps/web/app/lib/threeEnvironment.ts`): `applyPBREnvironment`
  activa sombras reales (`PCFShadowMap`) y genera un mapa de entorno en tiempo de
  ejecución con `RoomEnvironment` de three.js + `PMREMGenerator` — nunca se descarga un
  HDRI de terceros. `makeKeyLight` arma la luz direccional que proyecta sombra. Lo usan
  `ArmScene3D.tsx` y `PhysicsScene3D.tsx` por igual.
- **Robótica** (`ArmScene3D.tsx`): los eslabones y articulaciones pasaron de
  `MeshStandardMaterial` plano a `MeshPhysicalMaterial` (metalness/clearcoat de brazo
  robótico real), con sombra proyectada sobre un piso circular nuevo que antes no existía
  (antes solo había un `GridHelper`, que no recibe sombras).
- **Física** (`PhysicsScene3D.tsx`): el resorte dejó de ser una `Line` en zigzag — ahora
  es un tubo real enrollado en hélice 3D (`TubeGeometry` sobre una curva helicoidal
  calculada a mano, no una librería de resortes). La barra del péndulo es un cilindro real
  en vez de una `Line`. El plano inclinado es una cuña extruida real (`ExtrudeGeometry`
  de un triángulo) cuya hipotenusa coincide exactamente con la recta real por la que se
  mueve la masa — ya no una placa delgada casi invisible de canto. Se agregó un fondo
  (`backdrop`) que recibe sombra, para que el mecanismo se perciba con profundidad real.
  La traza de trayectoria (`makeTrail`) se dejó deliberadamente como `Line` — es un
  registro de datos (una serie, como en `OscilloscopeTrace`), no un objeto físico, así
  que no debía ganar volumen.
- **Energizado**: mismo contrato que en los labs 2D — un prop `energizing` hace pulsar el
  material (`emissiveIntensity`) de las piezas reales mientras se resuelve, vía el mismo
  loop de animación que ya mueve la cámara (`requestAnimationFrame`), nunca un valor de
  posición/ángulo que el backend no devolvió todavía.
- **Bug real encontrado y corregido durante la migración**: al reescribir
  `PhysicsScene3D.tsx` se omitió por error la creación del `THREE.Group` contenedor
  (`groupRef.current`), por lo que el resorte, la barra y la rampa se construían pero
  nunca se agregaban a la escena — invisibles sin ningún error en consola. Se detectó
  instrumentando el efecto con `console.log` y comparando contra el checkbox real de
  "Resorte" en el DOM (la verificación visual en navegador, no la lectura del código, fue
  lo que lo expuso). Corregido y verificado con las 8 combinaciones de preset reales.

## Pendiente (roadmap, no implementado todavía)

Los 6 labs con motor de cálculo (electrónica, redes, agricultura, química, robótica,
física) ya comparten el mismo sistema: shell de consola, ritual armado→energizado→
resultado, materiales reales (2D con SVG/gradientes, 3D con PBR), y `RunConsole` en vez
de tablas donde el dato es una lectura real. Queda:

1. **Anatomía**: no tiene `Run` (es un visor 3D de un esqueleto, sin adaptador). Evaluar
   si aplica el mismo shell (`.lab-console`) solo por consistencia visual del chrome
   (toggle de tema, `lab-topbar`), sin ritual de energizado — no hay nada que "correr".
2. `EnergyChart`/`TrajectoryPlot` de física y las dos de química ya migradas con
   `OscilloscopeTrace` para una sola serie; `EnergyChart` traza 3 series simultáneas
   (cinética/potencial/total) y `OscilloscopeTrace` hoy solo dibuja una — generalizarlo a
   múltiples series (`points` → `series: {points,color,label}[]`) es la extensión natural
   cuando se vuelva a tocar física, no antes.
3. Onboarding liviano por lab (tooltip/panel la primera vez), export imagen/CSV.
4. Tema claro ya es global (hereda de los tokens); falta el toggle en anatomía (los 6
   labs con motor de cálculo ya lo tienen en su `lab-topbar`).
