import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, fecha } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Campo, Entrada, Buscador } from '../../components/ui.jsx';

/** Alta de proveedores y estados de cuenta. */
export default function Proveedores() {
  const q = useDatos('/api/finanzas/proveedores');
  const [texto, setTexto] = useState('');
  const [edicion, setEdicion] = useState(null);
  const [ver, setVer] = useState(null);
  const cuenta = useDatos(ver ? `/api/finanzas/proveedores/${ver}` : null);
  const guardar = useAccion(() => api.post('/api/finanzas/proveedores', { ...edicion, cuit: edicion.cuit || undefined }), { ok: 'Proveedor guardado', invalidar: ['/api/finanzas'], alTerminar: () => setEdicion(null) });
  return (
    <>
      <Encabezado titulo="Proveedores y cuentas corrientes" acciones={<Boton icono="add" onClick={() => setEdicion({ razon_social: '', cuit: '', rubro: '', contacto: '', condicion_pago: '' })}>Nuevo proveedor</Boton>} />
      <Buscador valor={texto} onChange={setTexto} placeholder="Buscar proveedor o rubro" className="mb-space-md" />
      <Tarjeta cuerpo="p-space-md">
        <Consulta q={q}>
          {(lista) => (
            <Tabla onFila={(p) => setVer(p.id)} columnas={[
              { k: 'razon_social', t: 'Proveedor', r: (p) => <div><p className="font-semibold">{p.razon_social}</p><p className="text-body-sm text-secondary">CUIT {p.cuit ?? '—'} · {p.rubro ?? ''}</p></div> },
              { k: 'condicion_pago', t: 'Condición' },
              { k: 'facturado', t: 'Facturado', derecha: true, r: (p) => pesos(p.facturado) },
              { k: 'pagado', t: 'Pagado', derecha: true, r: (p) => pesos(p.pagado) },
              { k: 'saldo', t: 'Saldo', derecha: true, r: (p) => <strong className={p.saldo > 0 ? 'text-critico' : ''}>{pesos(p.saldo)}</strong> },
              { k: 'e', t: '', r: (p) => <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={(e) => { e.stopPropagation(); setEdicion({ ...p, cuit: p.cuit ?? '', rubro: p.rubro ?? '', contacto: p.contacto ?? '', condicion_pago: p.condicion_pago ?? '' }); }} /> },
            ]} filas={lista.filter((p) => `${p.razon_social} ${p.rubro}`.toLowerCase().includes(texto.toLowerCase()))} />
          )}
        </Consulta>
      </Tarjeta>
      <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar proveedor' : 'Nuevo proveedor'} onCerrar={() => setEdicion(null)} pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
        {edicion && (
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Razón social" className="sm:col-span-2"><Entrada value={edicion.razon_social} onChange={(e) => setEdicion({ ...edicion, razon_social: e.target.value })} /></Campo>
            <Campo etiqueta="CUIT" ayuda="30-12345678-9"><Entrada value={edicion.cuit} onChange={(e) => setEdicion({ ...edicion, cuit: e.target.value })} /></Campo>
            <Campo etiqueta="Rubro"><Entrada value={edicion.rubro} onChange={(e) => setEdicion({ ...edicion, rubro: e.target.value })} /></Campo>
            <Campo etiqueta="Contacto"><Entrada value={edicion.contacto} onChange={(e) => setEdicion({ ...edicion, contacto: e.target.value })} /></Campo>
            <Campo etiqueta="Condición de pago"><Entrada value={edicion.condicion_pago} onChange={(e) => setEdicion({ ...edicion, condicion_pago: e.target.value })} /></Campo>
          </div>
        )}
      </Modal>
      <Modal abierto={!!ver} titulo={cuenta.data?.proveedor?.razon_social ?? 'Cuenta corriente'} onCerrar={() => setVer(null)} ancho="max-w-2xl">
        <Consulta q={cuenta}>
          {(d) => (
            <div className="space-y-space-md">
              <p className="etiqueta">Facturas</p>
              <Tabla compacta columnas={[{ k: 'numero', t: 'Número' }, { k: 'fecha', t: 'Fecha', r: (f) => fecha(f.fecha) }, { k: 'vence', t: 'Vence', r: (f) => fecha(f.vence) }, { k: 'total', t: 'Total', derecha: true, r: (f) => pesos(f.total) }, { k: 'estado', t: 'Estado', r: (f) => <Estado valor={f.estado} /> }]} filas={d.facturas} />
              <p className="etiqueta">Pagos</p>
              <Tabla compacta columnas={[{ k: 'fecha', t: 'Fecha', r: (p) => fecha(p.fecha) }, { k: 'numero', t: 'Factura' }, { k: 'importe', t: 'Importe', derecha: true, r: (p) => pesos(p.importe) }]} filas={d.pagos} vacio="Sin pagos" />
            </div>
          )}
        </Consulta>
      </Modal>
    </>
  );
}
