import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { pesos, fechaHora, periodo, periodoActual, capitalizar } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Tabla, Selector, Kpi, Grilla, Aviso, Boton } from '../../components/ui.jsx';
import { Comprobante } from '../../components/compartidos.jsx';
import { MEDIOS } from '../compartidas/ResumenFinanciero.jsx';

/** Recibos y notas de crédito emitidos (la facturación electrónica ARCA se incorpora en la fase 5). */
export default function Comprobantes() {
  const [per, setPer] = useState(periodoActual());
  const [tipo, setTipo] = useState('');
  const [ver, setVer] = useState(null);
  const q = useDatos(`/api/cobranzas/comprobantes?periodo=${per}${tipo ? `&tipo=${tipo}` : ''}`);
  const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });
  return (
    <>
      <Encabezado titulo="Comprobantes y facturación" subtitulo="Recibos numerados emitidos automáticamente por cada pago."
        acciones={<>
          <Selector value={per} onChange={(e) => setPer(e.target.value)} opciones={meses.map((p) => ({ value: p, label: periodo(p) }))} className="w-44" />
          <Selector value={tipo} onChange={(e) => setTipo(e.target.value)} vacio="Todos" opciones={[{ value: 'recibo', label: 'Recibos' }, { value: 'nota_credito', label: 'Notas de crédito' }]} className="w-44" />
        </>} />
      <Consulta q={q}>
        {(lista) => (
          <>
            <Grilla cols="grid-cols-2 lg:grid-cols-3" className="mb-space-md">
              <Kpi etiqueta="Comprobantes" valor={lista.length} icono="receipt" />
              <Kpi etiqueta="Total recibos" valor={pesos(lista.filter((c) => c.tipo === 'recibo').reduce((s, c) => s + c.total, 0))} icono="payments" tono="exito" />
              <Kpi etiqueta="Notas de crédito" valor={pesos(lista.filter((c) => c.tipo === 'nota_credito').reduce((s, c) => s + c.total, 0))} icono="undo" />
            </Grilla>
            <Tarjeta cuerpo="p-space-md">
              <Tabla compacta columnas={[
                { k: 'numero', t: 'Número', r: (c) => <span className="font-mono">{c.numero}</span> },
                { k: 'tipo', t: 'Tipo', r: (c) => capitalizar(c.tipo) },
                { k: 'fecha', t: 'Fecha', r: (c) => fechaHora(c.fecha) },
                { k: 'persona', t: 'Socio', r: (c) => (c.apellido ? `${c.apellido}, ${c.nombre}` : '—') },
                { k: 'medio', t: 'Medio', r: (c) => MEDIOS[c.medio] ?? capitalizar(c.medio) },
                { k: 'total', t: 'Total', derecha: true, r: (c) => <strong>{pesos(c.total)}</strong> },
                { k: 'v', t: '', r: (c) => <Boton chico variante="fantasma" icono="visibility" onClick={() => setVer(c.id)} aria-label="Ver" /> },
              ]} filas={lista} vacio="Sin comprobantes en el período" />
            </Tarjeta>
            <div className="mt-space-md"><Aviso tono="info">Facturación electrónica ARCA (CAE): fase 5. Hasta entonces se emiten recibos internos numerados.</Aviso></div>
          </>
        )}
      </Consulta>
      <Comprobante id={ver} url={ver ? `/api/cobranzas/comprobantes/${ver}` : null} onCerrar={() => setVer(null)} />
    </>
  );
}
