import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, fecha, horarios, periodo } from '../../lib/formato.js';
import { Icono, Boton, Tarjeta, Encabezado, Consulta, Estado, Vacio, Modal, Aviso, Dato } from '../../components/ui.jsx';

export default function MisActividades() {
  const q = useDatos('/api/mi/actividades');
  const navegar = useNavigate();
  const [baja, setBaja] = useState(null);
  const pedirBaja = useAccion((id) => api.post(`/api/mi/actividades/${id}/baja`), {
    ok: (r) => `Baja registrada. Se aplica al ${fecha(r.hasta)}.`, invalidar: ['/api/mi'], alTerminar: () => setBaja(null),
  });
  return (
    <>
      <Encabezado titulo="Mis actividades" subtitulo="Días y horarios, monto del período, vencimiento y habilitación."
        acciones={<Boton as="link" to="/mis-actividades/explorar" icono="add">Inscribirme en otra</Boton>} />
      <Consulta q={q}>
        {(lista) => lista.length === 0 ? (
          <Vacio icono="sports" titulo="Todavía no estás inscripto/a" texto="Explorá las actividades con vacantes y precios." accion={<Boton as="link" to="/mis-actividades/explorar">Explorar</Boton>} />
        ) : (
          <div className="grid lg:grid-cols-2 gap-space-md">
            {lista.map((i) => (
              <Tarjeta key={i.id} cuerpo="p-0">
                <div className="p-space-md flex items-start gap-3 border-b border-surface-container">
                  <span className="w-12 h-12 rounded-xl bg-primary-fixed text-primary flex items-center justify-center shrink-0"><Icono n={i.icono ?? 'sports'} tam={26} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-headline-sm text-headline-sm">{i.actividad}</h2>
                      {i.estado !== 'activa' && <Estado valor={i.estado} />}
                    </div>
                    <p className="text-body-sm text-secondary">{i.grupo} · {i.persona_nombre}</p>
                  </div>
                  <Estado valor={i.habilitado ? 'habilitado' : 'denegado'} texto={i.habilitado ? 'Habilitado' : 'No habilitado'} />
                </div>
                <div className="p-space-md space-y-3">
                  <div className="flex items-start gap-2 text-body-md"><Icono n="schedule" className="text-secondary mt-0.5" tam={18} /><span>{horarios(i.horarios)}</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <Dato etiqueta="Profesor" valor={i.profesor ?? '—'} />
                    <Dato etiqueta="Espacio" valor={i.horarios[0]?.espacio} />
                    <Dato etiqueta={`Monto ${periodo(i.periodo)}`} valor={pesos(i.monto)} />
                    <Dato etiqueta="Fecha límite" valor={fecha(i.fecha_limite)} />
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface">
                    <div className="flex items-center gap-2">
                      <Estado valor={i.estado_pago} />
                      {i.apto?.requiere && <Estado valor={i.apto.vigente ? 'apto' : i.apto.estado} texto={i.apto.vigente ? `Apto hasta ${fecha(i.apto.vence_en)}` : `Apto: ${i.apto.estado.replace('_', ' ')}`} />}
                    </div>
                    {i.saldo > 0 && <Boton chico icono="payments" onClick={() => navegar('/pagos')}>Pagar {pesos(i.saldo)}</Boton>}
                  </div>
                  {!i.habilitado && i.motivo && <Aviso tono="alerta">{i.motivo}</Aviso>}
                  {i.estado === 'baja_solicitada'
                    ? <p className="text-body-sm text-secondary">Baja solicitada: se aplica al {fecha(i.hasta)}.</p>
                    : <button className="text-label-md text-secondary hover:text-primary-container" onClick={() => setBaja(i)}>Pedir la baja de esta actividad</button>}
                </div>
              </Tarjeta>
            ))}
          </div>
        )}
      </Consulta>
      <Modal abierto={!!baja} titulo="Pedir la baja" onCerrar={() => setBaja(null)}
        pie={<><Boton variante="suave" onClick={() => setBaja(null)}>Cancelar</Boton><Boton variante="peligro" cargando={pedirBaja.isPending} onClick={() => pedirBaja.mutate(baja.id)}>Confirmar baja</Boton></>}>
        <p className="text-body-md">La baja de <strong>{baja?.actividad}</strong> ({baja?.persona_nombre}) se aplica al fin del período en curso y no se generan cargos futuros. El lugar se ofrece a la lista de espera.</p>
      </Modal>
    </>
  );
}
