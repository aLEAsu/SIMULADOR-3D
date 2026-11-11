# Transformación del producto: núcleo primero, laboratorios insignia

## Decisión de producto

No ampliar las siete disciplinas en paralelo. Invertir primero en un núcleo universal confiable y después en tres laboratorios de referencia: **Anatomía** (exploración multicapa), **Redes** (tres niveles de fidelidad) y **Robótica** (construcción y simulación física). Los demás laboratorios siguen disponibles y se mantienen, pero no reciben nuevas capacidades de dominio hasta que el núcleo y estas referencias superen sus criterios de aceptación.

La plataforma debe distinguir con claridad entre visor, modelo matemático y emulación. Una escena atractiva no implica una física más fiel; los resultados, relaciones anatómicas y capacidades de red deben proceder de datos o motores verificables.

## Punto de partida verificado

| Área | Existe hoy | No debe presentarse como existente |
|---|---|---|
| Núcleo | Registro de adaptadores, proyectos, escenas, corridas, persistencia PostgreSQL y colaboración WebSocket. | Autenticación/roles, cuaderno/versionado de experimentos completo, permisos de edición y workers aislados por motor. |
| Anatomía | Un GLB del sistema óseo derivado de Z-Anatomy, con búsqueda, selección, aislamiento y separación visual de estructuras. | Piel, músculo, órganos, vasos, nervios, cortes anatómicos y fichas semánticas completas por estructura. |
| Redes | Editor visual de topología, direccionamiento IPv4, VLAN, reglas de firewall y alcanzabilidad por grafo. | Sistemas operativos de red, terminales reales, protocolos de enrutamiento emulados, captura de paquetes o emulación de dispositivos. |
| Robótica | Brazo planar articulado y cinemática inversa de dos/tres eslabones, verificada con cinemática directa. | Dinámica, gravedad sobre cuerpos articulados, motores, sensores, colisiones y construcción modular de robots. |

## Etapas y puertas de salida

### 0. Estabilidad del entorno

- Mantener las salidas de Next.js para desarrollo y producción separadas para que `next dev` y `next build` no sobrescriban sus bundles.
- Añadir verificaciones automatizadas para compilación, contratos de adaptadores y persistencia antes de ampliar motores.
- Registrar versiones de esquema y procedencia/licencia de cada asset y resultado.

**Aceptación:** desarrollo y compilación de producción pueden ejecutarse concurrentemente; ambos completan sin perder archivos ni requerir borrar artefactos a mano.

### 1. Núcleo universal

- Formalizar el ciclo de experimento: proyecto, escena versionada, parámetros con unidades, validación, corrida inmutable, mediciones, comparación y exportación.
- Estandarizar metadatos de motor: versión, fidelidad, unidades, límites, licencia y referencias de validación.
- Extraer componentes de experiencia compartidos (estado de sesión, instrumentos, historial y trazabilidad) sin mezclar ecuaciones de dominios distintos.
- Definir autenticación y permisos antes de habilitar trabajo multiusuario fuera de un entorno local confiable.
- Introducir workers con límites de recursos cuando se incorpore un motor que los necesite; no desplegar microservicios ni colas sin una carga real que lo justifique.

**Aceptación:** una misma prueba de contrato valida, ejecuta, persiste, recupera y exporta una corrida de cada adaptador sin conocimiento específico del dominio en el núcleo.

### 2. Anatomía multicapa

- Incorporar sistemas anatómicos reales desde una fuente con licencia verificada. Cada importación debe registrar fuente, licencia, escala, unidades, versión y hash del archivo.
- Crear un catálogo por estructura con identificador de origen, nombre preferido, sinónimos, sistema, jerarquía y relaciones anatómicas únicamente cuando esos datos estén disponibles en una fuente trazable.
- Construir controles de capas, transparencia, aislamiento, búsqueda, centrado, selección múltiple y ficha contextual alrededor de los modelos cargados.
- Tratar piel, disección y cortes como capacidades dependientes de geometría segmentada y metadatos compatibles; no simularlas ocultando partes arbitrarias de un único modelo óseo.

**Aceptación:** una estructura seleccionada conserva identidad entre catálogo y escena; su ficha y relaciones provienen de metadatos con procedencia; activar/desactivar una capa solo afecta geometría perteneciente a esa capa; el visor se mantiene usable en escritorio y móvil.

### 3. Redes por niveles explícitos

1. **Visual:** dispositivos, enlaces, interfaces y configuración de la topología.
2. **Matemático:** direccionamiento, tablas y protocolos implementados con modelos deterministas y casos de referencia.
3. **Emulación:** solo tras evaluar un motor como Kathará o ns-3, sus licencias y requisitos operativos, y aislar cada laboratorio de redes del host y de redes externas.

La terminal, el recorrido de paquetes, las tablas y las capturas deben reflejar comportamiento del nivel seleccionado. La emulación no se etiqueta como disponible hasta tener el motor y aislamiento comprobados. El laboratorio se orienta a configuración, diagnóstico y defensa en entornos propios y controlados.

**Aceptación:** cada resultado identifica su nivel de fidelidad; los mismos escenarios tienen expectativas reproducibles; el modo emulado no puede acceder a la red del host ni a destinos externos.

### 4. Robótica física

- Evaluar MuJoCo y Webots con una prueba de concepto que compare licencia, integración, rendimiento, sensores y ejecución local/contenedor antes de elegir.
- Extender el editor desde el brazo planar a ensamblajes con enlaces, articulaciones, actuadores y sensores; incorporar gravedad y colisiones mediante el motor seleccionado.
- Mantener cinemática actual como modo didáctico ligero y hacer explícita la diferencia con el modo dinámico.

**Aceptación:** el movimiento, las colisiones y las lecturas de sensores provienen del motor; una escena guardada puede repetirse con la versión del motor registrada.

### 5. Resto de disciplinas

Conservar los laboratorios actuales como módulos funcionales y corregir regresiones. Priorizar sus nuevas funciones solo después de cumplir las puertas del núcleo y de las referencias. No migrar a una arquitectura de microservicios por anticipado.

## Métricas que se medirán

Establecer una línea base antes de fijar objetivos numéricos: porcentaje de pruebas de contrato superadas, reproducibilidad de corridas, tiempo y memoria de carga por modelo, memoria/GPU durante interacción 3D, tiempo para guardar y recuperar un experimento, fallos de recuperación y sesiones concurrentes probadas. Publicar método, hardware y versión usados junto a cada medición.

## Riesgos y límites

- **Datos anatómicos:** no inventar función, ubicación ni relaciones a partir del nombre de una malla; mantener atribución y compartir derivados bajo las licencias requeridas.
- **Emulación de red:** no ejecutar dispositivos ni código de laboratorio en el proceso principal; aislamiento y límites de recursos son una condición de lanzamiento, no un endurecimiento posterior.
- **Motores de robótica:** no elegir por calidad visual; exigir prueba de integración, repetibilidad y licencia compatible.
- **Fidelidad científica:** mostrar qué calcula cada motor y qué no modela. No animar resultados que no hayan sido calculados.