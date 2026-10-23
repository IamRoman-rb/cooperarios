import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, fechaHora, aCentavos, capitalizar } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Modal, Campo, Entrada, Selector, Area, Kpi, Grilla, Aviso } from '../../components/ui.jsx';

/** Movimientos, arqueo y conciliación de cajas, bancos y billeteras. */
export default function Caja() {
  const [caja, setCaja] = useState('');
  const q = useDatos(`/api/finanzas/caja${caja ? `?caja_id=${caja}` : ''}`);
  const [arqueo, setArqueo] = useState(null);
  const [mov, setMov] = useState(null);
  const contar = useAccion(() => api.post('/api/finanzas/caja/arqueo', { caja_id: Number(arqueo.caja_id), contado: aCentavos(arqueo.contado), observacion: arqueo.observacion || undefined }), { ok: (r) => (r.diferencia ? `Arqueo con diferencia de ${pesos(r.diferencia)}` : 'Arqueo sin diferencias'), invalidar: ['/api/finanzas'], alTerminar: () => setArqueo(null) });
  const mover = useAccion(() => api.post('/api/finanzas/caja/movimientos', { caja_id: Number(mov.caja_id), caja_destino_id: mov.destino ? Number(mov.destino) : undefined, importe: aCentavos(mov.importe), concepto: mov.concepto }), { ok: 'Movimiento registrado', invalidar: ['/api/finanzas'], alTerminar: () => setMov(null) });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Caja y bancos" subtitulo="Saldos por caja, movimientos, arqueos y transferencias internas."
            acciones={<>
              <Boton variante="suave" icono="swap_horiz" onClick={() => setMov({ caja_id: d.cajas[0]?.id, destino: d.cajas[1]?.id, importe: '', concepto: 'Depósito de efectivo en banco' })}>Transferencia interna</Boton>
              <Boton icono="calculate" onClick={() => setArqueo({ caja_id: d.cajas[0]?.id, contado: '', observacion: '' })}>Arqueo</Boton>
            </>} />
          <Grilla cols="grid-cols-2 lg:grid-cols-3" className="mb-space-md">
            {d.cajas.map((c) => <Kpi key={c.id} etiqueta={c.nombre} valor={pesos(c.saldo)} icono={c.tipo === 'efectivo' ? 'payments' : c.tipo === 'banco' ? 'account_balance' : 'wallet'} detalle={c.alias ? `Alias ${c.alias}` : capitalizar(c.tipo)} />)}
          </Grilla>
          <Tarjeta cuerpo="p-space-md" titulo="Movimientos" accion={<Selector value={caja} onChange={(e) => setCaja(e.target.value)} vacio="Todas las cajas" opciones={d.cajas.map((c) => ({ value: c.id, label: c.nombre }))} className="w-56" />}>
            <Tabla compacta columnas={[
              { k: 'fecha', t: 'Fecha', r: (m) => fechaHora(m.fecha) },
              { k: 'caja', t: 'Caja' },
              { k: 'tipo', t: 'Tipo', r: (m) => capitalizar(m.tipo) },
              { k: 'concepto', t: 'Concepto' },
              { k: 'importe', t: 'Importe', derecha: true, r: (m) => <strong className={m.importe < 0 ? 'text-critico' : m.importe > 0 ? 'text-exito' : 'text-secondary'}>{pesos(m.importe)}</strong> },
            ]} filas={d.movimientos} />
          </Tarjeta>
          <Modal abierto={!!arqueo} titulo="Arqueo de caja" onCerrar={() => setArqueo(null)} pie={<Boton cargando={contar.isPending} disabled={arqueo?.contado === ''} onClick={() => contar.mutate()}>Registrar arqueo</Boton>}>
            {arqueo && (
              <div className="space-y-space-md">
                <Campo etiqueta="Caja"><Selector value={arqueo.caja_id} onChange={(e) => setArqueo({ ...arqueo, caja_id: e.target.value })} opciones={d.cajas.map((c) => ({ value: c.id, label: `${c.nombre} (sistema: ${pesos(c.saldo)})` }))} /></Campo>
                <Campo etiqueta="Importe contado ($)"><Entrada type="number" value={arqueo.contado} onChange={(e) => setArqueo({ ...arqueo, contado: e.target.value })} /></Campo>
                <Campo etiqueta="Observación"><Area value={arqueo.observacion} onChange={(e) => setArqueo({ ...arqueo, observacion: e.target.value })} /></Campo>
                <Aviso tono="info">Si hay diferencia, se registra un ajuste con la observación.</Aviso>
              </div>
            )}
          </Modal>
          <Modal abierto={!!mov} titulo="Transferencia entre cajas" onCerrar={() => setMov(null)} pie={<Boton cargando={mover.isPending} disabled={!mov?.importe} onClick={() => mover.mutate()}>Registrar</Boton>}>
            {mov && (
              <div className="grid sm:grid-cols-2 gap-space-md">
                <Campo etiqueta="Desde"><Selector value={mov.caja_id} onChange={(e) => setMov({ ...mov, caja_id: e.target.value })} opciones={d.cajas.map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
                <Campo etiqueta="Hacia"><Selector value={mov.destino} onChange={(e) => setMov({ ...mov, destino: e.target.value })} opciones={d.cajas.map((c) => ({ value: c.id, label: c.nombre }))} /></Campo>
                <Campo etiqueta="Importe ($)"><Entrada type="number" value={mov.importe} onChange={(e) => setMov({ ...mov, importe: e.target.value })} /></Campo>
                <Campo etiqueta="Concepto"><Entrada value={mov.concepto} onChange={(e) => setMov({ ...mov, concepto: e.target.value })} /></Campo>
              </div>
            )}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
