import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, fecha, hoy, aCentavos, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Pestanas, Modal, Campo, Entrada, Selector, Casilla, Aviso } from '../../components/ui.jsx';

/** Cuota social, aranceles por frecuencia, valores socio y no socio, descuentos y vigencias. */
export default function Tarifario() {
  const q = useDatos('/api/actividades/tarifario/todo');
  const act = useDatos('/api/actividades');
  const [vista, setVista] = useState('aranceles');
  const [actividad, setActividad] = useState('');
  const [arancel, setArancel] = useState(null);
  const [descuento, setDescuento] = useState(null);
  const [cuota, setCuota] = useState(null);
  const nuevoArancel = useAccion(() => api.post('/api/actividades/tarifario/aranceles', { ...arancel, actividad_id: arancel.actividad_id, frecuencia: Number(arancel.frecuencia), valor_socio: aCentavos(arancel.valor_socio), valor_no_socio: aCentavos(arancel.valor_no_socio), vigente_hasta: arancel.vigente_hasta || null }), { ok: 'Nuevo valor vigente', invalidar: ['/api/actividades'], alTerminar: () => setArancel(null) });
  const guardarDescuento = useAccion(() => api.post('/api/actividades/tarifario/descuentos', { ...descuento, valor: descuento.tipo === 'monto' ? aCentavos(descuento.valor) : Number(descuento.valor) }), { ok: 'Descuento guardado', invalidar: ['/api/actividades'], alTerminar: () => setDescuento(null) });
  const guardarCuota = useAccion(() => api.put(`/api/actividades/tarifario/categorias/${cuota.id}`, { valor: aCentavos(cuota.valor) }), { ok: 'Cuota actualizada', invalidar: ['/api/actividades', '/api/padron'], alTerminar: () => setCuota(null) });
  return (
    <>
      <Encabezado titulo="Tarifario y aranceles" subtitulo="Los nuevos valores cierran la vigencia del anterior: el historial queda registrado." />
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'aranceles', label: 'Aranceles' }, { value: 'cuota', label: 'Cuota social' }, { value: 'descuentos', label: 'Descuentos' }]} />
      <Consulta q={q}>
        {(d) => (
          <>
            {vista === 'aranceles' && (
              <Tarjeta cuerpo="p-space-md" accion={<div className="flex flex-wrap gap-2"><Selector value={actividad} onChange={(e) => setActividad(e.target.value)} vacio="Todas" opciones={(act.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))} className="w-full sm:w-56" /><Boton icono="add" onClick={() => setArancel({ actividad_id: actividad || act.data?.[0]?.id, frecuencia: 1, descripcion: '', valor_socio: '', valor_no_socio: '', vigente_desde: hoy(), vigente_hasta: '' })}>Nuevo valor</Boton></div>} titulo="Aranceles por frecuencia">
                <Tabla compacta columnas={[
                  { k: 'actividad', t: 'Actividad' },
                  { k: 'descripcion', t: 'Frecuencia', r: (a) => a.descripcion ?? `${a.frecuencia}x semana` },
                  { k: 'valor_socio', t: 'Socio', derecha: true, r: (a) => <strong>{pesos(a.valor_socio)}</strong> },
                  { k: 'valor_no_socio', t: 'No socio', derecha: true, r: (a) => pesos(a.valor_no_socio) },
                  { k: 'vigencia', t: 'Vigencia', r: (a) => `${fecha(a.vigente_desde)} → ${a.vigente_hasta ? fecha(a.vigente_hasta) : 'sin fin'}` },
                  { k: 'vigente', t: '', r: (a) => <Estado tono={a.vigente ? 'exito' : 'neutro'} texto={a.vigente ? 'Vigente' : 'Histórico'} /> },
                ]} filas={d.aranceles.filter((a) => !actividad || String(a.actividad_id) === String(actividad))} />
              </Tarjeta>
            )}
            {vista === 'cuota' && (
              <Tarjeta titulo="Cuota social por categoría" icono="card_membership" cuerpo="p-space-md space-y-2">
                {d.categorias.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface">
                    <div><p className="font-label-lg text-label-lg">{c.nombre}</p><p className="text-body-sm text-secondary">{c.regla_cuota.tipo === 'familia' ? `Regla por grupo familiar desde ${c.regla_cuota.min} integrantes (c/u)` : `${c.edad_min ?? 0}${c.edad_max ? ` a ${c.edad_max}` : '+'} años`}</p></div>
                    <div className="flex items-center gap-3"><span className="text-headline-sm font-bold">{pesos(c.regla_cuota.valor)}</span><Boton chico variante="suave" icono="edit" onClick={() => setCuota({ id: c.id, nombre: c.nombre, valor: String(c.regla_cuota.valor / 100) })}>Cambiar</Boton></div>
                  </div>
                ))}
                <Aviso tono="info">Los cambios se aplican desde la próxima generación de cargos mensuales. Los cargos ya emitidos no se modifican.</Aviso>
              </Tarjeta>
            )}
            {vista === 'descuentos' && (
              <Tarjeta titulo="Descuentos" icono="percent" accion={<Boton icono="add" onClick={() => setDescuento({ nombre: '', tipo: 'porcentaje', valor: '', condicion: 'manual', solo_socios: true, activo: true })}>Nuevo</Boton>} cuerpo="p-space-md">
                <Tabla columnas={[
                  { k: 'nombre', t: 'Descuento' },
                  { k: 'valor', t: 'Valor', r: (x) => (x.tipo === 'porcentaje' ? `${x.valor}%` : pesos(x.valor)) },
                  { k: 'condicion', t: 'Condición', r: (x) => capitalizar(x.condicion) },
                  { k: 'solo_socios', t: 'Alcance', r: (x) => (x.solo_socios ? 'Solo socios' : 'Socios y no socios') },
                  { k: 'activo', t: 'Estado', r: (x) => <Estado valor={x.activo ? 'activo' : 'baja'} texto={x.activo ? 'Activo' : 'Inactivo'} /> },
                  { k: 'e', t: '', r: (x) => <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setDescuento({ ...x, valor: x.tipo === 'monto' ? String(x.valor / 100) : x.valor, solo_socios: !!x.solo_socios, activo: !!x.activo })} /> },
                ]} filas={d.descuentos} />
              </Tarjeta>
            )}
          </>
        )}
      </Consulta>
      <Modal abierto={!!arancel} titulo="Nuevo valor de arancel" onCerrar={() => setArancel(null)} pie={<Boton cargando={nuevoArancel.isPending} onClick={() => nuevoArancel.mutate()}>Guardar</Boton>}>
        {arancel && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Actividad" className="sm:col-span-2"><Selector value={arancel.actividad_id} onChange={(e) => setArancel({ ...arancel, actividad_id: e.target.value })} opciones={(act.data ?? []).map((a) => ({ value: a.id, label: a.nombre }))} /></Campo>
            <Campo etiqueta="Veces por semana (0 = pase libre)"><Entrada type="number" min="0" max="7" value={arancel.frecuencia} onChange={(e) => setArancel({ ...arancel, frecuencia: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción"><Entrada value={arancel.descripcion} onChange={(e) => setArancel({ ...arancel, descripcion: e.target.value })} placeholder="2 veces por semana" /></Campo>
            <Campo etiqueta="Valor socio ($)"><Entrada type="number" value={arancel.valor_socio} onChange={(e) => setArancel({ ...arancel, valor_socio: e.target.value })} /></Campo>
            <Campo etiqueta="Valor no socio ($)"><Entrada type="number" value={arancel.valor_no_socio} onChange={(e) => setArancel({ ...arancel, valor_no_socio: e.target.value })} /></Campo>
            <Campo etiqueta="Vigente desde"><Entrada type="date" value={arancel.vigente_desde} onChange={(e) => setArancel({ ...arancel, vigente_desde: e.target.value })} /></Campo>
            <Campo etiqueta="Vigente hasta (opcional)"><Entrada type="date" value={arancel.vigente_hasta} onChange={(e) => setArancel({ ...arancel, vigente_hasta: e.target.value })} /></Campo>
          </div>
        )}
      </Modal>
      <Modal abierto={!!descuento} titulo="Descuento" onCerrar={() => setDescuento(null)} pie={<Boton cargando={guardarDescuento.isPending} onClick={() => guardarDescuento.mutate()}>Guardar</Boton>}>
        {descuento && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={descuento.nombre} onChange={(e) => setDescuento({ ...descuento, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><Selector value={descuento.tipo} onChange={(e) => setDescuento({ ...descuento, tipo: e.target.value })} opciones={[{ value: 'porcentaje', label: 'Porcentaje' }, { value: 'monto', label: 'Monto fijo' }]} /></Campo>
            <Campo etiqueta={descuento.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto ($)'}><Entrada type="number" value={descuento.valor} onChange={(e) => setDescuento({ ...descuento, valor: e.target.value })} /></Campo>
            <Campo etiqueta="Condición" className="sm:col-span-2"><Selector value={descuento.condicion} onChange={(e) => setDescuento({ ...descuento, condicion: e.target.value })} opciones={[{ value: 'jubilado', label: 'Jubilados' }, { value: 'grupo_familiar', label: 'Grupo familiar (3 o más)' }, { value: 'horario_promocional', label: 'Horario promocional (lo elige el socio)' }, { value: 'manual', label: 'Manual' }]} /></Campo>
            <Casilla checked={descuento.solo_socios} onChange={(e) => setDescuento({ ...descuento, solo_socios: e.target.checked })} etiqueta="Solo socios" />
            <Casilla checked={descuento.activo} onChange={(e) => setDescuento({ ...descuento, activo: e.target.checked })} etiqueta="Activo" />
          </div>
        )}
      </Modal>
      <Modal abierto={!!cuota} titulo={`Cuota ${cuota?.nombre ?? ''}`} onCerrar={() => setCuota(null)} pie={<Boton cargando={guardarCuota.isPending} onClick={() => guardarCuota.mutate()}>Guardar</Boton>}>
        <Campo etiqueta="Valor mensual ($)"><Entrada type="number" value={cuota?.valor ?? ''} onChange={(e) => setCuota({ ...cuota, valor: e.target.value })} /></Campo>
      </Modal>
    </>
  );
}
