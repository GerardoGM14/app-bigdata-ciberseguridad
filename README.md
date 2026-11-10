# Centinela

Plataforma web de monitoreo y análisis de eventos de seguridad, con enfoque Big Data, para **Transportes Cordillera SpA** (empresa ficticia de transporte y logística con casa matriz en Santiago y sucursales en Antofagasta y Concepción).

Centinela reúne en un solo lugar los registros de seguridad que hoy están dispersos en la VPN, el firewall, el ERP, el correo y el portal de clientes. Analiza cientos de miles de eventos para detectar ataques de fuerza bruta y *password spraying*. También permite a cualquier colaborador reportar incidentes y pedir accesos, con trazabilidad completa.

> Proyecto de Título · Ingeniería en Informática · Actividad Sumativa Semana 7

---

## Contenido

- [Funcionalidades](#funcionalidades)
- [Tecnologías](#tecnologías)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Ejecutar en local](#ejecutar-en-local)
- [Despliegue (Render + MongoDB Atlas + Brevo)](#despliegue-render--mongodb-atlas--brevo)
- [Usuarios de prueba](#usuarios-de-prueba)
- [Frontend](#frontend)
- [Backend: API REST](#backend-api-rest)
- [Base de datos](#base-de-datos)
- [Seguridad](#seguridad)
- [Pruebas](#pruebas)

---

## Funcionalidades

| Perfil | Funcionalidades |
|---|---|
| **Público** | Inicio de sesión, registro de cuenta, recuperación de contraseña por correo |
| **Colaborador** | Reportar incidentes de seguridad (formulario 1), solicitar acceso a sistemas (formulario 2), seguimiento de sus incidentes y solicitudes, editar perfil y cambiar contraseña |
| **Administrador** | Dashboard analítico con gráficos, detección automática de fuerza bruta y *password spraying*, explorador de eventos con filtros, carga masiva CSV/JSON (formulario 3), gestión de incidentes, aprobación de accesos, inventario de activos, administración de usuarios y roles, bitácora de auditoría |

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3 propio (sin Bootstrap ni plantillas), JavaScript nativo, [Chart.js](https://www.chartjs.org/) (open source) |
| Backend | Node.js 20, Express 4, Mongoose 8 |
| Base de datos | MongoDB Atlas (NoSQL): colección de **series de tiempo** para los eventos |
| Seguridad | bcrypt, JWT en cookie httpOnly, Helmet (CSP), express-rate-limit, express-validator, express-mongo-sanitize |
| Correo | Brevo (API HTTP) o SMTP con Nodemailer |
| Hosting | Render (servicio web) |

## Estructura del repositorio

```
├── backend/                 API REST (Node.js + Express)
│   ├── app.js               Configuración de Express y middlewares de seguridad
│   ├── server.js            Punto de entrada
│   ├── config/              Variables de entorno y conexión a MongoDB
│   ├── middleware/          Autenticación, roles, cabeceras, límites, validación
│   ├── models/              Esquemas de las 7 colecciones
│   ├── routes/              Endpoints de la API
│   └── utils/               Auditoría, correo, escape de texto
├── frontend/                Sitio web (HTML + CSS + JS)
│   ├── css/estilos.css      Hoja de estilos propia y responsive
│   ├── js/                  Lógica de cada página (comun, auth, panel, admin, perfil)
│   └── *.html               Páginas
├── database/
│   ├── README.md            Documentación del modelo de datos
│   ├── esquemas/            Validadores JSON Schema de las colecciones
│   ├── muestras/            Archivos de ejemplo para la carga masiva
│   └── scripts/             Carga inicial, generador de datos, benchmark
├── docs/
│   ├── diagramas/           Arquitectura, DFD, BPMN, árbol, modelo de datos, Gantt, mockups
│   ├── capturas/            Capturas de la interfaz
│   └── evidencias/          Evidencias de ejecución del plan de pruebas
├── tests/pruebas-e2e.js     Ejecución asistida de los casos de prueba
├── render.yaml              Blueprint de despliegue en Render
└── .env.example             Variables de entorno requeridas
```

## Ejecutar en local

Requisitos: Node.js 20 o superior.

```bash
npm install

# Opción A: sin instalar MongoDB (base temporal en memoria, carga 60.000 eventos de ejemplo)
npm run dev:memoria

# Opción B: con MongoDB Atlas o un MongoDB local
cp .env.example .env        # completar MONGODB_URI y JWT_SECRET
npm run seed -- --reset     # crea usuarios, activos, incidentes y eventos de ejemplo
npm start
```

Abrir http://localhost:3000. Sin correo configurado, el enlace de recuperación de contraseña se imprime en la terminal.

## Despliegue (Render + MongoDB Atlas + Brevo)

1. **MongoDB Atlas**: crear un clúster gratuito M0, un usuario de base de datos y, en *Network Access*, permitir `0.0.0.0/0` (Render no tiene IP fija en el plan gratuito). Copiar la cadena de conexión.
2. **Brevo** (correo): crear una cuenta, verificar el correo remitente en *Senders* y generar una clave API en *SMTP & API*.
3. **Render**: *New → Blueprint*, seleccionar este repositorio (usa `render.yaml`). Completar `MONGODB_URI`, `APP_URL` (la URL `https://...onrender.com` asignada), `BREVO_API_KEY` y `MAIL_FROM_EMAIL`.
4. Cargar datos iniciales una sola vez desde el equipo local, apuntando a Atlas:
   ```bash
   MONGODB_URI="mongodb+srv://..." npm run seed -- --reset
   ```
5. Ingresar con el administrador de prueba y **cambiar su contraseña**.

> Se usa la API HTTP de Brevo (puerto 443) en lugar de SMTP porque los planes gratuitos de algunos hostings, entre ellos Render, restringen los puertos SMTP salientes. Si el hosting lo permite, también funciona con SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`).

## Usuarios de prueba

| Perfil | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@cordillera.demo` | `Admin#Centinela2026` |
| Colaborador | `colaborador@cordillera.demo` | `Colab#Centinela2026` |

Para probar la recuperación de contraseña, crea una cuenta con un correo real desde "Crear cuenta".

## Frontend

- Sitio de varias páginas servido por Express desde `frontend/`. No usa frameworks: el CSS (`frontend/css/estilos.css`) está organizado en variables, base, layout, componentes, vistas y *media queries* (900 px y 560 px). En pantallas pequeñas el menú lateral pasa a ser un panel desplegable y las tablas se muestran como tarjetas.
- Los datos del servidor se insertan siempre con `textContent` (función `el()` en `js/comun.js`), nunca con `innerHTML`, para evitar XSS.
- Navegación por `#hash` dentro de cada panel, validación de formularios en el navegador (la validación definitiva ocurre en el servidor), medidor de fortaleza de contraseña, carga de archivos con arrastrar y soltar y barra de progreso, y gráficos interactivos con Chart.js.

## Backend: API REST

Todas las respuestas son JSON. La sesión viaja en la cookie `centinela_sesion` (httpOnly, SameSite=Strict, Secure en producción).

| Método | Ruta | Perfil | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | público | Crear cuenta (siempre como colaborador) |
| POST | `/api/auth/login` | público | Iniciar sesión |
| POST | `/api/auth/logout` | autenticado | Cerrar sesión |
| GET | `/api/auth/me` | autenticado | Usuario actual |
| POST | `/api/auth/recuperar` | público | Enviar enlace de recuperación |
| POST | `/api/auth/restablecer` | público | Definir nueva contraseña con el token |
| GET / PUT | `/api/perfil` | autenticado | Ver / editar datos propios |
| PUT | `/api/perfil/password` | autenticado | Cambiar contraseña |
| POST | `/api/incidentes` | autenticado | Reportar incidente |
| GET | `/api/incidentes/mios` | autenticado | Incidentes propios |
| GET | `/api/incidentes` | admin | Listar con filtros y paginación |
| GET | `/api/incidentes/:id` | dueño o admin | Detalle |
| PATCH | `/api/incidentes/:id` | admin | Cambiar estado, severidad, responsable, comentar |
| POST | `/api/solicitudes` | autenticado | Solicitar acceso |
| GET | `/api/solicitudes/mias` | autenticado | Solicitudes propias |
| GET | `/api/solicitudes` | admin | Listar por estado |
| PATCH | `/api/solicitudes/:id` | admin | Aprobar o rechazar |
| GET | `/api/activos/opciones` | autenticado | Activos para formularios |
| GET / POST | `/api/activos` | admin | Listar / crear |
| PUT / DELETE | `/api/activos/:id` | admin | Editar / deshabilitar |
| GET | `/api/eventos` | admin | Explorar eventos con filtros |
| POST | `/api/eventos/carga` | admin | Carga masiva (multipart, campo `archivo`) |
| POST | `/api/eventos/ingesta` | clave API | Ingesta automática (cabecera `X-API-Key`, hasta 5.000 eventos) |
| GET | `/api/analitica/resumen?dias=1\|7\|30` | admin | Indicadores y series para el dashboard |
| GET | `/api/analitica/alertas?horas=N` | admin | Detección de fuerza bruta y *password spraying* |
| GET | `/api/usuarios` | admin | Listar usuarios |
| PATCH | `/api/usuarios/:id` | admin | Cambiar rol, activar/desactivar, desbloquear |
| GET | `/api/auditoria` | admin | Bitácora |
| GET | `/api/salud` | público | Estado del servicio |

Ejemplo de ingesta desde otro sistema:

```bash
curl -X POST https://TU-APP.onrender.com/api/eventos/ingesta \
  -H "Content-Type: application/json" -H "X-API-Key: $INGESTA_API_KEY" \
  -d '[{"fecha":"2026-11-10T03:12:00Z","sistema":"VPN","tipo":"login_fallido","severidad":"alta","ip":"45.155.205.233","usuario":"gerencia@cordillera.demo","pais":"RU"}]'
```

## Base de datos

MongoDB Atlas con 7 colecciones. El detalle de cada una (campos, índices y justificación) está en [database/README.md](database/README.md) y el diagrama en [docs/diagramas/modelo-datos.png](docs/diagramas/modelo-datos.png).

## Seguridad

| Amenaza (OWASP Top 10) | Medida implementada |
|---|---|
| Robo de contraseñas | bcrypt costo 12; política de 10+ caracteres con mayúscula, minúscula, número y símbolo |
| Fuerza bruta | Bloqueo de cuenta 15 min tras 5 fallos; límite de 20 intentos por IP cada 15 min |
| Inyección NoSQL | `express-mongo-sanitize`, validación de tipos con `express-validator`, `strictQuery`, escape de expresiones regulares |
| XSS | Content-Security-Policy `'self'`, salida con `textContent`, cookies httpOnly |
| CSRF | Cookie SameSite=Strict y verificación de la cabecera `Origin` |
| Control de acceso roto | Middleware de roles en cada ruta, control a nivel de objeto, nadie aprueba su propia solicitud, el registro siempre crea colaboradores |
| Enumeración de usuarios | Mensajes genéricos en login y recuperación, tiempo de respuesta constante |
| Sesiones robadas | JWT con expiración de 2 h; cambiar la contraseña o el rol invalida las sesiones anteriores |
| Recuperación insegura | Token aleatorio de 256 bits, se guarda solo su hash SHA-256, válido 30 min y de un solo uso |
| Trazabilidad | Bitácora de auditoría de todas las acciones sensibles |

## Pruebas

```bash
# con la app corriendo en otra terminal (npm run dev:memoria > servidor.log)
LOG_SERVIDOR=servidor.log MONGO_URI="<uri que imprime dev:memoria>" node tests/pruebas-e2e.js
```

Ejecuta los 17 casos del plan de pruebas en un navegador real y guarda las evidencias en `docs/evidencias/`. Resultado de la última ejecución: **17/17 aprobados**.

Rendimiento (`node database/scripts/benchmark.js`, mediana de 5 ejecuciones):

| Eventos | Ingesta (eventos/s) | Resumen 7 días | Resumen 30 días | Alertas | Filtro por IP |
|---|---|---|---|---|---|
| 50.000 | 12.414 | 188 ms | 766 ms | 32 ms | 61 ms |
| 150.000 | 12.495 | 564 ms | 1.525 ms | 46 ms | 86 ms |
| 300.000 | 17.370 | 674 ms | 2.883 ms | 93 ms | 107 ms |
