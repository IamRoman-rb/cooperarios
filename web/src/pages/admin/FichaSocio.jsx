import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, fecha, fechaHora, periodo, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Avatar, Dato, Fila, Pestanas, Modal, Campo, Selector, Area, Entrada } from '../../components/ui.jsx';

/** Ficha completa del socio: datos, grupo familiar, inscripciones, habilitación, cuenta, consentimientos e historial. */
export default function FichaSocio() {
  const { id } = useParams();
  const q = useDatos(`/api/padron/socios/${id}`);
  const categorias = useDatos('/api/padron/categorias');
  const [vista, setVista] = useState('resumen');
  const [cambio, setCambio] = useState(null);
  const guardar = useAccion(() => api.put(`/api/padron/socios/${id}`, { ...cambio, categoria_id: cambio.categoria_id || undefined }), { ok: 'Socio actualizado', invalidar: ['/api/padron'], alTerminar: () => setCambio(null) });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado volver="/socios" titulo={`${d.persona.apellido}, ${d.persona.nombre}`} subtitulo={d.socio ? `Socio N° ${d.socio.nro_socio} · ${d.socio.categoria} · alta ${fecha(d.socio.fecha_alta)}` : 'No socio'}
            acciones={d.socio && <Boton variante="suave" icono="edit" onClick={() => setCambio({ estado: d.socio.estado, categoria_id: d.socio.categoria_id, motivo: '', email: d.persona.email ?? '', telefono: d.persona.telefono ?? '' })}>Modificar</Boton>} />
          <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'resumen', label: 'Resumen' }, { value: 'cuenta', label: 'Cuenta' }, { value: 'historial', label: 'Historial' }]} />
          {vista === 'resumen' && (
            <div className="grid lg:grid-cols-3 gap-space-md">
              <Tarjeta titulo="Datos" icono="person" cuerpo="p-space-md space-y-space-md">
                <div className="flex items-center gap-3"><Avatar persona={d.persona} tam={56} />{d.socio && <Estado valor={d.socio.estado} />}</div>
                <div className="grid grid-cols-2 gap-3">
                  <Dato etiqueta="DNI" valor={d.persona.dni} />
                  <Dato etiqueta="Edad" valor={`${d.persona.edad} años`} />
                  <Dato etiqueta="Email" valor={d.persona.email} className="col-span-2" />
                  <Dato etiqueta="Teléfono" valor={d.persona.telefono} />
                  <Dato etiqueta="Llave" valor={d.socio?.llave_nro} />
                  <Dato etiqueta="Domicilio" valor={d.persona.domicilio} className="col-span-2" />
                  {d.socio?.motivo_baja && <Dato etiqueta="Motivo de baja" valor={d.socio.motivo_baja} className="col-span-2" />}
                </div>
                {d.tutores.length > 0 && <div><p className="etiqueta">Tutor</p>{d.tutores.map((t) => <p key={t.id}>{t.nombre} {t.apellido} ({t.parentesco})</p>)}</div>}
              </Tarjeta>
              <div className="space-y-space-md lg:col-span-2">
                <Tarjeta titulo="Grupo familiar" icono="family_restroom" cuerpo="p-space-md grid sm:grid-cols-2 gap-2">
                  {d.familia.length === 0 ? <p className="text-body-sm text-secondary">Sin grupo familiar.</p> : d.familia.map((f) => (
                    <Fila key={f.id} icono={f.titular ? 'star' : 'person'} titulo={`${f.nombre} ${f.apellido}`} detalle={`N° ${f.nro_socio}${f.titular ? ' · titular' : ''}`} a={`/socios/${f.id}`} derecha={<Estado valor={f.estado} />} />
                  ))}
                </Tarjeta>
                <Tarjeta titulo="Actividades y habilitación" icono="sports" cuerpo="p-space-md">
                  <Tabla compacta columnas={[
                    { k: 'actividad', t: 'Actividad', r: (i) => `${i.actividad} · ${i.grupo}` },
                    { k: 'desde', t: 'Desde', r: (i) => fecha(i.desde) },
                    { k: 'estado', t: 'Estado', r: (i) => <Estado valor={i.estado} /> },
                    { k: 'hab', t: 'Habilitación', r: (i) => { const h = d.habilitacion.find((x) => x.actividad === i.actividad); return h ? <Estado valor={h.habilitado ? 'habilitado' : 'denegado'} texto={h.habilitado ? 'Habilitado' : h.mensaje_operador} /> : '—'; } },
                  ]} filas={d.inscripciones} vacio="Sin inscripciones" />
                </Tarjeta>
                <Tarjeta titulo="Consentimientos" icono="fact_check" cuerpo="p-space-md flex flex-wrap gap-2">
                  {d.consentimientos.map((c, i) => <Estado key={i} tono={c.revocado_en ? 'critico' : 'exito'} texto={`${capitalizar(c.tipo)} v${c.version_texto}`} />)}
                </Tarjeta>
              </div>
            </div>
          )}
          {vista === 'cuenta' && d.cuenta && (
            <Tarjeta titulo={`Deuda ${pesos(d.cuenta.resumen.deuda)} · vencido ${pesos(d.cuenta.resumen.vencido)}`} icono="receipt_long" accion={<Boton chico as="link" to={`/cobranzas?persona=${id}`}>Cobrar</Boton>} cuerpo="p-space-md">
              <Tabla compacta columnas={[
                { k: 'descripcion', t: 'Concepto', r: (c) => `${c.descripcion}` },
                { k: 'periodo', t: 'Período', r: (c) => periodo(c.periodo) },
                { k: 'vencimiento', t: 'Vence', r: (c) => fecha(c.vencimiento) },
                { k: 'saldo', t: 'Saldo', derecha: true, r: (c) => pesos(c.saldo) },
                { k: 'situacion', t: 'Estado', r: (c) => <Estado valor={c.situacion} /> },
              ]} filas={d.cuenta.cargos} />
            </Tarjeta>
          )}
          {vista === 'historial' && (
            <div className="grid lg:grid-cols-2 gap-space-md">
              <Tarjeta titulo="Cambios registrados" icono="history" cuerpo="p-space-md space-y-2">
                {d.historial.length === 0 ? <p className="text-body-sm text-secondary">Sin cambios registrados.</p> : d.historial.map((h, i) => <Fila key={i} icono="edit_note" titulo={capitalizar(h.accion)} detalle={`${fechaHora(h.creado_en)} · ${h.usuario ?? 'Sistema'}`} />)}
              </Tarjeta>
              <Tarjeta titulo="Últimos accesos" icono="door_open" cuerpo="p-space-md space-y-2">
                {d.accesos.map((a, i) => <Fila key={i} icono={a.resultado === 'habilitado' ? 'login' : 'block'} tono={a.resultado === 'habilitado' ? 'exito' : 'critico'} titulo={a.actividad ?? 'Ingreso general'} detalle={`${fechaHora(a.fecha_hora)}${a.motivo_codigo ? ` · ${a.motivo_codigo}` : ''}`} />)}
              </Tarjeta>
            </div>
          )}
          <Modal abierto={!!cambio} titulo="Modificar socio" onCerrar={() => setCambio(null)}
            pie={<Boton cargando={guardar.isPending} disabled={cambio && cambio.estado !== d.socio?.estado && cambio.motivo.length < 3} onClick={() => guardar.mutate()}>Guardar</Boton>}>
            {cambio && (
              <div className="space-y-space-md">
                <Campo etiqueta="Estado"><Selector value={cambio.estado} onChange={(e) => setCambio({ ...cambio, estado: e.target.value })} opciones={['activo', 'suspendido', 'baja'].map((x) => ({ value: x, label: capitalizar(x) }))} /></Campo>
                {cambio.estado !== d.socio.estado && <Campo etiqueta="Motivo (obligatorio)"><Area value={cambio.motivo} onChange={(e) => setCambio({ ...cambio, motivo: e.target.value })} /></Campo>}
                <Campo etiqueta="Categoría"><Selector value={cambio.categoria_id} onChange={(e) => setCambio({ ...cambio, categoria_id: e.target.value })} opciones={(categorias.data ?? []).filter((c) => c.regla_cuota.tipo === 'fija').map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
                <Campo etiqueta="Email"><Entrada value={cambio.email} onChange={(e) => setCambio({ ...cambio, email: e.target.value })} /></Campo>
                <Campo etiqueta="Teléfono"><Entrada value={cambio.telefono} onChange={(e) => setCambio({ ...cambio, telefono: e.target.value })} /></Campo>
                <p className="text-body-sm text-secondary">Los cambios quedan en auditoría con los valores anteriores y nuevos.</p>
              </div>
            )}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
