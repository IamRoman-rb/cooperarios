// Reglas de negocio clave (propuesta, sección 6).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { entorno, como } from './helpers.js';
import { emitirQr, consumirQr } from '../src/services/qr.js';
import { evaluar } from '../src/services/habilitacion.js';
import { cotizar } from '../src/services/precios.js';
import { local } from '../src/lib/util.js';

let app, db, ids;
beforeEach(() => { ({ app, db, ids } = entorno()); });

describe('credencial QR', () => {
  it('un código se usa una sola vez (anti-repetición)', () => {
    const { token } = emitirQr(ids.pLucia);
    expect(consumirQr(token)).toBe(ids.pLucia);
    expect(consumirQr(token)).toBeNull();
  });
  it('rechaza códigos alterados', () => {
    const { token } = emitirQr(ids.pLucia);
    expect(consumirQr(token.slice(0, -2) + 'xx')).toBeNull();
  });
});

describe('tarifario', () => {
  it('natatorio: socio vs no socio según frecuencia (valores de la propuesta)', () => {
    const socio = cotizar({ personaId: null, actividadId: ids.act.natatorio, frecuencia: 1 });
    expect(socio.base).toBe(8750000); // sin persona = no socio
    const lucia = cotizar({ personaId: ids.pLucia, actividadId: ids.act.natatorio, frecuencia: 5 });
    expect(lucia.condicion).toBe('socio');
    expect(lucia.base).toBe(5700000);
    // Grupo familiar de 4 integrantes: descuento familiar del 10 %
    expect(lucia.total).toBe(5130000);
  });
});

describe('motor de habilitación', () => {
  it('niega sin inscripción en ese horario y explica el motivo', () => {
    const r = evaluar({ personaId: ids.pLucia, actividadId: ids.act.futbol });
    expect(r.habilitado).toBe(false);
    expect(r.motivo).toBe('sin_inscripcion');
    expect(r.mensaje_operador).not.toMatch(/\$/);
  });
  it('niega por apto médico pendiente en actividad que lo exige', () => {
    // Con los pagos al día, la regla que falla es la del apto.
    db.prepare(`UPDATE cargos SET estado = 'pagado' WHERE persona_id = ?`).run(ids.pEmma);
    const r = evaluar({ personaId: ids.pEmma, actividadId: ids.act.natatorio, exigirHorario: false });
    expect(r.habilitado).toBe(false);
    expect(r.motivo).toBe('apto_medico');
  });
  it('niega por cuota social vencida más allá de la gracia', () => {
    const hace40 = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO cargos (persona_id, concepto_id, descripcion, periodo, importe, vencimiento) VALUES (?, (SELECT id FROM conceptos WHERE tipo = 'cuota_social'), 'Cuota vieja', ?, 100, ?)`)
      .run(ids.pLucia, hace40.slice(0, 7), hace40);
    const r = evaluar({ personaId: ids.pLucia, actividadId: ids.act.natatorio, exigirHorario: false });
    expect(r.motivo).toBe('cuota_social');
    expect(r.mensaje_socio).toMatch(/Mis pagos/);
  });
  it('una excepción aprobada habilita pese al apto pendiente', () => {
    const hoy = local().fecha;
    db.prepare(`INSERT INTO habilitaciones_manuales (persona_id, actividad_id, tipo, motivo, desde, hasta, estado) VALUES (?, ?, 'excepcion', 'Prueba', ?, ?, 'aprobada')`)
      .run(ids.pEmma, ids.act.natatorio, hoy, hoy);
    expect(evaluar({ personaId: ids.pEmma, actividadId: ids.act.natatorio, exigirHorario: false }).habilitado).toBe(true);
  });
});

describe('lector QR con cerradura', () => {
  it('exige la clave del lector y responde abrir / no abrir', async () => {
    expect((await request(app).post('/api/lector/validar').send({ codigo: 'x'.repeat(20) })).status).toBe(401);
    const { token } = emitirQr(ids.pEmma);
    const res = await request(app).post('/api/lector/validar').set('x-lector-key', 'lector-demo-natatorio').send({ codigo: token });
    expect(res.status).toBe(200);
    expect(res.body.abrir).toBe(false);
    const reuso = await request(app).post('/api/lector/validar').set('x-lector-key', 'lector-demo-natatorio').send({ codigo: token });
    expect(reuso.body.mensaje).toMatch(/inválido/);
  });
});

describe('inscripción y pagos', () => {
  it('inscribe con cargo y deja "pendiente de apto" si la actividad lo exige', async () => {
    const c = await como(app, 'socio');
    const res = await c.post('/api/socio/inscribirme').send({ grupo_id: ids.grupos.basquet_fem, frecuencia: 2, persona_id: ids.pLucia });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.estado).toBe('pendiente_apto');
    expect(db.prepare(`SELECT COUNT(*) FROM cargos WHERE origen_tipo = 'inscripcion' AND origen_id = ?`).pluck().get(res.body.id)).toBe(1);
  });
  it('sin vacantes ofrece lista de espera', async () => {
    const c = await como(app, 'socio');
    const g = ids.grupos.tenis_menores;
    db.prepare(`INSERT INTO inscripciones (persona_id, grupo_id, frecuencia_semanal, desde) VALUES (?, ?, 1, '2026-03-01')`).run(ids.pLucia, g);
    db.prepare('UPDATE grupos SET cupo = (SELECT COUNT(*) FROM inscripciones WHERE grupo_id = ?) WHERE id = ?').run(g, g);
    const res = await c.post('/api/socio/inscribirme').send({ grupo_id: g, frecuencia: 1, persona_id: ids.pTeo });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lista de espera/);
    const espera = await c.post('/api/socio/inscribirme').send({ grupo_id: g, frecuencia: 1, persona_id: ids.pTeo, lista_espera: true });
    expect(espera.body.lista_espera).toBe(true);
  });
  it('pago simulado con Mercado Pago acredita e imputa los cargos', async () => {
    const c = await como(app, 'socio');
    const pend = (await c.get('/api/socio/pagos')).body.pendientes.filter((p) => p.persona_id === ids.pLucia);
    const cargoIds = pend.slice(0, 2).map((p) => p.id);
    const pref = await c.post('/api/socio/pagos/mercadopago').send({ cargo_ids: cargoIds });
    expect(pref.status).toBe(201);
    const ok = await c.post(`/api/socio/pagos/online/${pref.body.id}/simular`).send({});
    expect(ok.body.estado).toBe('aprobado');
    for (const id of cargoIds) expect(db.prepare('SELECT estado FROM cargos WHERE id = ?').pluck().get(id)).toBe('pagado');
  });
  it('los cargos no se editan: se corrigen con nota de crédito', () => {
    expect(() => db.prepare('UPDATE cargos SET importe = 1 WHERE id = 1').run()).toThrow(/nota de crédito/);
  });
});

describe('tickets de mantenimiento', () => {
  it('resolver exige foto del trabajo terminado y comentario', async () => {
    const socio = await como(app, 'socio');
    const creado = await socio.post('/api/tickets').field('titulo', 'Canilla rota').field('descripcion', 'Gotea la canilla del buffet')
      .field('sector_id', '2').field('categoria', 'plomeria').field('prioridad', 'media');
    expect(creado.status, JSON.stringify(creado.body)).toBe(201);
    const mant = await como(app, 'mantenimiento');
    expect((await mant.post(`/api/tickets/${creado.body.id}/iniciar`).send({})).status).toBe(200);
    const sinFoto = await mant.post(`/api/tickets/${creado.body.id}/resolver`).send({ comentario: 'Listo' });
    expect(sinFoto.status).toBe(400);
    expect(sinFoto.body.error).toMatch(/foto/);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await mant.post(`/api/tickets/${creado.body.id}/fotos`).field('tipo', 'resolucion').attach('fotos', png, { filename: 'ok.png', contentType: 'image/png' });
    expect((await mant.post(`/api/tickets/${creado.body.id}/resolver`).send({ comentario: 'Cambié el cuerito' })).body.estado).toBe('resuelto');
    expect((await socio.post(`/api/tickets/${creado.body.id}/cerrar`).send({})).body.estado).toBe('cerrado');
  });
});

describe('separación de funciones', () => {
  it('quien registra un gasto no lo aprueba; sobre el umbral aprueba la Directiva', async () => {
    const conta = await como(app, 'contabilidad');
    const g = await conta.post('/api/finanzas/gastos').field('fecha', local().fecha).field('categoria_id', '1').field('descripcion', 'Compra grande')
      .field('importe', '50000000').field('medio_pago', 'transferencia').field('caja_id', '2');
    expect(g.body.estado).toBe('pendiente_aprobacion');
    expect((await conta.post(`/api/finanzas/gastos/${g.body.id}/aprobar`).send({ aprobar: true })).status).toBe(403);
    const dir = await como(app, 'directiva');
    expect((await dir.post(`/api/finanzas/gastos/${g.body.id}/aprobar`).send({ aprobar: true })).status).toBe(200);
  });
  it('una revisión médica firmada no se edita', () => {
    const id = db.prepare('SELECT id FROM revisiones_medicas WHERE firmada_en IS NOT NULL LIMIT 1').pluck().get();
    expect(() => db.prepare(`UPDATE revisiones_medicas SET resultado = 'no_apto' WHERE id = ?`).run(id)).toThrow(/no se edita/);
  });
  it('el médico valida el certificado y la inscripción pasa a activa', async () => {
    const med = await como(app, 'medico');
    const cert = (await med.get('/api/medico/certificados')).body.find((x) => x.persona_id === ids.pEmma);
    const vence = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    expect((await med.post(`/api/medico/certificados/${cert.id}/validar`).send({ aprobar: true, vence_en: vence })).status).toBe(200);
    expect(db.prepare('SELECT estado FROM inscripciones WHERE id = ?').pluck().get(ids.insEmma)).toBe('activa');
  });
  it('el delegado no pide cambios para otra actividad', async () => {
    const del = await como(app, 'subcomision');
    const res = await del.post('/api/pedidos-cambio').send({ tipo: 'nueva_seccion', titulo: 'Algo de fútbol', justificacion: 'Una justificación suficientemente larga.', actividad_id: ids.act.futbol });
    expect(res.status).toBe(403);
  });
});
