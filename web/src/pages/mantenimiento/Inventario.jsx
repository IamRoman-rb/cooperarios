import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Modal, Campo, Entrada, Buscador, Kpi, Grilla } from '../../components/ui.jsx';

/** Herramientas e insumos, stock mínimo y reposición. */
export default function Inventario() {
  const q = useDatos('/api/inventario');
  const [texto, setTexto] = useState('');
  const [edicion, setEdicion] = useState(null);
  const [mov, setMov] = useState(null);
  const guardar = useAccion(() => api.post('/api/inventario', { ...edicion, cantidad: Number(edicion.cantidad), stock_minimo: Number(edicion.stock_minimo) }), { ok: 'Ítem guardado', invalidar: ['/api/inventario'], alTerminar: () => setEdicion(null) });
  const mover = useAccion(() => api.post(`/api/inventario/${mov.item.id}/movimiento`, { delta: Number(mov.delta) * (mov.tipo === 'salida' ? -1 : 1), motivo: mov.motivo }), { ok: 'Stock actualizado', invalidar: ['/api/inventario'], alTerminar: () => setMov(null) });
  return (
    <Consulta q={q}>
      {(lista) => (
        <>
          <Encabezado titulo="Inventario y pañol" subtitulo="Cuando un insumo queda bajo el mínimo, pedí la reposición en Solicitudes de compra."
            acciones={<Boton icono="add" onClick={() => setEdicion({ nombre: '', categoria: '', ubicacion: '', cantidad: 0, stock_minimo: 0, unidad: 'u' })}>Nuevo ítem</Boton>} />
          <Grilla cols="grid-cols-2" className="mb-space-md">
            <Kpi etiqueta="Ítems" valor={lista.length} icono="inventory_2" />
            <Kpi etiqueta="Bajo mínimo" valor={lista.filter((i) => i.bajo_minimo).length} icono="warning" tono="critico" a="/mantenimiento/solicitudes-compra" />
          </Grilla>
          <Buscador valor={texto} onChange={setTexto} placeholder="Buscar insumo o herramienta" className="mb-space-md" />
          <Tarjeta cuerpo="p-space-md">
            <Tabla columnas={[
              { k: 'nombre', t: 'Ítem', r: (i) => <div><p className="font-semibold">{i.nombre}</p><p className="text-body-sm text-secondary">{i.categoria} · {i.ubicacion}</p></div> },
              { k: 'cantidad', t: 'Stock', derecha: true, r: (i) => <span className={i.bajo_minimo ? 'text-critico font-bold' : 'font-semibold'}>{i.cantidad} {i.unidad}</span> },
              { k: 'stock_minimo', t: 'Mínimo', derecha: true },
              { k: 'estado', t: '', r: (i) => (i.bajo_minimo ? <Estado tono="critico" texto="Reponer" /> : <Estado tono="exito" texto="OK" />) },
              { k: 'acc', t: '', derecha: true, r: (i) => (
                <div className="flex justify-end gap-1">
                  <Boton chico variante="suave" onClick={() => setMov({ item: i, tipo: 'salida', delta: 1, motivo: '' })}>− Usar</Boton>
                  <Boton chico variante="suave" onClick={() => setMov({ item: i, tipo: 'entrada', delta: 1, motivo: 'Reposición' })}>+ Ingresar</Boton>
                  <Boton chico variante="fantasma" icono="edit" aria-label="Editar" onClick={() => setEdicion(i)} />
                </div>
              ) },
            ]} filas={lista.filter((i) => `${i.nombre} ${i.categoria}`.toLowerCase().includes(texto.toLowerCase()))} />
          </Tarjeta>
          <Modal abierto={!!edicion} titulo={edicion?.id ? 'Editar ítem' : 'Nuevo ítem'} onCerrar={() => setEdicion(null)} pie={<Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}>
            {edicion && (
              <div className="grid sm:grid-cols-2 gap-space-md">
                <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /></Campo>
                <Campo etiqueta="Categoría"><Entrada value={edicion.categoria} onChange={(e) => setEdicion({ ...edicion, categoria: e.target.value })} /></Campo>
                <Campo etiqueta="Ubicación"><Entrada value={edicion.ubicacion ?? ''} onChange={(e) => setEdicion({ ...edicion, ubicacion: e.target.value })} /></Campo>
                <Campo etiqueta="Cantidad"><Entrada type="number" value={edicion.cantidad} onChange={(e) => setEdicion({ ...edicion, cantidad: e.target.value })} /></Campo>
                <Campo etiqueta="Stock mínimo"><Entrada type="number" value={edicion.stock_minimo} onChange={(e) => setEdicion({ ...edicion, stock_minimo: e.target.value })} /></Campo>
                <Campo etiqueta="Unidad"><Entrada value={edicion.unidad} onChange={(e) => setEdicion({ ...edicion, unidad: e.target.value })} /></Campo>
              </div>
            )}
          </Modal>
          <Modal abierto={!!mov} titulo={mov ? `${mov.tipo === 'salida' ? 'Uso' : 'Ingreso'} de ${mov.item.nombre}` : ''} onCerrar={() => setMov(null)} pie={<Boton cargando={mover.isPending} disabled={!mov?.motivo} onClick={() => mover.mutate()}>Registrar</Boton>}>
            {mov && (
              <div className="grid grid-cols-2 gap-space-md">
                <Campo etiqueta="Cantidad"><Entrada type="number" min="1" value={mov.delta} onChange={(e) => setMov({ ...mov, delta: e.target.value })} /></Campo>
                <Campo etiqueta="Motivo"><Entrada value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} placeholder="Ticket MT-…" /></Campo>
              </div>
            )}
          </Modal>
        </>
      )}
    </Consulta>
  );
}
