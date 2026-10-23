// Recorre las vistas de cada rol: todas deben responder 200 para su rol y 403 para otros.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { entorno, como } from './helpers.js';

let app;
let conIds;
beforeAll(() => {
  const e = entorno();
  app = e.app;
  // Los ids son UUID generados al sembrar: las URLs usan marcadores que se completan acá.
  const ticket = e.db.prepare('SELECT id FROM tickets_mantenimiento ORDER BY id LIMIT 1').pluck().get();
  conIds = (url) => url.replace(':actividad', e.ids.act.natatorio).replace(':persona', e.ids.pLucia).replace(':ticket', ticket);
});

const VISTAS = {
  publico: ['/api/publico/inicio', '/api/publico/actividades', '/api/publico/actividades/:actividad', '/api/publico/cuota-social', '/api/publico/contacto', '/api/publico/documentos'],
  socio: ['/api/mi/inicio', '/api/mi/perfil', '/api/mi/credencial', '/api/mi/actividades', '/api/mi/explorar', '/api/mi/reservas', '/api/mi/cuenta',
    '/api/mi/pagos', '/api/mi/revision-medica', '/api/mi/invitados', '/api/mi/novedades', '/api/mi/solicitudes', '/api/mi/privacidad', '/api/notificaciones', '/api/sectores'],
  profesor: ['/api/clases/inicio', '/api/clases/grupos', '/api/clases/calendario', '/api/clases/comunicaciones', '/api/clases/liquidacion', '/api/tickets?mios=reportados',
    '/api/acceso/historial'],
  admin: ['/api/tablero', '/api/padron/socios', '/api/padron/socios/:persona', '/api/padron/solicitudes', '/api/actividades', '/api/actividades/aux/opciones', '/api/sectores', '/api/tickets',
    '/api/actividades/inscripciones/lista', '/api/espacios', '/api/espacios/calendario', '/api/cobranzas/resumen', '/api/cobranzas/morosidad', '/api/cobranzas/transferencias',
    '/api/actividades/tarifario/todo', '/api/medico/pendientes', '/api/acceso/reglas', '/api/acceso/historial', '/api/acceso/puntos', '/api/comunicados', '/api/privacidad',
    '/api/documentos', '/api/sistema/usuarios', '/api/finanzas/empleados'],
  contabilidad: ['/api/finanzas/resumen', '/api/cobranzas/cuentas-a-cobrar', '/api/cobranzas/comprobantes', '/api/finanzas/ingresos', '/api/finanzas/gastos', '/api/finanzas/empleados',
    '/api/finanzas/proveedores', '/api/finanzas/facturas', '/api/finanzas/caja', '/api/cobranzas/pagos-online', '/api/finanzas/honorarios', '/api/finanzas/presupuesto',
    '/api/finanzas/reportes', '/api/finanzas/cierres', '/api/finanzas/exportar/gastos'],
  directiva: ['/api/tablero', '/api/aprobaciones', '/api/finanzas/ingresos', '/api/finanzas/gastos', '/api/finanzas/empleados', '/api/pedidos-cambio', '/api/finanzas/resumen',
    '/api/finanzas/presupuesto', '/api/actas', '/api/subcomisiones', '/api/padron/socios', '/api/sistema/logs'],
  subcomision: ['/api/tablero', '/api/espacios/calendario', '/api/compras', '/api/comunicados', '/api/pedidos-cambio', '/api/cobranzas/morosidad'],
  mantenimiento: ['/api/tickets?mios=asignados', '/api/tickets', '/api/tickets/:ticket', '/api/espacios/calendario', '/api/inventario', '/api/acceso/puntos', '/api/acceso/invitados', '/api/compras'],
  medico: ['/api/medico/agenda', '/api/medico/pendientes', '/api/medico/certificados', '/api/medico/historial/:persona', '/api/medico/personas/:persona', '/api/medico/buscar?q=Fer'],
  auxiliar: ['/api/medico/agenda', '/api/medico/certificados', '/api/medico/recordatorios'],
  sistemas: ['/api/sistema/salud', '/api/sistema/lectores', '/api/sistema/integraciones', '/api/sistema/parametros', '/api/sistema/backups', '/api/sistema/logs', '/api/sistema/roles'],
};

describe('vistas públicas', () => {
  for (const url of VISTAS.publico) {
    it(`GET ${url}`, async () => {
      const res = await request(app).get(conIds(url));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });
  }
});

for (const [rol, urls] of Object.entries(VISTAS)) {
  if (rol === 'publico') continue;
  describe(`rol ${rol}`, () => {
    let c;
    beforeAll(async () => { c = await como(app, rol); });
    for (const url of urls) {
      it(`GET ${url}`, async () => {
        const res = await c.get(conIds(url));
        expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
      });
    }
  });
}

describe('mínimo privilegio', () => {
  it('el socio no accede al padrón ni a finanzas', async () => {
    const c = await como(app, 'socio');
    expect((await c.get('/api/padron/socios')).status).toBe(403);
    expect((await c.get('/api/finanzas/gastos')).status).toBe(403);
    expect((await c.get('/api/sistema/salud')).status).toBe(403);
  });
  it('sistemas no accede a datos personales ni financieros', async () => {
    const c = await como(app, 'sistemas');
    expect((await c.get('/api/padron/socios')).status).toBe(403);
    expect((await c.get('/api/finanzas/empleados')).status).toBe(403);
    expect((await c.get('/api/cobranzas/morosidad')).status).toBe(403);
    const logs = await c.get('/api/sistema/logs');
    expect(logs.body.filas.every((f) => f.antes === null && f.despues === null)).toBe(true);
  });
  it('administración ve el legajo sin importes', async () => {
    const c = await como(app, 'admin');
    const res = await c.get('/api/finanzas/empleados');
    expect(res.body.empleados[0].remuneracion_base).toBeUndefined();
    expect(res.body.total_nomina).toBeUndefined();
  });
  it('el profesor ve habilitación de alumnos sin montos', async () => {
    const c = await como(app, 'profesor');
    const res = await c.get('/api/clases/grupos');
    const alumno = res.body[0].alumnos[0];
    expect(alumno).toHaveProperty('habilitado');
    expect(JSON.stringify(alumno)).not.toMatch(/importe|deuda|saldo/);
  });
  it('rechaza peticiones sin el encabezado anti-CSRF', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'socio@demo.coop', password: 'x' });
    expect(res.status).toBe(403);
  });
});
