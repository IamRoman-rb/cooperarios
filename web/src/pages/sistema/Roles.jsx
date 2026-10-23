import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { Tarjeta, Encabezado, Consulta, Pestanas, cx } from '../../components/ui.jsx';
import PedidosCambio from '../compartidas/PedidosCambio.jsx';
import Usuarios from '../compartidas/Usuarios.jsx';

const LEYENDA = { P: 'Solo datos propios', L: 'Lectura', Lx: 'Lectura en su ámbito', G: 'Gestión', Gx: 'Gestión en su ámbito', A: 'Aprueba', S: 'Solicita', '-': 'Sin acceso' };
const COLOR = { G: 'bg-primary-container text-on-primary', Gx: 'bg-primary-fixed text-on-primary-fixed', A: 'bg-graphite text-white', L: 'bg-secondary-container text-on-secondary-fixed', Lx: 'bg-surface-container text-on-secondary-fixed-variant', P: 'bg-exito-suave text-exito', S: 'bg-alerta-suave text-alerta', '-': 'text-secondary/50' };

/** Matriz de roles y permisos (propuesta 4.1), usuarios y pedidos de cambio para implementar. */
export default function Roles() {
  const q = useDatos('/api/sistema/roles');
  const [vista, setVista] = useState('matriz');
  return (
    <>
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'matriz', label: 'Matriz', icono: 'grid_on' }, { value: 'usuarios', label: 'Usuarios', icono: 'manage_accounts' }, { value: 'pedidos', label: 'Pedidos de cambio', icono: 'change_circle' }]} />
      {vista === 'usuarios' && <Usuarios />}
      {vista === 'pedidos' && <PedidosCambio tecnico />}
      {vista === 'matriz' && (
        <Consulta q={q}>
          {(d) => (
            <>
              <Encabezado titulo="Roles y permisos" subtitulo="Mínimo privilegio: cada rol ve solo lo necesario. Los cambios se piden y aprueban como pedidos de cambio." />
              <div className="flex flex-wrap gap-2 mb-space-md">
                {Object.entries(LEYENDA).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5 text-body-sm"><span className={cx('px-1.5 rounded font-bold text-label-sm', COLOR[k])}>{k}</span>{v}</span>)}
              </div>
              <Tarjeta cuerpo="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm">
                    <thead>
                      <tr className="border-b border-surface-container">
                        <th className="sticky left-0 bg-surface-container-lowest text-left px-3 py-2 font-label-md uppercase text-graphite">Módulo</th>
                        {d.roles.map((r) => <th key={r.codigo} className="px-2 py-2 font-label-sm uppercase text-graphite whitespace-nowrap" title={`${r.usuarios} usuarios`}>{r.nombre.split(' ')[0]}<br /><span className="font-normal text-secondary normal-case">{r.usuarios} usr.</span></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {d.matriz.map((m) => (
                        <tr key={m.modulo} className="border-b border-surface-container last:border-0">
                          <td className="sticky left-0 bg-surface-container-lowest px-3 py-2 min-w-[220px]">{m.nombre}</td>
                          {d.roles.map((r) => <td key={r.codigo} className="px-2 py-2 text-center"><span className={cx('inline-block min-w-7 px-1 rounded font-bold', COLOR[m.roles[r.codigo]])}>{m.roles[r.codigo]}</span></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            </>
          )}
        </Consulta>
      )}
    </>
  );
}
