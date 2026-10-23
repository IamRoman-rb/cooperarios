import { useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { relativa } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Tabla, Kpi, Grilla, Modal, Aviso } from '../../components/ui.jsx';

/** Estado, latidos y claves de los lectores QR. */
export default function Lectores() {
  const q = useDatos('/api/sistema/lectores', { refetchInterval: 30_000 });
  const [clave, setClave] = useState(null);
  const rotar = useAccion((l) => api.post(`/api/acceso/puntos/${l.punto_id}/lectores`, { nombre: l.nombre, lector_id: l.id }), { invalidar: ['/api/sistema'], alTerminar: (r) => setClave(r.clave) });
  return (
    <Consulta q={q}>
      {(lista) => (
        <>
          <Encabezado titulo="Lectores y cerraduras" subtitulo="Cada lector se autentica con su clave por HTTPS y envía un latido periódico." />
          <Grilla cols="grid-cols-3" className="mb-space-md">
            <Kpi etiqueta="Lectores" valor={lista.length} icono="nfc" />
            <Kpi etiqueta="En línea" valor={lista.filter((l) => l.en_linea).length} icono="wifi" tono="exito" />
            <Kpi etiqueta="Sin conexión" valor={lista.filter((l) => !l.en_linea).length} icono="wifi_off" tono="critico" />
          </Grilla>
          <Tarjeta cuerpo="p-space-md">
            <Tabla columnas={[
              { k: 'nombre', t: 'Lector', r: (l) => <div><p className="font-semibold">{l.nombre}</p><p className="text-body-sm text-secondary">{l.punto} · {l.tipo_lector}</p></div> },
              { k: 'en_linea', t: 'Estado', r: (l) => <Estado valor={l.en_linea ? 'en_linea' : 'fuera_de_linea'} /> },
              { k: 'ultimo_latido', t: 'Último latido', r: (l) => relativa(l.ultimo_latido) || 'nunca' },
              { k: 'firmware', t: 'Firmware' },
              { k: 'lecturas_24h', t: 'Lecturas 24 h', derecha: true },
              { k: 'acc', t: '', derecha: true, r: (l) => <Boton chico variante="suave" icono="key" cargando={rotar.isPending} onClick={() => rotar.mutate(l)}>Rotar clave</Boton> },
            ]} filas={lista} vacio="Sin lectores registrados" />
          </Tarjeta>
          <div className="mt-space-md"><Aviso tono="info" titulo="Integración">El controlador consulta <code>POST /api/lector/validar</code> (encabezado <code>X-Lector-Key</code>), envía latidos a <code>/api/lector/latido</code> y descarga la contingencia offline de <code>/api/lector/habilitados</code>.</Aviso></div>
          <Modal abierto={!!clave} titulo="Nueva clave del lector" onCerrar={() => setClave(null)}>
            <Aviso tono="alerta">Cargala en el controlador ahora: no se vuelve a mostrar.</Aviso>
            <p className="font-mono break-all p-3 rounded-xl bg-surface mt-3 select-all">{clave}</p>
          </Modal>
        </>
      )}
    </Consulta>
  );
}
