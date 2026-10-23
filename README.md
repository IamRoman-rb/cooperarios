# Plataforma digital — Club Los Cooperarios

Plataforma web integral del Club Social y Deportivo Los Cooperarios (Quilmes Oeste): socios, actividades,
vacantes e inscripciones, cobranzas y pagos, contabilidad, revisión médica, fichaje por QR con cerradura,
tickets de mantenimiento con fotos y gobierno institucional, con una vista por rol.

Implementa la **Propuesta técnica v1.0** ([docs/propuesta-v1.0.pdf](docs/propuesta-v1.0.pdf)) con el sistema de
diseño de Stitch ([docs/diseno](docs/diseno)).

| | |
|---|---|
| Roles | 10 + visitante público |
| Vistas | 100 (público 7 · socio 13 · profesor 8 · administración 19 · contabilidad 14 · directiva 11 · subcomisión 5 · mantenimiento 8 · médico 5 · auxiliar 3 · sistemas 7) |
| Base de datos | SQLite (WAL), 78 tablas en 9 grupos, migraciones SQL versionadas |
| Frontend | React 18 + Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind con los tokens de Stitch, PWA instalable |
| Backend | Node.js + Express 5, better-sqlite3, Zod, node-cron |

## Puesta en marcha

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run db:reset
npm run dev
```

- Web: http://localhost:5173 · API: http://localhost:3000
- `db:reset` recrea la base con **datos de prueba** (no hay datos reales en desarrollo). Detené el servidor antes:
  en Windows la base queda bloqueada mientras la API está corriendo. Si la base está vacía, la API la siembra sola al
  iniciar en desarrollo.
- Usuarios de prueba, todos con la contraseña `Cooperarios2026`:
  `socio`, `profesor`, `admin`, `contabilidad`, `directiva`, `subcomision`, `mantenimiento`, `porteria`, `medico`,
  `auxiliar`, `sistemas` — con el dominio `@demo.coop` (p. ej. `socio@demo.coop`). La pantalla de ingreso los
  ofrece en modo desarrollo.
- Sin `MP_ACCESS_TOKEN`, Mercado Pago funciona en **modo simulado** (checkout de prueba dentro de la plataforma).
- Lector QR de prueba: clave `lector-demo-natatorio` (punto «Ingreso natatorio»).

```bash
npm test           # 131 pruebas de API, permisos y reglas de negocio (Vitest + supertest)
npm run build      # build de producción de la web (web/dist)
npm start          # API que además sirve web/dist
```

## Estructura

```
server/
  src/db/migrations/   esquema SQL (78 tablas, triggers de inmutabilidad)
  src/db/seed.js       datos de demostración
  src/lib/             rbac (matriz 4.1), auth (sesiones, TOTP), auditoría
  src/services/        habilitación, QR, precios, cuenta corriente, Mercado Pago, tickets, revisión médica, tareas
  src/routes/          API por dominio
  test/                pruebas
web/
  src/rutas.js         las 100 vistas por rol
  src/pages/<rol>/     vistas de cada portal; src/pages/compartidas/ las que usan varios roles
  src/components/      kit de UI (Stitch), gráficos, escáner QR, layouts
docs/                  propuesta, diseño de Stitch y guía de despliegue
```

## Reglas de negocio implementadas

- **Permisos** (4.1): matriz por módulo con acciones P/L/Lx/G/Gx/A/S, ámbito por actividad para delegados,
  mínimo privilegio (profesor y portería ven solo verde/rojo y un motivo genérico; Sistemas sin datos personales
  ni financieros) y separación de funciones (quien registra un gasto o carga una factura no la aprueba; sobre el
  umbral aprueba la Comisión Directiva).
- **Actividades** (6.1): vacantes en tiempo real, lista de espera con aviso, precio por condición × frecuencia ×
  descuento (no acumulables) con total antes de confirmar, inscripción «pendiente de apto», cargos con
  vencimiento por actividad y bajas al fin del período.
- **Revisión médica** (6.2): requisitos por actividad (bloqueante y días de gracia), turnos, certificados externos
  validados por el médico, consentimiento del tutor en menores, resultados firmados e inmutables (las
  correcciones generan una revisión nueva), avisos a 30/15/7 días, solo constancia de aptitud.
- **Fichaje por QR** (6.3): credencial con JWT de 60 s, identificador opaco y anti-repetición; motor de
  habilitación en el orden de la propuesta; asistencia automática; API para lectores con relé (`/api/lector/*`)
  con clave propia, latido y lista para contingencia offline; apertura manual con registro; validación por DNI.
- **Tickets** (6.4): asignación automática por sector, plazos por prioridad, foto obligatoria del trabajo
  terminado, verificación y reapertura, historial e indicadores; fotos reducidas y sin metadatos en el navegador.
- **Contabilidad y Directiva** (6.5): empleados y remuneraciones (pagadas inmutables, ajustes), ingresos por origen
  y medio (incluido efectivo con recibo), gastos con comprobante que se anulan con motivo, caja y arqueo,
  proveedores y facturas, presupuesto contra ejecutado, honorarios, reportes y exportación CSV, cierre mensual.
- **Cuenta corriente** (6.6): importes en centavos, cargos no editables (nota de crédito), imputaciones con pagos
  parciales, recibos numerados, transferencias informadas con aprobación, Mercado Pago con notificación firmada.
- **Datos personales** (9): consentimientos versionados, descarga de datos propios, solicitudes de acceso,
  rectificación y supresión con plazos legales, anonimización, retención automática (accesos y auditoría 12 meses),
  auditoría de cambios sensibles con valores anterior y posterior.
- **Seguridad**: contraseñas bcrypt, sesión en cookie httpOnly con expiración por inactividad, bloqueo por intentos,
  verificación en dos pasos (TOTP), helmet + CSP, CORS acotado, protección CSRF por origen y encabezado, límites
  de intentos, validación con Zod en el servidor, archivos con acceso por rol.

## Pendiente de relevar (fase 0)

Ver la sección 13 de la propuesta: marca y modelo de la cerradura, exportación de Club On-Line, proceso actual de
revisión médica, cuentas de cobro (alias/CBU/CVU y Mercado Pago), día de vencimiento y política de corte, y entidad
titular de las bases. Los valores marcados como «dato de prueba» en la semilla deben reemplazarse.

Fase 5 (fuera del alcance inicial): facturación electrónica ARCA, débito automático, WhatsApp, conciliación
bancaria automática y espectáculos.

## Despliegue

Ver [docs/despliegue.md](docs/despliegue.md) (DonWeb Cloud Server, Nginx, PM2, backups).
