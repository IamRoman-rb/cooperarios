// Tarifario: cuota social por categoría o grupo familiar, y aranceles por
// frecuencia × condición (socio / no socio) × descuentos (propuesta 2.1 y 6.1).
import { getDb } from '../db/index.js';
import { edad, local, json, invalido } from '../lib/util.js';

export function esSocioActivo(personaId) {
  return !!getDb().prepare(`SELECT 1 FROM socios WHERE persona_id = ? AND estado = 'activo'`).get(personaId);
}

export function tamanoGrupoFamiliar(grupoFamiliarId) {
  if (!grupoFamiliarId) return 1;
  return getDb().prepare(`SELECT COUNT(*) FROM socios WHERE grupo_familiar_id = ? AND estado IN ('activo','pendiente')`)
    .pluck().get(grupoFamiliarId);
}

/** Categoría por edad (adulto, cadete, menor). */
export function categoriaPorEdad(fechaNacimiento) {
  const anios = edad(fechaNacimiento) ?? 18;
  const cats = getDb().prepare(`SELECT * FROM categorias_socio WHERE json_extract(regla_cuota,'$.tipo') = 'fija'`).all();
  return cats.find((c) => (c.edad_min ?? 0) <= anios && anios <= (c.edad_max ?? 200)) ?? cats[0];
}

/**
 * Cuota social mensual de un socio, en centavos. Si el grupo familiar tiene 3 o más
 * integrantes se aplica la regla familiar más favorable.
 */
export function cuotaSocial(socio) {
  const db = getDb();
  const categoria = db.prepare('SELECT * FROM categorias_socio WHERE id = ?').get(socio.categoria_id);
  let valor = json(categoria.regla_cuota).valor;
  const tamano = tamanoGrupoFamiliar(socio.grupo_familiar_id);
  const familiares = db.prepare(`SELECT regla_cuota FROM categorias_socio WHERE json_extract(regla_cuota,'$.tipo') = 'familia'`)
    .pluck().all().map((r) => json(r));
  for (const regla of familiares) {
    if (tamano >= regla.min && regla.valor < valor) valor = regla.valor;
  }
  return valor;
}

export function arancelVigente(actividadId, frecuencia, fecha = local().fecha) {
  return getDb().prepare(`
    SELECT * FROM aranceles WHERE actividad_id = ? AND frecuencia = ?
      AND vigente_desde <= ? AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
    ORDER BY vigente_desde DESC LIMIT 1`).get(actividadId, frecuencia, fecha, fecha);
}

/** Descuentos que la persona puede usar; la promoción horaria la elige el socio al inscribirse. */
export function descuentosAplicables(personaId, { socio }) {
  const db = getDb();
  const persona = db.prepare('SELECT * FROM personas WHERE id = ?').get(personaId);
  const s = db.prepare('SELECT * FROM socios WHERE persona_id = ?').get(personaId);
  return db.prepare('SELECT * FROM descuentos WHERE activo = 1').all().filter((d) => {
    if (d.solo_socios && !socio) return false;
    if (d.condicion === 'jubilado') return !!persona?.jubilado;
    if (d.condicion === 'grupo_familiar') return tamanoGrupoFamiliar(s?.grupo_familiar_id) >= 3;
    return d.condicion === 'horario_promocional';
  });
}

const aplicar = (base, d) => (d.tipo === 'porcentaje' ? Math.round((base * d.valor) / 100) : Math.min(d.valor, base));

/**
 * Precio mensual que corresponde a la persona. No se acumulan descuentos:
 * se aplica el más conveniente (o el elegido, si es válido).
 */
export function cotizar({ personaId, actividadId, frecuencia, descuentoId = null }) {
  const arancel = arancelVigente(actividadId, frecuencia);
  if (!arancel) throw invalido('No hay arancel vigente para esa frecuencia');
  const socio = personaId ? esSocioActivo(personaId) : false;
  const base = socio ? arancel.valor_socio : arancel.valor_no_socio;
  const disponibles = personaId ? descuentosAplicables(personaId, { socio }) : [];
  let elegido = null;
  if (descuentoId) {
    elegido = disponibles.find((d) => d.id === String(descuentoId));
    if (!elegido) throw invalido('El descuento elegido no corresponde a tu situación');
  } else {
    elegido = disponibles
      .filter((d) => d.condicion !== 'horario_promocional')
      .sort((a, b) => aplicar(base, b) - aplicar(base, a))[0] ?? null;
  }
  const descuento = elegido ? aplicar(base, elegido) : 0;
  return {
    arancel_id: arancel.id,
    condicion: socio ? 'socio' : 'no_socio',
    frecuencia,
    base,
    descuento,
    descuento_id: elegido?.id ?? null,
    descuento_nombre: elegido?.nombre ?? null,
    total: base - descuento,
    disponibles: disponibles.map((d) => ({ id: d.id, nombre: d.nombre, tipo: d.tipo, valor: d.valor, condicion: d.condicion })),
  };
}

/** Vacantes = cupo del grupo menos inscripciones activas, en tiempo real. */
export function vacantes(grupoId) {
  const db = getDb();
  const g = db.prepare('SELECT cupo FROM grupos WHERE id = ?').get(grupoId);
  const ocupados = db.prepare(`SELECT COUNT(*) FROM inscripciones WHERE grupo_id = ? AND estado IN ('activa','pendiente_apto','baja_solicitada')`)
    .pluck().get(grupoId);
  return { cupo: g.cupo, ocupados, vacantes: Math.max(g.cupo - ocupados, 0) };
}
