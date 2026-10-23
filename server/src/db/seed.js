// Datos de prueba. No se usan datos reales en desarrollo (propuesta 9.3).
// Uso: npm run db:reset  (borra la base y la vuelve a crear con datos de demostración)
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { abrirBase, migrar, setDb } from './index.js';
import { config } from '../config.js';
import { ROLES, permisosPorRol } from '../lib/rbac.js';
import { local, sumarDias, sumarMeses } from '../lib/util.js';

export const PASSWORD_DEMO = 'Cooperarios2026';
const $ = (pesos) => Math.round(pesos * 100);

const insertador = (db) => (tabla, fila) => {
  const cols = Object.keys(fila);
  return Number(db.prepare(`INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(fila)).lastInsertRowid);
};

/**
 * Catálogos que necesita cualquier instalación (también producción): roles y permisos, parámetros,
 * conceptos, cajas y medios de pago, categorías y cuota social 2026, descuentos, tipos de revisión y la regla
 * general de habilitación. Los valores marcados como «dato de prueba» se reemplazan en la fase 0.
 */
export function sembrarBase(db) {
  const ins = insertador(db);

  // ---------- Roles y permisos ----------
  const rolId = {};
  for (const r of ROLES) rolId[r.codigo] = ins('roles', { codigo: r.codigo, nombre: r.nombre });
  const permisoId = {};
  for (const p of permisosPorRol()) {
    const clave = `${p.modulo}:${p.accion}`;
    permisoId[clave] ??= ins('permisos', { modulo: p.modulo, accion: p.accion });
    ins('rol_permisos', { rol_id: rolId[p.rol], permiso_id: permisoId[clave] });
  }

  // ---------- Parámetros ----------
  const parametros = {
    nombre_club: ['Club Social y Deportivo Los Cooperarios', 'Nombre institucional'],
    direccion: ['Andrade 3052, Quilmes Oeste, Provincia de Buenos Aires', 'Dirección de la sede'],
    telefono: ['(011) 4250-0000', 'Teléfono de administración (dato de prueba)'],
    email_contacto: ['administracion@cooperariosclub.com.ar', 'Correo institucional'],
    horario_club: ['Lunes a viernes de 8 a 23 · Sábados de 8 a 20 · Domingos de 9 a 18', 'Horario del club'],
    horario_administracion: ['Lunes a viernes de 9 a 20 · Sábados de 9 a 13', 'Horario de atención'],
    dia_vencimiento_cuota: ['10', 'Día del mes en que vence la cuota social'],
    umbral_aprobacion_gastos: [String($(300000)), 'Gastos y pagos por encima de este importe (centavos) requieren aprobación de la Comisión Directiva'],
    tickets_foto_obligatoria: ['true', 'Exigir foto del trabajo terminado para resolver un ticket'],
    texto_consentimiento_version: ['2026-10', 'Versión vigente del texto de consentimiento informado'],
    reservas_max_semana: ['3', 'Reservas activas por socio por semana'],
  };
  for (const [clave, [valor, descripcion]] of Object.entries(parametros)) ins('parametros', { clave, valor, descripcion });
  for (const [fecha, descripcion] of [['2026-11-23', 'Día de la Soberanía Nacional'], ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-25', 'Navidad'], ['2027-01-01', 'Año Nuevo']]) {
    ins('feriados', { fecha, descripcion });
  }

  // ---------- Finanzas: conceptos, cajas, medios ----------
  const concepto = {};
  for (const [nombre, tipo] of [['Cuota social', 'cuota_social'], ['Arancel de actividad', 'arancel'], ['Alquiler de espacio', 'alquiler'],
    ['Entrada de invitado', 'invitado'], ['Llave magnética', 'llave'], ['Revisión médica', 'revision_medica'], ['Otros', 'otro']]) {
    concepto[tipo] = ins('conceptos', { nombre, tipo });
  }
  const caja = {
    efectivo: ins('cajas', { nombre: 'Caja de Administración', tipo: 'efectivo', titular: 'Club Los Cooperarios' }),
    banco: ins('cajas', { nombre: 'Banco Provincia — Cta. Cte.', tipo: 'banco', alias: 'COOPERARIOS.CLUB.QUILMES', cbu_cvu: '0140000000000000000000', titular: 'Club Los Cooperarios (dato de prueba)' }),
    mp: ins('cajas', { nombre: 'Mercado Pago', tipo: 'billetera', alias: 'cooperarios.mp', cbu_cvu: '0000003100000000000000', titular: 'Club Los Cooperarios (dato de prueba)' }),
  };
  ins('medios_pago', { tipo: 'efectivo', nombre: 'Efectivo en Administración', caja_id: caja.efectivo, comision_pct: 0 });
  ins('medios_pago', { tipo: 'transferencia', nombre: 'Transferencia bancaria', caja_id: caja.banco, comision_pct: 0 });
  ins('medios_pago', { tipo: 'mercadopago', nombre: 'Mercado Pago', caja_id: caja.mp, comision_pct: 6.29 });
  ins('medios_pago', { tipo: 'billetera', nombre: 'Otras billeteras (alias / CVU)', caja_id: caja.mp, comision_pct: 0 });

  // ---------- Categorías de socio (cuota 2026, vigente desde junio) ----------
  const cat = {
    adulto: ins('categorias_socio', { nombre: 'Adulto', edad_min: 18, edad_max: null, regla_cuota: JSON.stringify({ tipo: 'fija', valor: $(20000) }) }),
    cadete: ins('categorias_socio', { nombre: 'Cadete', edad_min: 14, edad_max: 17, regla_cuota: JSON.stringify({ tipo: 'fija', valor: $(20000) }) }),
    menor: ins('categorias_socio', { nombre: 'Menor', edad_min: 6, edad_max: 13, regla_cuota: JSON.stringify({ tipo: 'fija', valor: $(16000) }) }),
  };
  ins('categorias_socio', { nombre: 'Familia de 3', regla_cuota: JSON.stringify({ tipo: 'familia', min: 3, valor: $(16000) }) });
  ins('categorias_socio', { nombre: 'Familia de 4 o más', regla_cuota: JSON.stringify({ tipo: 'familia', min: 4, valor: $(14000) }) });

  const descuento = {
    jubilado: ins('descuentos', { nombre: 'Jubilados', tipo: 'porcentaje', valor: 15, condicion: 'jubilado', solo_socios: 1 }),
    familia: ins('descuentos', { nombre: 'Grupo familiar', tipo: 'porcentaje', valor: 10, condicion: 'grupo_familiar', solo_socios: 1 }),
    promo: ins('descuentos', { nombre: 'Horario promocional (20%)', tipo: 'porcentaje', valor: 20, condicion: 'horario_promocional', solo_socios: 0 }),
  };
  const tipoRev = {
    natatorio: ins('tipos_revision', { nombre: 'Revisación para natatorio', vigencia_meses: 1, concepto_arancel_id: concepto.revision_medica, importe: $(6000) }),
    deportivo: ins('tipos_revision', { nombre: 'Apto físico deportivo', vigencia_meses: 12, concepto_arancel_id: concepto.revision_medica, importe: 0 }),
  };
  ins('reglas_habilitacion', { actividad_id: null, gracia_cuota_dias: 10, gracia_arancel_dias: 5, ventana_antes_min: 15, ventana_despues_min: 0 });
  return { rolId, concepto, caja, cat, descuento, tipoRev };
}

/** Datos de demostración completos (desarrollo y pruebas). */
export function sembrar(db) {
  const { rolId, concepto, caja, cat, tipoRev } = sembrarBase(db);
  const ins = insertador(db);
  const hoy = local().fecha;
  const periodo = hoy.slice(0, 7);
  const periodoAnterior = sumarMeses(`${periodo}-01`, -1).slice(0, 7);
  const periodoAntes = sumarMeses(`${periodo}-01`, -2).slice(0, 7);
  const ahora = new Date().toISOString();
  const hash = bcrypt.hashSync(PASSWORD_DEMO, 8);
  let semilla = 42;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

  // ---------- Espacios y sectores ----------
  const esp = {};
  for (const [clave, nombre, tipo, capacidad, reservable, tarifa] of [
    ['natatorio', 'Natatorio climatizado', 'natatorio', 60, 0, 0],
    ['tenis1', 'Cancha de tenis 1 (polvo de ladrillo)', 'cancha', 4, 1, $(12000)],
    ['tenis2', 'Cancha de tenis 2 (polvo de ladrillo)', 'cancha', 4, 1, $(12000)],
    ['micro', 'Microestadio', 'cancha', 200, 1, $(35000)],
    ['futbol', 'Cancha de fútbol 7', 'cancha', 14, 1, $(30000)],
    ['gimnasio', 'Gimnasio de musculación', 'gimnasio', 40, 0, 0],
    ['dojo', 'Salón de artes marciales', 'salon', 30, 0, 0],
    ['salon', 'Salón social', 'salon', 150, 1, $(80000)],
    ['biblioteca', 'Salón biblioteca', 'salon', 30, 0, 0],
    ['vestuarios', 'Vestuarios', 'vestuario', 50, 0, 0],
    ['parque', 'Parque y quincho', 'parque', 100, 1, $(45000)],
  ]) {
    esp[clave] = ins('espacios', { nombre, tipo, capacidad, reservable, tarifa_hora: tarifa });
    if (reservable) ins('reglas_reserva', { espacio_id: esp[clave], anticipacion_dias: clave.startsWith('tenis') ? 7 : 30, max_activas: 2, cancelacion_horas: 12, sancion: 'Una semana sin reservas por ausencia sin aviso' });
  }

  // ---------- Personas y usuarios ----------
  const nombres = ['Lucía', 'Martín', 'Sofía', 'Juan', 'Valentina', 'Mateo', 'Camila', 'Santiago', 'Martina', 'Benjamín', 'Julieta', 'Tomás', 'Agustina', 'Nicolás', 'Florencia', 'Lautaro', 'Micaela', 'Joaquín', 'Paula', 'Facundo', 'Rocío', 'Gonzalo', 'Carla', 'Diego', 'Abril', 'Franco', 'Milagros', 'Ezequiel'];
  const apellidos = ['Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Pérez', 'Gómez', 'Sánchez', 'Romero', 'Díaz', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez', 'Molina', 'Castro', 'Ortiz', 'Silva'];
  let dni = 30000000;
  let nroSocio = 1400;
  const persona = (nombre, apellido, nacimiento, extra = {}) => ins('personas', {
    dni: String(dni += 137), nombre, apellido, fecha_nacimiento: nacimiento,
    email: `${nombre}.${apellido}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@ejemplo.com',
    telefono: `11-${Math.floor(40000000 + azar() * 9999999)}`, domicilio: `Calle ${Math.floor(100 + azar() * 4000)}, Quilmes Oeste`, tipo: 'socio', ...extra,
  });
  const usuario = (personaId, email, roles) => {
    const id = ins('usuarios', { persona_id: personaId, email, password_hash: hash, ultimo_acceso: ahora });
    for (const r of roles) {
      const [codigo, actividadId] = Array.isArray(r) ? r : [r, null];
      ins('usuario_roles', { usuario_id: id, rol_id: rolId[codigo], actividad_id: actividadId });
    }
    return id;
  };
  const socio = (personaId, categoriaId, grupoId = null, extra = {}) => ins('socios', {
    persona_id: personaId, nro_socio: nroSocio++, categoria_id: categoriaId, grupo_familiar_id: grupoId, estado: 'activo',
    fecha_alta: sumarDias(hoy, -Math.floor(200 + azar() * 3000)), llave_nro: `LL-${Math.floor(1000 + azar() * 8999)}`, ...extra,
  });
  const consentir = (personaId, tutorId = null) => {
    for (const tipo of ['datos_personales', 'datos_salud', 'comunicaciones']) {
      ins('consentimientos', { persona_id: personaId, tipo, version_texto: '2026-10', aceptado_en: ahora, aceptado_por_tutor_id: tutorId });
    }
  };

  // Familia demo del socio
  const pLucia = persona('Lucía', 'Fernández', '1986-04-12');
  const gfLucia = ins('grupos_familiares', { titular_persona_id: pLucia, nombre: 'Familia Fernández' });
  const sLucia = socio(pLucia, cat.adulto, gfLucia);
  const pPablo = persona('Pablo', 'Fernández', '1984-09-03');
  socio(pPablo, cat.adulto, gfLucia);
  const pEmma = persona('Emma', 'Fernández', '2015-06-21');
  socio(pEmma, cat.menor, gfLucia);
  ins('tutores', { menor_persona_id: pEmma, tutor_persona_id: pLucia, parentesco: 'madre' });
  const pTeo = persona('Teo', 'Fernández', '2011-02-14');
  socio(pTeo, cat.cadete, gfLucia);
  ins('tutores', { menor_persona_id: pTeo, tutor_persona_id: pLucia, parentesco: 'madre' });
  [pLucia, pPablo].forEach((p) => consentir(p));
  [pEmma, pTeo].forEach((p) => consentir(p, pLucia));

  const uSocio = usuario(pLucia, 'socio@demo.coop', ['socio']);
  const pMartin = persona('Martín', 'Sosa', '1990-01-25', { tipo: 'profesor' });
  socio(pMartin, cat.adulto);
  consentir(pMartin);
  const uProfesor = usuario(pMartin, 'profesor@demo.coop', ['profesor', 'socio']);
  const pRoberto = persona('Roberto', 'Giménez', '1972-11-08', { tipo: 'empleado' });
  const uAdmin = usuario(pRoberto, 'admin@demo.coop', ['admin']);
  const pAna = persona('Ana', 'Medina', '1980-07-19', { tipo: 'empleado' });
  const uConta = usuario(pAna, 'contabilidad@demo.coop', ['contabilidad']);
  const pCarlos = persona('Carlos', 'Benítez', '1961-03-30', { jubilado: 1 });
  socio(pCarlos, cat.adulto);
  consentir(pCarlos);
  const uDirectiva = usuario(pCarlos, 'directiva@demo.coop', ['directiva', 'socio']);
  const pGraciela = persona('Graciela', 'Torres', '1975-05-05');
  socio(pGraciela, cat.adulto);
  consentir(pGraciela);
  const pJorge = persona('Jorge', 'Acosta', '1978-12-01', { tipo: 'empleado' });
  const uMant = usuario(pJorge, 'mantenimiento@demo.coop', ['mantenimiento']);
  const pRaul = persona('Raúl', 'Herrera', '1969-08-14', { tipo: 'empleado' });
  const uMant2 = usuario(pRaul, 'porteria@demo.coop', ['mantenimiento']);
  const pDra = persona('Silvina', 'Castro', '1977-10-10', { tipo: 'externo' });
  const uMedico = usuario(pDra, 'medico@demo.coop', ['medico']);
  const pAux = persona('Noelia', 'Ortiz', '1993-03-22', { tipo: 'empleado' });
  const uAux = usuario(pAux, 'auxiliar@demo.coop', ['auxiliar']);
  const pSis = persona('Román', 'Borla', '2004-06-01', { tipo: 'externo' });
  const uSistemas = usuario(pSis, 'sistemas@demo.coop', ['sistemas']);
  for (const [p, cargo] of [[pCarlos, 'Presidente'], [pGraciela, 'Secretaria'], [persona('Héctor', 'Ruiz', '1966-02-02'), 'Tesorero'], [persona('Mirta', 'Suárez', '1970-09-09'), 'Vocal titular']]) {
    ins('cargos_directivos', { persona_id: p, cargo, desde: '2025-05-01' });
  }
  ins('profesionales_salud', { usuario_id: uMedico, matricula: 'MP 45.821', especialidad: 'Medicina del deporte' });

  // Socios generados
  const sociosGenerados = [];
  for (let i = 0; i < 46; i++) {
    const anio = 1950 + Math.floor(azar() * 64);
    const p = persona(elegir(nombres), elegir(apellidos), `${anio}-${String(1 + Math.floor(azar() * 12)).padStart(2, '0')}-${String(1 + Math.floor(azar() * 28)).padStart(2, '0')}`, { jubilado: anio < 1960 ? 1 : 0 });
    const edadP = Number(hoy.slice(0, 4)) - anio;
    const c = edadP >= 18 ? cat.adulto : edadP >= 14 ? cat.cadete : cat.menor;
    const estado = i % 23 === 7 ? 'suspendido' : i % 19 === 5 ? 'baja' : 'activo';
    socio(p, c, null, { estado, ...(estado === 'baja' ? { fecha_baja: sumarDias(hoy, -40), motivo_baja: 'Solicitud del socio' } : {}) });
    consentir(p);
    sociosGenerados.push(p);
  }

  // Profesores
  const profesores = {};
  const prof = (personaId, cuit) => ins('profesores', { persona_id: personaId, cuit, vinculo: 'monotributo' });
  profesores.martin = prof(pMartin, '20-35123456-3');
  for (const [clave, n, a] of [['laura', 'Laura', 'Romero'], ['diego', 'Diego', 'Molina'], ['pedro', 'Pedro', 'Aguirre'], ['carla', 'Carla', 'Silva'], ['hugo', 'Hugo', 'Díaz']]) {
    profesores[clave] = prof(persona(n, a, `198${Math.floor(azar() * 9)}-05-1${Math.floor(azar() * 9)}`, { tipo: 'profesor' }), `20-3${Math.floor(1000000 + azar() * 8999999)}-1`);
  }

  // ---------- Subcomisiones y actividades (24 publicadas) ----------
  const sub = {
    tenis: ins('subcomisiones', { nombre: 'Subcomisión de Tenis', presupuesto_anual: $(2400000) }),
    basquet: ins('subcomisiones', { nombre: 'Subcomisión de Básquet', presupuesto_anual: $(3600000) }),
    natacion: ins('subcomisiones', { nombre: 'Subcomisión de Natación', presupuesto_anual: $(5200000) }),
    marciales: ins('subcomisiones', { nombre: 'Subcomisión de Artes Marciales', presupuesto_anual: $(1200000) }),
  };
  const temporada = ins('temporadas', { nombre: 'Temporada 2026', desde: '2026-03-01', hasta: '2026-12-20' });
  const natatorioTemp = ins('temporadas', { nombre: 'Natatorio 2026 (marzo a noviembre)', desde: '2026-03-01', hasta: '2026-11-30' });


  const act = {};
  const actividades = [
    ['natatorio', 'Natatorio climatizado', 'acuatica', 'pool', sub.natacion, 'Pileta semiolímpica climatizada. Escuela, nado libre, plantel infanto juvenil y master.'],
    ['natacion_bebes', 'Natación para bebés', 'acuatica', 'child_care', sub.natacion, 'Estimulación acuática de 6 meses a 3 años con un adulto acompañante.'],
    ['natacion_adaptada', 'Natación adaptada', 'acuatica', 'accessible', sub.natacion, 'Clases personalizadas para personas con discapacidad.'],
    ['buceo', 'Buceo', 'acuatica', 'scuba_diving', sub.natacion, 'Bautismos y cursos de buceo en pileta.'],
    ['tenis', 'Tenis', 'deportiva', 'sports_tennis', sub.tenis, 'Entrenamientos, alquiler de canchas y clases individuales.'],
    ['basquet_m', 'Básquet masculino', 'deportiva', 'sports_basketball', sub.basquet, 'Formativas y primera. Competencia federada.'],
    ['basquet_f', 'Básquet femenino', 'deportiva', 'sports_basketball', sub.basquet, 'Formativas y mayores femenino.'],
    ['futbol', 'Fútbol', 'deportiva', 'sports_soccer', null, 'Escuelita y fútbol infantil.'],
    ['voley', 'Vóley', 'deportiva', 'sports_volleyball', null, 'Vóley mixto, juveniles y mayores.'],
    ['gimnasia', 'Gimnasia artística', 'deportiva', 'sports_gymnastics', null, 'Gimnasia artística femenina y masculina.'],
    ['acrobungee', 'Acrobungee', 'deportiva', 'paragliding', null, 'Acrobacia con arneses y bandas elásticas.'],
    ['telas', 'Acrobacia en telas', 'deportiva', 'airline_seat_flat', null, 'Acrobacia aérea en telas.'],
    ['patin', 'Patín artístico', 'deportiva', 'roller_skating', null, 'Escuela de patín artístico.'],
    ['musculacion', 'Gimnasio de musculación', 'deportiva', 'fitness_center', null, 'Sala de musculación con profesor.'],
    ['atletismo', 'Atletismo', 'deportiva', 'directions_run', null, 'Entrenamiento de pista y calle.'],
    ['iniciacion', 'Iniciación deportiva', 'deportiva', 'sports', null, 'Multideporte para chicos de 4 a 8 años.'],
    ['levantamiento', 'Levantamiento olímpico', 'deportiva', 'fitness_center', null, 'Técnica de arranque y envión.'],
    ['cross', 'Cross funcional', 'deportiva', 'exercise', null, 'Entrenamiento funcional de alta intensidad.'],
    ['boxeo', 'Boxeo', 'deportiva', 'sports_mma', sub.marciales, 'Boxeo recreativo y competitivo.'],
    ['taekwondo', 'Taekwondo', 'deportiva', 'sports_martial_arts', sub.marciales, 'Taekwondo ITF para todas las edades.'],
    ['karate', 'Karate', 'deportiva', 'sports_martial_arts', sub.marciales, 'Karate do tradicional.'],
    ['ajedrez', 'Ajedrez', 'cultural', 'chess', null, 'Escuela de ajedrez y torneos.'],
    ['aeroyoga', 'Aeroyoga', 'deportiva', 'self_improvement', null, 'Yoga aéreo con hamacas.'],
    ['artes', 'Taller de artes', 'cultural', 'palette', null, 'Dibujo, pintura y cerámica.'],
    ['arqueria', 'Arquería', 'deportiva', 'adjust', null, 'Tiro con arco recreativo.'],
  ];
  for (const [clave, nombre, tipo, icono, subcomision, descripcion] of actividades) {
    act[clave] = ins('actividades', { nombre, tipo, icono, subcomision_id: subcomision, descripcion, dia_vencimiento: 10 });
  }
  // Aranceles. Natatorio según la propuesta (frecuencia × condición); el resto, valores de prueba.
  const natatorio = [[0, 'Nado libre', 27500, 78000], [1, '1 vez por semana', 37000, 87500], [2, '2 veces por semana', 42000, 93000],
    [3, '3 veces por semana', 47000, 98000], [4, '4 veces por semana', 52000, 103000], [5, '5 veces por semana', 57000, 108000]];
  for (const [frecuencia, descripcion, s, ns] of natatorio) {
    ins('aranceles', { actividad_id: act.natatorio, frecuencia, descripcion, valor_socio: $(s), valor_no_socio: $(ns), vigente_desde: '2026-03-01', vigente_hasta: '2026-11-30' });
  }
  for (const [clave] of actividades) {
    if (clave === 'natatorio') continue;
    const base = 18000 + Math.floor(azar() * 14) * 1000;
    for (const f of [1, 2, 3]) {
      ins('aranceles', { actividad_id: act[clave], frecuencia: f, descripcion: `${f} ${f === 1 ? 'vez' : 'veces'} por semana`,
        valor_socio: $(base + (f - 1) * 6000), valor_no_socio: $(Math.round((base + (f - 1) * 6000) * 1.8)), vigente_desde: '2026-03-01' });
    }
  }
  for (const clave of ['natatorio', 'natacion_bebes', 'natacion_adaptada', 'buceo']) {
    ins('actividad_requisitos', { actividad_id: act[clave], tipo_revision_id: tipoRev.natatorio, bloqueante: 1, dias_gracia: 3 });
  }
  for (const clave of ['basquet_m', 'basquet_f', 'futbol', 'voley', 'boxeo', 'taekwondo', 'karate', 'atletismo', 'levantamiento']) {
    ins('actividad_requisitos', { actividad_id: act[clave], tipo_revision_id: tipoRev.deportivo, bloqueante: 1, dias_gracia: 7 });
  }
  ins('reglas_habilitacion', { actividad_id: act.natatorio, gracia_cuota_dias: 5, gracia_arancel_dias: 3, ventana_antes_min: 20, ventana_despues_min: 0 });

  // Grupos y horarios (0 = domingo)
  const grupos = {};
  const grupo = (clave, actividad, nombre, cupo, profesor, horarios, espacio, edad = [null, null], temp = temporada) => {
    grupos[clave] = ins('grupos', { actividad_id: actividad, temporada_id: temp, nombre, cupo, profesor_id: profesor, edad_min: edad[0], edad_max: edad[1] });
    for (const [dia, ini, fin] of horarios) ins('horarios', { grupo_id: grupos[clave], dia_semana: dia, hora_inicio: ini, hora_fin: fin, espacio_id: espacio });
  };
  const habiles = (ini, fin) => [1, 2, 3, 4, 5].map((d) => [d, ini, fin]);
  grupo('nat_adultos_m', act.natatorio, 'Adultos mañana', 20, profesores.martin, habiles('08:00', '09:00'), esp.natatorio, [18, null], natatorioTemp);
  grupo('nat_adultos_n', act.natatorio, 'Adultos noche', 20, profesores.martin, habiles('20:00', '21:00'), esp.natatorio, [18, null], natatorioTemp);
  grupo('nat_escuela', act.natatorio, 'Escuela infantil', 15, profesores.martin, [[2, '17:00', '18:00'], [4, '17:00', '18:00'], [6, '10:00', '11:00']], esp.natatorio, [6, 13], natatorioTemp);
  grupo('nat_libre', act.natatorio, 'Nado libre', 30, null, [...habiles('09:00', '21:30'), [6, '09:00', '19:30'], [0, '09:00', '17:30']], esp.natatorio, [14, null], natatorioTemp);
  grupo('nat_master', act.natatorio, 'Plantel master', 12, profesores.martin, [[1, '21:00', '22:30'], [3, '21:00', '22:30'], [5, '21:00', '22:30']], esp.natatorio, [25, null], natatorioTemp);
  grupo('bebes', act.natacion_bebes, 'Bebés con acompañante', 8, profesores.laura, [[6, '11:00', '11:45']], esp.natatorio, [0, 3], natatorioTemp);
  grupo('tenis_adultos', act.tenis, 'Entrenamiento adultos', 8, profesores.diego, [[2, '19:00', '20:30'], [4, '19:00', '20:30']], esp.tenis1, [18, null]);
  grupo('tenis_menores', act.tenis, 'Escuela de menores', 10, profesores.diego, [[1, '17:30', '19:00'], [3, '17:30', '19:00']], esp.tenis2, [7, 15]);
  grupo('basquet_u13', act.basquet_m, 'U13', 18, profesores.pedro, [[1, '18:00', '19:30'], [3, '18:00', '19:30'], [5, '18:00', '19:30']], esp.micro, [11, 13]);
  grupo('basquet_primera', act.basquet_m, 'Primera', 16, profesores.pedro, [[2, '21:00', '23:00'], [4, '21:00', '23:00']], esp.micro, [18, null]);
  grupo('basquet_fem', act.basquet_f, 'Femenino mayores', 16, profesores.carla, [[1, '20:00', '21:30'], [3, '20:00', '21:30']], esp.micro, [16, null]);
  grupo('futbol_inf', act.futbol, 'Escuelita 6 a 10 años', 25, profesores.hugo, [[2, '18:00', '19:00'], [4, '18:00', '19:00']], esp.futbol, [6, 10]);
  grupo('voley', act.voley, 'Vóley mixto', 20, profesores.carla, [[2, '19:30', '21:00'], [5, '19:30', '21:00']], esp.micro, [14, null]);
  grupo('musculacion', act.musculacion, 'Sala libre con profesor', 40, profesores.hugo, [...habiles('08:00', '23:00'), [6, '08:00', '20:00']], esp.gimnasio, [16, null]);
  grupo('karate', act.karate, 'Karate todas las edades', 20, profesores.laura, [[1, '19:00', '20:30'], [4, '19:00', '20:30']], esp.dojo, [6, null]);
  grupo('taekwondo', act.taekwondo, 'Taekwondo', 20, profesores.laura, [[2, '18:00', '19:30'], [5, '18:00', '19:30']], esp.dojo, [6, null]);
  grupo('ajedrez', act.ajedrez, 'Escuela de ajedrez', 16, profesores.diego, [[3, '18:30', '20:00']], esp.biblioteca, [7, null]);
  grupo('aeroyoga', act.aeroyoga, 'Aeroyoga', 10, profesores.carla, [[2, '10:00', '11:00'], [4, '10:00', '11:00']], esp.salon, [16, null]);
  grupo('cross', act.cross, 'Cross funcional', 4, profesores.hugo, [[1, '07:00', '08:00'], [3, '07:00', '08:00'], [5, '07:00', '08:00']], esp.gimnasio, [16, null]);

  // Inscripciones
  const inscripcion = (personaId, grupoId, frecuencia, estado = 'activa', desde = '2026-03-01', descuentoId = null) =>
    ins('inscripciones', { persona_id: personaId, grupo_id: grupoId, frecuencia_semanal: frecuencia, desde, estado, descuento_id: descuentoId });
  const insLuciaNat = inscripcion(pLucia, grupos.nat_adultos_n, 3);
  const insLuciaYoga = inscripcion(pLucia, grupos.aeroyoga, 2);
  const insEmma = inscripcion(pEmma, grupos.nat_escuela, 2, 'pendiente_apto');
  const insTeo = inscripcion(pTeo, grupos.basquet_u13, 3);
  inscripcion(pPablo, grupos.musculacion, 3);
  inscripcion(pCarlos, grupos.ajedrez, 1);
  inscripcion(pMartin, grupos.musculacion, 2);
  const listaGrupos = [grupos.nat_adultos_m, grupos.nat_adultos_n, grupos.nat_libre, grupos.tenis_adultos, grupos.basquet_primera, grupos.basquet_fem,
    grupos.voley, grupos.musculacion, grupos.karate, grupos.ajedrez, grupos.aeroyoga, grupos.cross, grupos.taekwondo];
  sociosGenerados.forEach((p, i) => {
    const g = listaGrupos[i % listaGrupos.length];
    const lleno = db.prepare(`SELECT COUNT(*) < (SELECT cupo FROM grupos WHERE id = ?) FROM inscripciones WHERE grupo_id = ?`).pluck().get(g, g);
    if (lleno) inscripcion(p, g, 1 + (i % 3));
    if (i % 4 === 0) inscripcion(p, grupos.musculacion, 2);
  });
  // El grupo de cross queda sin vacantes, con lista de espera
  ins('lista_espera', { grupo_id: grupos.cross, persona_id: pPablo, posicion: 1 });

  // Revisiones médicas
  const revision = (personaId, tipo, fecha, resultado, vence) => ins('revisiones_medicas', {
    persona_id: personaId, tipo_revision_id: tipo, profesional_id: 1, fecha, resultado, vence_en: vence, cargado_por: uMedico, validada_por: uMedico, firmada_en: `${fecha}T15:00:00.000Z`,
  });
  revision(pLucia, tipoRev.natatorio, sumarDias(hoy, -20), 'apto', sumarDias(hoy, 11));
  revision(pTeo, tipoRev.deportivo, sumarDias(hoy, -300), 'apto', sumarDias(hoy, 65));
  const conRequisito = db.prepare(`SELECT DISTINCT i.persona_id, ar.tipo_revision_id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id
    JOIN actividad_requisitos ar ON ar.actividad_id = g.actividad_id WHERE i.persona_id NOT IN (?, ?, ?)`).all(pLucia, pTeo, pEmma);
  conRequisito.forEach((r, i) => {
    if (i % 5 === 4) return; // algunos sin apto
    const tipo = r.tipo_revision_id === tipoRev.natatorio ? 1 : 12;
    const vence = i % 6 === 1 ? sumarDias(hoy, -3) : i % 6 === 2 ? sumarDias(hoy, 9) : sumarMeses(hoy, tipo);
    revision(r.persona_id, r.tipo_revision_id, sumarMeses(vence, -tipo), 'apto', vence);
  });
  db.prepare(`UPDATE inscripciones SET estado = 'pendiente_apto' WHERE estado = 'activa' AND id IN (
    SELECT i.id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividad_requisitos ar ON ar.actividad_id = g.actividad_id
    WHERE NOT EXISTS (SELECT 1 FROM revisiones_medicas r WHERE r.persona_id = i.persona_id AND r.tipo_revision_id = ar.tipo_revision_id))`).run();
  // Certificado externo pendiente de validación (Emma) y turnos
  ins('revisiones_medicas', { persona_id: pEmma, tipo_revision_id: tipoRev.natatorio, fecha: sumarDias(hoy, -1), resultado: 'pendiente_validacion', certificado_externo: 'certificados/demo-certificado.pdf', cargado_por: uSocio });
  for (const [i, p] of sociosGenerados.slice(0, 6).entries()) {
    ins('turnos_revision', { persona_id: p, tipo_revision_id: i % 2 ? tipoRev.deportivo : tipoRev.natatorio, profesional_id: 1, inicio: `${hoy}T${String(12 + i).padStart(2, '0')}:00:00.000Z`, estado: i < 2 ? 'atendido' : 'confirmado' });
  }
  ins('turnos_revision', { persona_id: pTeo, tipo_revision_id: tipoRev.deportivo, profesional_id: 1, inicio: `${sumarDias(hoy, 2)}T21:30:00.000Z`, estado: 'solicitado' });

  // ---------- Cargos y pagos de los últimos tres meses ----------
  const crearCargo = (personaId, tipo, descripcion, per, importe, vencimiento, origenTipo, origenId) =>
    ins('cargos', { persona_id: personaId, concepto_id: concepto[tipo], descripcion, periodo: per, importe, vencimiento, origen_tipo: origenTipo, origen_id: origenId, creado_en: `${per}-01T06:00:00.000Z` });
  let recibo = 0;
  const pagar = (personaId, cargoIds, importe, medio, fecha) => {
    const cajaMedio = medio === 'efectivo' ? caja.efectivo : medio === 'transferencia' ? caja.banco : caja.mp;
    const pagoId = ins('pagos', { persona_id: personaId, fecha, medio, caja_id: cajaMedio, importe, referencia: medio === 'mercadopago' ? `MP ${Math.floor(1e9 + azar() * 9e9)}` : null, registrado_por: medio === 'efectivo' ? uAdmin : null });
    let resto = importe;
    for (const c of cargoIds) {
      const cargo = db.prepare('SELECT importe FROM cargos WHERE id = ?').get(c);
      const aplicado = Math.min(resto, cargo.importe);
      ins('imputaciones', { pago_id: pagoId, cargo_id: c, importe: aplicado });
      db.prepare('UPDATE cargos SET estado = ? WHERE id = ?').run(aplicado === cargo.importe ? 'pagado' : 'parcial', c);
      resto -= aplicado;
    }
    ins('comprobantes', { tipo: 'recibo', numero: `R-0001-${String(++recibo).padStart(8, '0')}`, persona_id: personaId, pago_id: pagoId, fecha, total: importe });
    ins('movimientos_caja', { caja_id: cajaMedio, fecha, tipo: 'ingreso', importe, concepto: `Cobro R-0001-${String(recibo).padStart(8, '0')}`, ref_tipo: 'pago', ref_id: pagoId });
    if (medio === 'mercadopago') ins('pagos_online', { pago_id: pagoId, persona_id: personaId, cargo_ids: JSON.stringify(cargoIds), proveedor: 'mercadopago', payment_id: `SIM${pagoId}`, estado: 'aprobado', monto: importe, comision: Math.round(importe * 0.0629), creado_en: fecha });
  };
  const precioDe = (actividadId, frecuencia, esSocio) => {
    const a = db.prepare(`SELECT * FROM aranceles WHERE actividad_id = ? AND frecuencia = ? ORDER BY vigente_desde DESC LIMIT 1`).get(actividadId, frecuencia);
    return a ? (esSocio ? a.valor_socio : a.valor_no_socio) : 0;
  };
  const cuotaDe = (s) => {
    const tamano = s.grupo_familiar_id ? db.prepare(`SELECT COUNT(*) FROM socios WHERE grupo_familiar_id = ?`).pluck().get(s.grupo_familiar_id) : 1;
    if (tamano >= 4) return $(14000);
    if (tamano === 3) return $(16000);
    return JSON.parse(db.prepare('SELECT regla_cuota FROM categorias_socio WHERE id = ?').pluck().get(s.categoria_id)).valor;
  };
  const medios = ['efectivo', 'transferencia', 'mercadopago', 'mercadopago', 'transferencia'];
  for (const [n, per] of [periodoAntes, periodoAnterior, periodo].entries()) {
    const actual = per === periodo;
    for (const s of db.prepare(`SELECT * FROM socios WHERE estado IN ('activo','suspendido')`).all()) {
      const cargos = [crearCargo(s.persona_id, 'cuota_social', `Cuota social ${per}`, per, cuotaDe(s), `${per}-10`, 'socio', s.id)];
      for (const i of db.prepare(`SELECT i.*, g.actividad_id, a.nombre FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id JOIN actividades a ON a.id = g.actividad_id WHERE i.persona_id = ? AND i.estado != 'baja'`).all(s.persona_id)) {
        let importe = precioDe(i.actividad_id, i.frecuencia_semanal, true);
        const persona = db.prepare('SELECT jubilado FROM personas WHERE id = ?').get(s.persona_id);
        if (persona.jubilado) importe = Math.round(importe * 0.85);
        else if (s.grupo_familiar_id) importe = Math.round(importe * 0.9);
        cargos.push(crearCargo(s.persona_id, 'arancel', `${i.nombre} ${per}`, per, importe, `${per}-10`, 'inscripcion', i.id));
      }
      // Morosos: suspendidos y algunos que deben el mes actual o el anterior.
      const moroso = s.estado === 'suspendido' || (s.persona_id % 7 === 3 && n >= 1) || (s.persona_id === pTeo && actual);
      if (moroso) continue;
      if (actual && (s.persona_id % 3 === 0 || s.persona_id === pLucia || s.persona_id === pEmma)) continue; // pendientes del mes en curso
      const total = cargos.reduce((t, c) => t + db.prepare('SELECT importe FROM cargos WHERE id = ?').pluck().get(c), 0);
      const dia = String(2 + Math.floor(azar() * 8)).padStart(2, '0');
      pagar(s.persona_id, cargos, total, elegir(medios), `${per}-${dia}T14:${String(Math.floor(azar() * 59)).padStart(2, '0')}:00.000Z`);
    }
  }
  // Llave magnética e invitado para la socia demo
  crearCargo(pLucia, 'llave', 'Llave magnética de ingreso (única vez)', periodoAnterior, $(2500), `${periodoAnterior}-15`, null, null);
  const cargoInv = crearCargo(pLucia, 'invitado', 'Invitado: Mariana López', periodo, $(6500), hoy, 'invitado', null);
  ins('invitados', { nombre: 'Mariana López', dni: '33444555', socio_anfitrion_id: sLucia, fecha: hoy, importe: $(6500), cargo_id: cargoInv });
  // Transferencias informadas por aprobar
  const pendientesLucia = db.prepare(`SELECT id, importe FROM cargos WHERE persona_id = ? AND estado = 'pendiente' AND concepto_id = ? LIMIT 1`).get(pLucia, concepto.cuota_social);
  ins('transferencias_informadas', { persona_id: pLucia, cargo_ids: JSON.stringify([pendientesLucia.id]), monto: pendientesLucia.importe, referencia: 'Transferencia Banco Galicia op. 88123', comprobante_archivo: 'comprobantes/demo-transferencia.pdf', estado: 'pendiente' });
  for (const p of sociosGenerados.filter((x) => x % 3 === 0).slice(0, 3)) {
    const c = db.prepare(`SELECT id, importe FROM cargos WHERE persona_id = ? AND estado = 'pendiente' LIMIT 1`).get(p);
    if (c) ins('transferencias_informadas', { persona_id: p, cargo_ids: JSON.stringify([c.id]), monto: c.importe, referencia: `Alias COOPERARIOS.CLUB.QUILMES · op. ${Math.floor(10000 + azar() * 89999)}`, estado: 'pendiente' });
  }

  // Ingresos varios
  for (const [origen, descripcion, importe, medio] of [['sponsor', 'Sponsor camiseta básquet — Corralón El Progreso', 450000, 'transferencia'], ['evento', 'Cena aniversario — venta de tarjetas', 1280000, 'efectivo'], ['alquiler', 'Alquiler salón social — cumpleaños', 180000, 'transferencia'], ['donacion', 'Donación para el natatorio', 300000, 'transferencia']]) {
    ins('ingresos_varios', { fecha: `${periodoAnterior}-1${Math.floor(azar() * 9)}T15:00:00.000Z`, origen, descripcion, importe: $(importe), medio, caja_id: medio === 'efectivo' ? caja.efectivo : caja.banco, registrado_por: uConta });
    ins('movimientos_caja', { caja_id: medio === 'efectivo' ? caja.efectivo : caja.banco, fecha: `${periodoAnterior}-15T15:00:00.000Z`, tipo: 'ingreso', importe: $(importe), concepto: descripcion, ref_tipo: 'ingreso_vario' });
  }

  // ---------- Personal y remuneraciones ----------
  const empleado = (personaId, cargo, sector, tipo, forma, base) => ins('empleados', { persona_id: personaId, cargo, sector, tipo_vinculo: tipo, fecha_alta: sumarDias(hoy, -Math.floor(400 + azar() * 3000)), forma_pago: forma, remuneracion_base: $(base) });
  const empleados = [
    empleado(pRoberto, 'Secretario administrativo', 'Administración', 'dependencia', 'transferencia', 980000),
    empleado(pAna, 'Auxiliar contable', 'Contabilidad', 'dependencia', 'transferencia', 920000),
    empleado(pJorge, 'Encargado de mantenimiento', 'Mantenimiento', 'dependencia', 'transferencia', 850000),
    empleado(pRaul, 'Portero', 'Portería', 'dependencia', 'efectivo', 720000),
    empleado(pAux, 'Recepcionista', 'Revisión médica', 'monotributo', 'transferencia', 450000),
    empleado(persona('Estela', 'Medina', '1971-01-15', { tipo: 'empleado' }), 'Limpieza', 'Mantenimiento', 'dependencia', 'efectivo', 690000),
    empleado(persona('Walter', 'Flores', '1983-04-28', { tipo: 'empleado' }), 'Guardavidas', 'Natatorio', 'monotributo', 'transferencia', 610000),
  ];
  for (const per of [periodoAntes, periodoAnterior]) {
    for (const e of empleados) {
      const emp = db.prepare('SELECT * FROM empleados WHERE id = ?').get(e);
      const desc = emp.tipo_vinculo === 'dependencia' ? Math.round(emp.remuneracion_base * 0.17) : 0;
      ins('remuneraciones', { empleado_id: e, periodo: per, bruto: emp.remuneracion_base, descuentos: desc, neto: emp.remuneracion_base - desc, medio_pago: emp.forma_pago, estado: 'pagada', pagada_en: `${per}-05T12:00:00.000Z`, caja_id: emp.forma_pago === 'efectivo' ? caja.efectivo : caja.banco });
      ins('movimientos_caja', { caja_id: emp.forma_pago === 'efectivo' ? caja.efectivo : caja.banco, fecha: `${per}-05T12:00:00.000Z`, tipo: 'egreso', importe: -(emp.remuneracion_base - desc), concepto: `Sueldo ${per}`, ref_tipo: 'remuneracion' });
    }
  }

  // ---------- Proveedores, gastos y compras ----------
  const catGasto = {};
  for (const n of ['Mantenimiento edilicio', 'Natatorio: químicos y climatización', 'Servicios (luz, gas, agua)', 'Limpieza', 'Material deportivo', 'Administración', 'Eventos', 'Seguros']) catGasto[n] = ins('categorias_gasto', { nombre: n });
  const prov = {
    quimicos: ins('proveedores', { razon_social: 'Piletas del Sur SRL', cuit: '30-71234567-8', rubro: 'Químicos para piletas', contacto: 'ventas@piletasdelsur.com.ar', condicion_pago: '30 días' }),
    corralon: ins('proveedores', { razon_social: 'Corralón El Progreso', cuit: '30-70999888-1', rubro: 'Materiales de construcción', contacto: '4253-1111', condicion_pago: 'Contado' }),
    deportes: ins('proveedores', { razon_social: 'Deportes Quilmes SA', cuit: '30-65432198-7', rubro: 'Indumentaria y material deportivo', contacto: 'deportesquilmes@ejemplo.com', condicion_pago: '15 días' }),
    gas: ins('proveedores', { razon_social: 'Naturgy BAN', cuit: '30-65786206-8', rubro: 'Gas natural', condicion_pago: 'Vencimiento de factura' }),
  };
  const gastos = [
    [periodoAntes, 'Natatorio: químicos y climatización', 'Cloro y regulador de pH', 385000, 'transferencia', prov.quimicos],
    [periodoAntes, 'Servicios (luz, gas, agua)', 'Factura de gas — calderas natatorio', 1250000, 'transferencia', prov.gas],
    [periodoAnterior, 'Mantenimiento edilicio', 'Cemento y arena para vereda del parque', 142000, 'efectivo', prov.corralon],
    [periodoAnterior, 'Material deportivo', 'Pelotas de básquet x12', 264000, 'transferencia', prov.deportes],
    [periodoAnterior, 'Limpieza', 'Artículos de limpieza vestuarios', 68500, 'efectivo', null],
    [periodoAnterior, 'Servicios (luz, gas, agua)', 'Factura de luz', 890000, 'transferencia', null],
    [periodo, 'Natatorio: químicos y climatización', 'Cloro granulado 50 kg', 412000, 'transferencia', prov.quimicos],
    [periodo, 'Administración', 'Resmas e insumos de impresión', 38500, 'billetera', null],
  ];
  for (const [per, categoria, descripcion, importe, medio, proveedor] of gastos) {
    const cajaG = medio === 'efectivo' ? caja.efectivo : medio === 'billetera' ? caja.mp : caja.banco;
    const id = ins('gastos', { fecha: `${per}-1${Math.floor(azar() * 8)}`, categoria_id: catGasto[categoria], descripcion, importe: $(importe), medio_pago: medio, caja_id: cajaG, proveedor_id: proveedor, estado: importe > 300000 ? 'aprobado' : 'registrado', registrado_por: uConta, aprobado_por: importe > 300000 ? uDirectiva : null });
    ins('movimientos_caja', { caja_id: cajaG, fecha: `${per}-18T12:00:00.000Z`, tipo: 'egreso', importe: -$(importe), concepto: descripcion, ref_tipo: 'gasto', ref_id: id });
  }
  ins('gastos', { fecha: hoy, categoria_id: catGasto['Mantenimiento edilicio'], descripcion: 'Reparación de bomba de recirculación del natatorio', importe: $(680000), medio_pago: 'transferencia', caja_id: caja.banco, estado: 'pendiente_aprobacion', registrado_por: uConta });
  const fact1 = ins('facturas_proveedor', { proveedor_id: prov.quimicos, numero: 'A-0003-00012345', fecha: sumarDias(hoy, -12), vence: sumarDias(hoy, 18), total: $(412000), estado: 'autorizada', cargada_por: uConta, autorizada_por: uDirectiva });
  ins('facturas_proveedor', { proveedor_id: prov.deportes, numero: 'B-0001-00004521', fecha: sumarDias(hoy, -3), vence: sumarDias(hoy, 12), total: $(198000), estado: 'cargada', cargada_por: uConta });
  ins('facturas_proveedor', { proveedor_id: prov.gas, numero: 'B-0099-77712000', fecha: sumarDias(hoy, -5), vence: sumarDias(hoy, 5), total: $(1340000), estado: 'cargada', cargada_por: uConta });
  ins('pagos_proveedor', { factura_id: fact1, caja_id: caja.banco, fecha: sumarDias(hoy, -1), importe: $(200000) });

  // Presupuesto anual
  const anio = Number(hoy.slice(0, 4));
  for (const [rubro, monto, tipo] of [['Cuotas sociales', 52000000, 'ingreso'], ['Aranceles de actividades', 96000000, 'ingreso'], ['Alquileres e invitados', 6000000, 'ingreso'], ['Sponsors y eventos', 9000000, 'ingreso'],
    ['Sueldos y cargas', 72000000, 'egreso'], ['Servicios (luz, gas, agua)', 18000000, 'egreso'], ['Natatorio: químicos y climatización', 9500000, 'egreso'], ['Mantenimiento edilicio', 8000000, 'egreso'], ['Material deportivo', 4500000, 'egreso'], ['Honorarios de profesores', 38000000, 'egreso']]) {
    ins('presupuestos', { anio, rubro, tipo, monto: $(monto) });
  }
  for (const [k, monto] of [['natatorio', 15000000], ['tenis', 2400000], ['basquet_m', 3600000]]) ins('presupuestos', { anio, rubro: 'Presupuesto de actividad', actividad_id: act[k], tipo: 'egreso', monto: $(monto) });

  // Honorarios de profesores
  for (const [clave, id] of Object.entries(profesores)) {
    ins('honorarios', { profesor_id: id, periodo: periodoAntes, clases: 30 + Math.floor(azar() * 20), base: $(9000), monto: $(9000 * (30 + Math.floor(azar() * 20))), estado: 'pagado' });
    ins('honorarios', { profesor_id: id, periodo: periodoAnterior, clases: 30 + Math.floor(azar() * 20), base: $(9000), monto: $(9000 * (30 + Math.floor(azar() * 20))), estado: clave === 'martin' ? 'autorizado' : 'liquidado' });
  }
  ins('periodos_contables', { anio: Number(periodoAntes.slice(0, 4)), mes: Number(periodoAntes.slice(5)), cerrado_en: `${periodoAnterior}-05T18:00:00.000Z`, cerrado_por: uConta });

  // ---------- Mantenimiento ----------
  const sector = {};
  for (const [clave, nombre, espacio, resp] of [['natatorio', 'Natatorio', esp.natatorio, uMant], ['vestuarios', 'Vestuarios', esp.vestuarios, uMant], ['tenis', 'Canchas de tenis', esp.tenis1, uMant2],
    ['micro', 'Microestadio', esp.micro, uMant], ['gimnasio', 'Gimnasio', esp.gimnasio, uMant], ['parque', 'Parque y quincho', esp.parque, uMant2], ['salon', 'Salón social', esp.salon, null], ['administracion', 'Administración', null, null]]) {
    sector[clave] = ins('sectores', { nombre, espacio_id: espacio, responsable_default_id: resp });
  }
  const tickets = [
    ['Pérdida en ducha 3 del vestuario de damas', 'La canilla de la ducha 3 gotea constantemente y se acumula agua.', 'vestuarios', 'plomeria', 'media', 'en_curso', uSocio, uMant, -2],
    ['Luminaria quemada en cancha de tenis 2', 'Dos reflectores del lado norte no encienden. Impide jugar después de las 19.', 'tenis', 'electricidad', 'alta', 'asignado', uProfesor, uMant2, -1],
    ['Fuga de cloro en sala de máquinas', 'Olor fuerte a cloro en la sala de máquinas del natatorio.', 'natatorio', 'pileta', 'urgente', 'resuelto', uProfesor, uMant, -1],
    ['Tablero de básquet flojo', 'El aro del tablero sur se mueve al colgarse.', 'micro', 'carpinteria', 'alta', 'nuevo', uAdmin, null, 0],
    ['Pintura descascarada en salón social', 'Paredes con humedad junto a la ventana.', 'salon', 'pintura', 'baja', 'nuevo', uAdmin, null, -5],
    ['Máquina de poleas sin cable', 'El cable de la polea alta está deshilachado.', 'gimnasio', 'otro', 'media', 'cerrado', uAdmin, uMant, -15],
    ['Pasto alto en parque', 'Cortar el pasto antes del evento del sábado.', 'parque', 'limpieza', 'media', 'asignado', uDirectiva, uMant2, -9],
  ];
  for (const [n, [titulo, descripcion, s, categoria, prioridad, estado, reporta, asignado, dias]] of tickets.entries()) {
    const creado = sumarDias(hoy, dias);
    const plazo = { urgente: 0, alta: 2, media: 7, baja: 30 }[prioridad];
    const id = ins('tickets_mantenimiento', { codigo: `MT-${anio}-${String(n + 1).padStart(4, '0')}`, titulo, descripcion, sector_id: sector[s], categoria, prioridad, estado, reportado_por: reporta, asignado_a: asignado, creado_en: `${creado}T13:00:00.000Z`, vence_en: `${sumarDias(creado, plazo)}T23:59:59`, resuelto_en: ['resuelto', 'cerrado'].includes(estado) ? `${hoy}T10:00:00.000Z` : null, verificado_por: estado === 'cerrado' ? uAdmin : null, verificado_en: estado === 'cerrado' ? ahora : null, costo: estado === 'cerrado' ? $(45000) : 0 });
    ins('ticket_historial', { ticket_id: id, estado_anterior: null, estado_nuevo: 'nuevo', usuario_id: reporta, creado_en: `${creado}T13:00:00.000Z` });
    if (estado !== 'nuevo') ins('ticket_historial', { ticket_id: id, estado_anterior: 'nuevo', estado_nuevo: estado, usuario_id: asignado, creado_en: `${creado}T15:00:00.000Z` });
    if (estado === 'resuelto' || estado === 'cerrado') ins('ticket_comentarios', { ticket_id: id, usuario_id: asignado, texto: 'Trabajo realizado y probado.', creado_en: ahora });
  }
  for (const [nombre, categoria, ubicacion, cantidad, minimo, unidad] of [['Cloro granulado', 'Químicos', 'Sala de máquinas', 3, 5, 'bolsa 25 kg'], ['Regulador de pH', 'Químicos', 'Sala de máquinas', 6, 4, 'bidón'], ['Lámparas LED 150W', 'Electricidad', 'Pañol', 4, 6, 'u'], ['Cinta aisladora', 'Electricidad', 'Pañol', 12, 5, 'u'], ['Lavandina', 'Limpieza', 'Depósito', 20, 10, 'bidón 5 L'], ['Detergente', 'Limpieza', 'Depósito', 8, 10, 'bidón 5 L'], ['Taladro percutor', 'Herramientas', 'Pañol', 2, 1, 'u'], ['Pintura látex blanca', 'Pintura', 'Depósito', 3, 2, 'lata 20 L'], ['Red de tenis', 'Material deportivo', 'Depósito tenis', 1, 2, 'u']]) {
    ins('inventario', { nombre, categoria, ubicacion, cantidad, stock_minimo: minimo, unidad });
  }
  ins('solicitudes_compra', { solicitante_id: uMant, descripcion: 'Cloro granulado 4 bolsas (stock bajo mínimo)', monto_estimado: $(180000), estado: 'pendiente' });
  ins('solicitudes_compra', { solicitante_id: uMant2, descripcion: '6 lámparas LED 150W para canchas de tenis', monto_estimado: $(96000), estado: 'autorizada', autorizada_por: uDirectiva });

  // ---------- Control de acceso ----------
  const punto = (nombre, espacio, actividad, tipo) => ins('puntos_acceso', { nombre, espacio_id: espacio, actividad_id: actividad, tipo_lector: tipo });
  const puntos = {
    natatorio: punto('Ingreso natatorio', esp.natatorio, act.natatorio, 'lector_rele'),
    porteria: punto('Portería principal (Andrade)', null, null, 'movil'),
    gimnasio: punto('Gimnasio de musculación', esp.gimnasio, act.musculacion, 'movil'),
    micro: punto('Microestadio', esp.micro, null, 'movil'),
  };
  // Clave de prueba del lector piloto: "lector-demo-natatorio"
  ins('lectores', { punto_acceso_id: puntos.natatorio, nombre: 'Lector QR + relé (piloto)', api_key_hash: crypto.createHash('sha256').update('lector-demo-natatorio').digest('hex'), ultimo_latido: ahora, firmware: 'v1.0.3' });
  ins('lectores', { punto_acceso_id: puntos.gimnasio, nombre: 'Tablet gimnasio', api_key_hash: crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex'), ultimo_latido: new Date(Date.now() - 3 * 3600000).toISOString(), firmware: 'web' });
  const motivos = [null, null, null, null, null, 'cuota_social', 'apto_medico', 'sin_inscripcion', 'arancel'];
  const conInscripcion = db.prepare(`SELECT i.persona_id, g.actividad_id, g.id AS grupo_id FROM inscripciones i JOIN grupos g ON g.id = i.grupo_id WHERE i.estado = 'activa'`).all();
  for (let d = 0; d < 14; d++) {
    for (let k = 0; k < 18; k++) {
      const x = elegir(conInscripcion);
      const motivo = elegir(motivos);
      ins('accesos', { persona_id: x.persona_id, punto_acceso_id: x.actividad_id === act.natatorio ? puntos.natatorio : x.actividad_id === act.musculacion ? puntos.gimnasio : puntos.porteria, actividad_id: x.actividad_id, grupo_id: x.grupo_id, fecha_hora: `${sumarDias(hoy, -d)}T${String(11 + Math.floor(azar() * 12)).padStart(2, '0')}:${String(Math.floor(azar() * 59)).padStart(2, '0')}:00.000Z`, resultado: motivo ? 'denegado' : 'habilitado', motivo_codigo: motivo, metodo: elegir(['qr_lector', 'qr_profesor', 'qr_porteria']) });
    }
  }
  ins('habilitaciones_manuales', { persona_id: sociosGenerados[7], actividad_id: act.natatorio, tipo: 'excepcion', motivo: 'Certificado en trámite, autorizado por 7 días', desde: hoy, hasta: sumarDias(hoy, 7), estado: 'pendiente', solicitada_por: uAdmin });
  ins('habilitaciones_manuales', { persona_id: sociosGenerados[11], actividad_id: null, tipo: 'bloqueo', motivo: 'Sanción disciplinaria (Res. 14/2026)', desde: sumarDias(hoy, -2), hasta: sumarDias(hoy, 28), estado: 'aprobada', solicitada_por: uAdmin, autorizada_por: uDirectiva });

  // Asistencias de la última semana para los grupos del profesor demo
  for (const g of [grupos.nat_adultos_n, grupos.nat_adultos_m, grupos.nat_escuela]) {
    for (const i of db.prepare(`SELECT id FROM inscripciones WHERE grupo_id = ? AND estado = 'activa'`).pluck().all(g)) {
      for (let d = 1; d <= 6; d++) if (azar() > 0.25) ins('asistencias', { inscripcion_id: i, fecha: sumarDias(hoy, -d), presente: 1, origen: azar() > 0.2 ? 'qr' : 'manual', registrado_por: uProfesor });
    }
  }

  // ---------- Reservas ----------
  for (let d = 0; d < 6; d++) {
    const f = sumarDias(hoy, d);
    ins('reservas', { espacio_id: esp.tenis1, persona_id: elegir(sociosGenerados), inicio: `${f}T21:00:00.000Z`, fin: `${f}T22:00:00.000Z`, tipo: 'socio', importe: 0 });
    ins('reservas', { espacio_id: esp.tenis2, persona_id: null, inicio: `${f}T12:00:00.000Z`, fin: `${f}T13:30:00.000Z`, tipo: 'clase' });
  }
  ins('reservas', { espacio_id: esp.tenis1, persona_id: pLucia, inicio: `${sumarDias(hoy, 2)}T22:00:00.000Z`, fin: `${sumarDias(hoy, 2)}T23:00:00.000Z`, tipo: 'socio' });
  ins('reservas', { espacio_id: esp.salon, persona_id: pGraciela, inicio: `${sumarDias(hoy, 9)}T23:00:00.000Z`, fin: `${sumarDias(hoy, 10)}T03:00:00.000Z`, tipo: 'alquiler', importe: $(320000) });
  ins('bloqueos_espacio', { espacio_id: esp.tenis2, desde: `${sumarDias(hoy, 4)}T11:00:00.000Z`, hasta: `${sumarDias(hoy, 4)}T20:00:00.000Z`, motivo: 'Mantenimiento: recambio de polvo de ladrillo' });
  ins('bloqueos_espacio', { espacio_id: esp.micro, desde: `${sumarDias(hoy, 3)}T12:00:00.000Z`, hasta: `${sumarDias(hoy, 3)}T23:00:00.000Z`, motivo: 'Torneo aniversario de básquet' });

  // ---------- Gobierno y comunicación ----------
  const comunicado = (titulo, cuerpo, audiencia, categoria, publico, por, dias) => ins('comunicados', { titulo, cuerpo, audiencia: JSON.stringify(audiencia), categoria, publico, publicado_por: por, publicado_en: `${sumarDias(hoy, dias)}T13:00:00.000Z` });
  comunicado('Torneo Aniversario: 84 años de Los Cooperarios', 'Convocamos a todas las categorías y familias a la jornada deportiva y asado de camaradería del próximo fin de semana en la sede.', { tipo: 'todos' }, 'institucional', 1, uAdmin, -2);
  comunicado('Renovación de calderas del natatorio', 'Finalizamos las obras de climatización para asegurar la temperatura óptima durante toda la temporada.', { tipo: 'todos' }, 'natatorio', 1, uAdmin, -7);
  comunicado('Corte de agua programado en vestuarios', 'Hoy desde las 14 hs los vestuarios principales estarán fuera de servicio por cambio de válvula.', { tipo: 'todos' }, 'mantenimiento', 0, uAdmin, 0);
  comunicado('Natación adultos noche: cambio de andarivel', 'Desde el lunes el grupo de adultos noche usa los andariveles 4 a 6.', { tipo: 'grupo', id: grupos.nat_adultos_n }, 'actividad', 0, uProfesor, -1);
  comunicado('Tenis: nuevo reglamento de reservas', 'Las reservas se toman con hasta 7 días de anticipación y se cancelan con 12 horas de aviso.', { tipo: 'actividad', id: act.tenis }, 'actividad', 0, uAdmin, -4);
  for (const [nombre, categoria, rol] of [['Estatuto social', 'reglamento', 'todos'], ['Reglamento de reservas de tenis 2026', 'reglamento', 'todos'], ['Reglamento del natatorio', 'reglamento', 'todos'], ['Formulario de alta de socio', 'formulario', 'todos'], ['Circular 03/2026: protocolo de emergencias', 'circular', 'admin,mantenimiento,profesor'], ['Política de privacidad y datos personales', 'reglamento', 'todos']]) {
    ins('documentos', { nombre, categoria, rol_visible: rol });
  }
  const reunion = ins('reuniones', { tipo: 'ordinaria', fecha: sumarDias(hoy, -6), estado: 'acta_aprobada', orden_del_dia: '1. Estado financiero\n2. Obras del natatorio\n3. Plataforma digital' });
  ins('resoluciones', { reunion_id: reunion, numero: 'Res. 15/2026', texto: 'Aprobar la Fase 0 de la plataforma digital del club.', responsable_id: pGraciela, estado: 'en_curso', vence_en: sumarDias(hoy, 14) });
  ins('resoluciones', { reunion_id: reunion, numero: 'Res. 16/2026', texto: 'Contratar el reemplazo de la bomba de recirculación del natatorio.', responsable_id: pCarlos, estado: 'pendiente', vence_en: sumarDias(hoy, 7) });
  ins('reuniones', { tipo: 'ordinaria', fecha: sumarDias(hoy, 8), estado: 'convocada', orden_del_dia: '1. Aprobación de balance trimestral\n2. Torneo aniversario' });
  ins('reuniones', { tipo: 'subcomision', subcomision_id: sub.tenis, fecha: sumarDias(hoy, 3), estado: 'convocada', orden_del_dia: 'Recambio de polvo de ladrillo' });
  const uDelegado = usuario(pGraciela, 'subcomision@demo.coop', [['subcomision', act.tenis], 'socio']);
  ins('pedidos_cambio', { solicitante_id: uDelegado, origen: 'representante_actividad', actividad_id: act.tenis, tipo: 'nueva_seccion', titulo: 'Ranking interno de tenis', justificacion: 'Queremos publicar un ranking mensual de socios con los resultados de los torneos internos.', prioridad: 'media', estado: 'en_analisis' });
  ins('pedidos_cambio', { solicitante_id: uDirectiva, origen: 'comision_directiva', tipo: 'nuevo_rol', titulo: 'Rol de cantinero/a del buffet', justificacion: 'El concesionario del buffet necesita ver solo el padrón de invitados del día.', prioridad: 'baja', estado: 'recibido' });
  ins('solicitudes', { persona_id: null, tipo: 'alta', estado: 'pendiente', datos_json: JSON.stringify({ nombre: 'Valeria', apellido: 'Paz', dni: '41222333', fecha_nacimiento: '1998-03-14', email: 'valeria.paz@ejemplo.com', telefono: '11-5555-1212', categoria: 'Adulto', consentimiento_version: '2026-10' }) });
  ins('solicitudes', { persona_id: pLucia, tipo: 'reclamo', estado: 'pendiente', datos_json: JSON.stringify({ detalle: 'El agua de las duchas sale fría a la noche.' }) });
  ins('solicitudes', { persona_id: sociosGenerados[3], tipo: 'baja', estado: 'pendiente', datos_json: JSON.stringify({ motivo: 'Mudanza' }) });
  ins('solicitudes', { persona_id: sociosGenerados[5], tipo: 'derechos_datos', estado: 'pendiente', datos_json: JSON.stringify({ derecho: 'acceso', detalle: 'Quiero saber qué datos míos tiene el club.' }) });
  for (const [u, tipo, titulo, ref] of [[uSocio, 'pago', 'Tu cuota social vence el día 10', '/socio/pagos'], [uSocio, 'revision_medica', 'Emma: certificado recibido, pendiente de validación', '/socio/revision-medica'], [uAdmin, 'solicitud', 'Nueva solicitud de alta de socio', '/admin/solicitudes'], [uMant, 'ticket', 'Se te asignó el ticket de vestuarios', '/mantenimiento/inicio'], [uMedico, 'revision_medica', 'Un certificado externo espera validación', '/medico/certificados']]) {
    ins('notificaciones', { usuario_id: u, tipo, titulo, referencia: ref });
  }

  // Auditoría inicial
  ins('auditoria', { usuario_id: uSistemas, accion: 'seed', entidad: 'sistema', despues: JSON.stringify({ mensaje: 'Base de demostración creada' }), creado_en: ahora });
  return { usuarios: { uSocio, uProfesor, uAdmin, uConta, uDirectiva, uDelegado, uMant, uMedico, uAux, uSistemas }, act, grupos, puntos, pLucia, pEmma, pTeo, insLuciaNat, insLuciaYoga, insEmma, insTeo };
}

// Ejecución directa: node src/db/seed.js [--reset]
if (process.argv[1]?.replace(/\\/g, '/').endsWith('src/db/seed.js')) {
  if (process.argv.includes('--reset')) {
    for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(config.dbFile + sufijo, { force: true });
  }
  const db = abrirBase();
  migrar(db);
  setDb(db);
  if (db.prepare('SELECT COUNT(*) FROM usuarios').pluck().get() > 0) {
    console.log('La base ya tiene datos. Usá "npm run db:reset" para recrearla.');
  } else {
    db.transaction(() => sembrar(db))();
    console.log(`Base de demostración creada en ${config.dbFile}`);
    console.log(`Usuarios demo (contraseña "${PASSWORD_DEMO}"): socio, profesor, admin, contabilidad, directiva, subcomision, mantenimiento, porteria, medico, auxiliar, sistemas @demo.coop`);
  }
}
