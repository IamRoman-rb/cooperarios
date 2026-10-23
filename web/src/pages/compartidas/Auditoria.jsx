import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { fechaHora, relativa, capitalizar } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Tabla, Buscador, Selector, Modal, Aviso, Pestanas } from '../../components/ui.jsx';

/** Registro de cambios sensibles (usuario, fecha, valores anterior y posterior). Sistemas lo ve sin valores. */
export default function Auditoria({ tecnico }) {
  const [f, setF] = useState({ entidad: '', accion: '', usuario: '' });
  const [detalle, setDetalle] = useState(null);
  const [vista, setVista] = useState('cambios');
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const q = useDatos(`/api/sistema/logs?${params}&limite=200`, { placeholderData: (p) => p });
  const formatear = (t) => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; } };
  return (
    <>
      <Encabezado titulo={tecnico ? 'Registros técnicos' : 'Auditoría'} subtitulo={tecnico ? 'Auditoría técnica y accesos al sistema. Sin datos de personas.' : 'Altas y bajas, cargos, pagos, habilitaciones manuales, resultados médicos y cambios de rol.'} />
      {tecnico && <div className="mb-space-md"><Aviso tono="info">Los valores anterior y posterior se ocultan al rol Sistemas porque pueden contener datos personales o financieros.</Aviso></div>}
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'cambios', label: 'Cambios', icono: 'history' }, { value: 'sesiones', label: 'Sesiones activas', icono: 'devices' }]} />
      <Consulta q={q}>
        {(d) => vista === 'sesiones' ? (
          <Tarjeta cuerpo="p-space-md">
            <Tabla compacta clave="email" columnas={[{ k: 'email', t: 'Usuario' }, { k: 'ip', t: 'IP' }, { k: 'dispositivo', t: 'Dispositivo', className: 'max-w-xs truncate' }, { k: 'ultima_actividad', t: 'Última actividad', r: (s) => relativa(s.ultima_actividad) }]} filas={d.accesos} />
          </Tarjeta>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-2 mb-space-md">
              <Selector value={f.entidad} onChange={(e) => setF({ ...f, entidad: e.target.value })} vacio="Toda entidad" opciones={d.entidades.map((e) => ({ value: e, label: capitalizar(e) }))} />
              <Buscador valor={f.accion} onChange={(v) => setF({ ...f, accion: v })} placeholder="Acción" />
              <Buscador valor={f.usuario} onChange={(v) => setF({ ...f, usuario: v })} placeholder="Usuario" />
            </div>
            <Tarjeta cuerpo="p-space-md">
              <Tabla compacta onFila={tecnico ? undefined : (r) => (r.antes || r.despues) && setDetalle(r)} columnas={[
                { k: 'creado_en', t: 'Fecha', r: (r) => fechaHora(r.creado_en) },
                { k: 'usuario', t: 'Usuario', r: (r) => r.usuario ?? r.email ?? 'Sistema' },
                { k: 'accion', t: 'Acción', r: (r) => <span className="font-mono text-body-sm">{r.accion}</span> },
                { k: 'entidad', t: 'Entidad', r: (r) => `${r.entidad}${r.entidad_id ? ` #${r.entidad_id}` : ''}` },
                { k: 'ip', t: 'IP' },
              ]} filas={d.filas} />
            </Tarjeta>
          </>
        )}
      </Consulta>
      <Modal abierto={!!detalle} titulo={detalle ? `${detalle.accion} · ${detalle.entidad}` : ''} onCerrar={() => setDetalle(null)} ancho="max-w-2xl">
        {detalle && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div><p className="etiqueta mb-1">Antes</p><pre className="p-3 rounded-xl bg-surface text-body-sm overflow-auto max-h-80">{detalle.antes ? formatear(detalle.antes) : '—'}</pre></div>
            <div><p className="etiqueta mb-1">Después</p><pre className="p-3 rounded-xl bg-surface text-body-sm overflow-auto max-h-80">{detalle.despues ? formatear(detalle.despues) : '—'}</pre></div>
          </div>
        )}
      </Modal>
    </>
  );
}
