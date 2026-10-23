# Despliegue en producción

Infraestructura elegida en la propuesta (sección 10): DonWeb Cloud Server 2 vCPU · 2 GB RAM · 100 GB SSD, Ubuntu LTS,
Backup Premium Diario (30 copias), dominio `cooperariosclub.com.ar` y certificado SSL, todo contratado a nombre del club.

## 1. Servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx ufw fail2ban build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

- Acceso SSH solo por clave (`PasswordAuthentication no` en `/etc/ssh/sshd_config`).
- Usuario de sistema sin privilegios para la app: `sudo adduser --system --group cooperarios`.

## 2. Aplicación

```bash
sudo mkdir -p /opt/cooperarios /var/lib/cooperarios/uploads /var/backups/cooperarios
sudo chown -R cooperarios:cooperarios /opt/cooperarios /var/lib/cooperarios /var/backups/cooperarios
# como usuario cooperarios:
git clone <repositorio-privado-del-club> /opt/cooperarios && cd /opt/cooperarios
npm ci && npm run build
cp .env.example .env   # completar: NODE_ENV=production, SESSION_SECRET, QR_SECRET, WEB_ORIGIN=https://cooperariosclub.com.ar,
                       # DB_FILE=/var/lib/cooperarios/cooperarios.db, UPLOADS_DIR, BACKUPS_DIR, MP_*, SMTP_*
pm2 start npm --name cooperarios -- start && pm2 save && pm2 startup
```

En producción la base no se siembra con datos de prueba. La primera carga de socios se hace con la importación desde
Club On-Line (fase 4). Los catálogos base y el primer usuario se crean con el script de alta inicial, que imprime una
contraseña aleatoria para entregar en mano:

```bash
npm run alta-inicial --workspace server -- admin@cooperariosclub.com.ar Nombre Apellido 30111222 admin
npm run alta-inicial --workspace server -- sistemas@cooperariosclub.com.ar Nombre Apellido 30222333 sistemas
```

Después, desde **Sistemas → Parámetros** y **Administración → Tarifario** se cargan los datos reales del club
(teléfono, cuentas de cobro con alias y CBU/CVU, cuotas y aranceles vigentes).

## 3. Nginx (HTTPS y estáticos)

```nginx
server {
  listen 443 ssl http2;
  server_name cooperariosclub.com.ar www.cooperariosclub.com.ar;
  ssl_certificate     /etc/ssl/cooperarios/fullchain.pem;
  ssl_certificate_key /etc/ssl/cooperarios/privkey.pem;
  client_max_body_size 12m;

  root /opt/cooperarios/web/dist;
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
  location / { try_files $uri /index.html; }
}
server { listen 80; server_name cooperariosclub.com.ar www.cooperariosclub.com.ar; return 301 https://$host$request_uri; }
```

Con Nginx delante, en `server/src/app.js` ajustar `trust proxy` si el proxy no está en loopback.

## 4. Backups

- La tarea nocturna (02:30) copia la base con la API de backup de SQLite a `BACKUPS_DIR` y conserva 30 copias.
- Sincronizar `BACKUPS_DIR` y `UPLOADS_DIR` fuera del servidor (rclone a un almacenamiento del club).
- Backup Premium Diario de DonWeb para la imagen completa.
- Prueba de restauración trimestral desde **Sistemas → Backups → Probar restauración**.

## 5. Lectores QR con cerradura

Cada punto de acceso con lector (opción A: lector + controlador con relé) usa:

| Llamada | Uso |
|---|---|
| `POST /api/lector/validar` `{ codigo }` + encabezado `X-Lector-Key` | Responde `{ abrir, mensaje }`; si `abrir` es verdadero, accionar el relé. |
| `POST /api/lector/latido` | Cada 1–5 minutos; el estado se ve en Sistemas → Lectores. |
| `GET /api/lector/habilitados` | Lista diaria de hashes de habilitados para la contingencia sin internet. |

La clave del lector se genera en Administración → Puntos de acceso (se guarda solo su hash).

## 6. Mercado Pago

Configurar `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` y registrar la URL de notificaciones
`https://cooperariosclub.com.ar/api/pagos/webhook/mercadopago`. Las notificaciones se verifican con la firma
`x-signature` y el pago se consulta a la API antes de acreditarlo.

## 7. Correo

Configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` con la cuenta institucional. Se usa para:

- **Alta aprobada:** al aprobar una solicitud de alta se crea el usuario del socio (rol socio, con el email de la
  solicitud) y le llega un enlace para elegir su contraseña, válido 7 días. Nadie conoce ni entrega contraseñas.
  Si el email ya es de otra cuenta, o el socio es menor, la bandeja lo avisa y la cuenta se crea desde Usuarios y roles.
- **Contraseña olvidada:** enlace válido 30 minutos. También sirve si el enlace de alta venció.

Sin SMTP los correos no salen: se escriben en la consola del servidor y, fuera de producción, la bandeja muestra el enlace.
El estado se ve en **Sistemas → Integraciones**.

## 8. Identificadores (UUID)

- Todos los registros usan como id un **UUID v7** en texto (por ejemplo `01a1689d-0906-7236-8e0a-08e068f92e6e`).
  Son ordenables por fecha de creación, así que ordenar por id sigue dando el orden de alta.
- Los genera la base con `DEFAULT (uuid7())`, una función que la aplicación registra al abrir la conexión
  (`server/src/lib/ids.js`). Desde otra herramienta (por ejemplo, el cliente `sqlite3`) hay que pasar el id explícito
  al insertar.
- Las claves de negocio se mantienen numéricas o legibles: número de socio, código de ticket (`MT-2026-0001`)
  y número de comprobante (`R-0001-00000001`).
- Las bases de desarrollo creadas antes de este cambio se detectan al iniciar: corré `npm run db:reset` con el
  servidor detenido.

## 9. Mantenimiento

- `npm audit` y actualización de dependencias mensual, con backup previo.
- Las migraciones nuevas se agregan en `server/src/db/migrations/` con un número correlativo y se aplican al iniciar.
