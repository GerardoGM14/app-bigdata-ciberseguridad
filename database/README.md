# Base de datos de Centinela

Motor: **MongoDB 7/8 en MongoDB Atlas** (NoSQL orientado a documentos). Base: `centinela`.

## ¿Por qué NoSQL?

1. **Volumen y crecimiento**: la colección `eventos` recibe miles de registros por hora desde VPN, firewall, ERP, correo y portal. Con unos 120 usuarios, el volumen estimado es de 40.000 a 80.000 eventos diarios, entre 15 y 30 millones al año. Las colecciones de **series de tiempo** de MongoDB agrupan internamente los eventos por origen y ventana de tiempo, comprimen el almacenamiento (en el benchmark: 154 MB de datos ocupan 16,5 MB en disco) y aceleran las consultas por rango de fechas.
2. **Datos semiestructurados**: cada sistema genera logs con campos distintos. Un esquema flexible permite incorporar nuevos campos sin migraciones.
3. **Escalabilidad horizontal**: Atlas permite pasar de un clúster replicado a uno fragmentado (*sharding*) por `origen.sistema` + `fecha` sin cambiar la aplicación.
4. **Análisis en la base**: el *aggregation framework* (`$facet`, `$dateTrunc`, `$setUnion`) resume cientos de miles de eventos en el servidor de base de datos y al navegador solo llega el resultado.
5. **Retención automática**: los índices TTL eliminan eventos antiguos (365 días) y tokens vencidos sin tareas programadas.

## Colecciones

| Colección | Propósito | Índices principales |
|---|---|---|
| `usuarios` | Cuentas, rol, estado, control de bloqueo | `email` único, `rol` |
| `activos` | Inventario de sistemas y equipos | `codigo` único |
| `incidentes` | Incidentes reportados, con su historial **embebido** | `folio` único, `estado`, `reportadoPor`, compuesto `{estado, severidad, createdAt}` |
| `solicitudes_acceso` | Peticiones de acceso y su revisión | `solicitante`, `estado` |
| `eventos` | Logs de seguridad (**serie de tiempo**: `timeField: fecha`, `metaField: origen`) | `{origen.sistema, fecha}`, `{tipo, fecha}`, `{ip, fecha}`, TTL 365 días |
| `auditoria` | Bitácora de acciones en la plataforma | `fecha`, `accion` |
| `tokens_recuperacion` | Hash de tokens de recuperación de contraseña | `tokenHash` único, TTL en `expiraEn` |

## Decisiones de modelado

- **Referencias** (`ObjectId`) entre usuarios, activos, incidentes y solicitudes: son entidades que se consultan y modifican por separado, y un usuario puede tener muchos incidentes.
- **Documentos embebidos** para el historial de un incidente: siempre se lee junto con el incidente, solo crece algunas decenas de entradas y no tiene sentido fuera de él.
- **Desnormalización controlada** en `eventos`: guarda `usuario` (correo) y `origen.sistema` (código del activo) como texto en lugar de referencias. Así la ingesta masiva no necesita búsquedas previas y los eventos de sistemas o usuarios externos, como los atacantes, se registran igual.
- **Validación en dos niveles**: esquemas de Mongoose en la aplicación (`backend/models`) y validadores `$jsonSchema` opcionales en la base (`database/esquemas`).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run seed -- --reset` | Borra y carga datos de ejemplo: 43 usuarios, 10 activos, 10 incidentes, 14 solicitudes, 60.000 eventos (`EVENTOS=200000` cambia el volumen) |
| `npm run dev:memoria` | Levanta la app con un MongoDB temporal en memoria y datos de ejemplo |
| `npm run generar-muestra` | Regenera los archivos de `muestras/` |
| `node database/scripts/benchmark.js` | Mide la ingesta y los tiempos de la API analítica con 50 mil, 150 mil y 300 mil eventos |
| `mongosh "$MONGODB_URI" database/esquemas/aplicar-validadores.js` | Aplica los validadores `$jsonSchema` en Atlas |

## Archivos de muestra

- `muestras/eventos_muestra.csv`: 5.000 eventos válidos de 3 días, con ataques incluidos.
- `muestras/eventos_con_errores.csv`: 95 filas válidas y 5 inválidas (fecha, tipo, IP, sistema y fecha futura) para probar el rechazo.
- `muestras/eventos_muestra.json`: 200 eventos en formato JSON.
