import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { sesion, verificarOrigen } from './lib/auth.js';
import { HttpError } from './lib/util.js';
import auth from './routes/auth.js';
import publico from './routes/publico.js';
import socio from './routes/socio.js';
import padron from './routes/padron.js';
import actividades from './routes/actividades.js';
import acceso from './routes/acceso.js';
import profesor from './routes/profesor.js';
import espacios from './routes/espacios.js';
import cobranzas from './routes/cobranzas.js';
import finanzas from './routes/finanzas.js';
import mantenimiento from './routes/mantenimiento.js';
import medico from './routes/medico.js';
import gobierno from './routes/gobierno.js';
import sistema from './routes/sistema.js';
import archivos from './routes/archivos.js';

export function crearApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'"],
        frameSrc: ['https://www.google.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({ origin: config.origenWeb, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(verificarOrigen);
  app.use(sesion);

  app.use('/api/auth', auth);
  app.use('/api/publico', publico);
  app.use('/api/socio', socio);
  app.use('/api/padron', padron);
  app.use('/api/actividades', actividades);
  app.use('/api', acceso); // /api/acceso/* y /api/lector/*
  app.use('/api/profesor', profesor);
  app.use('/api/espacios', espacios);
  app.use('/api', cobranzas); // /api/cobranzas/* y /api/pagos/webhook/*
  app.use('/api/finanzas', finanzas);
  app.use('/api', mantenimiento); // /api/tickets, /api/sectores, /api/inventario, /api/compras
  app.use('/api/medico', medico);
  app.use('/api', gobierno); // /api/comunicados, /api/documentos, /api/actas, /api/pedidos-cambio, /api/aprobaciones, /api/tablero, /api/notificaciones
  app.use('/api/sistema', sistema);
  app.use('/api/archivos', archivos);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta inexistente')));

  // En producción, Nginx sirve los estáticos; esto permite probar el build completo con Node.
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status ?? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(`[${req.method} ${req.path}]`, err);
    let mensaje = status >= 500 ? 'Ocurrió un error inesperado. Intentá de nuevo.' : err.message;
    // Errores de reglas de la base (triggers) como mensajes de negocio.
    if (err.code === 'SQLITE_CONSTRAINT_TRIGGER') return res.status(409).json({ error: err.message });
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
    if (err.code === 'LIMIT_FILE_SIZE') mensaje = 'El archivo supera el tamaño permitido';
    res.status(status).json({ error: mensaje, detalle: err.detalle });
  });
  return app;
}
