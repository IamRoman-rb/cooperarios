import { useState } from 'react';
import { useDatos } from '../../lib/datos.js';
import { fecha, fechaHora } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Estado, Buscador, Fila, Vacio, Tabla } from '../../components/ui.jsx';

/** Revisiones realizadas en el club para una persona (incluye correcciones enlazadas). */
export default function Historial() {
  const [busqueda, setBusqueda] = useState('');
  const [persona, setPersona] = useState(null);
  const lista = useDatos(busqueda.length >= 2 ? `/api/medico/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const q = useDatos(persona ? `/api/medico/historial/${persona}` : null);
  return (
    <>
      <Encabezado titulo="Historial de revisiones" subtitulo="Constancias firmadas. La historia clínica la lleva el profesional bajo su custodia." />
      <div className="grid lg:grid-cols-3 gap-space-md">
        <Tarjeta titulo="Buscar" icono="person_search" cuerpo="p-space-md space-y-2">
          <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Apellido, DNI o N° de socio" />
          {(lista.data ?? []).map((p) => <Fila key={p.id} icono="person" titulo={`${p.apellido}, ${p.nombre}`} detalle={`DNI ${p.dni}`} onClick={() => setPersona(p.id)} />)}
        </Tarjeta>
        <Tarjeta className="lg:col-span-2" cuerpo="p-space-md">
          {!persona ? <Vacio icono="history" titulo="Elegí una persona" /> : (
            <Consulta q={q}>
              {(d) => (
                <>
                  <p className="font-headline-sm text-headline-sm mb-3">{d.persona.apellido}, {d.persona.nombre} · DNI {d.persona.dni}</p>
                  <Tabla compacta columnas={[
                    { k: 'fecha', t: 'Fecha', r: (r) => fecha(r.fecha) },
                    { k: 'tipo', t: 'Tipo', r: (r) => <div>{r.tipo}{r.certificado_externo && <p className="text-label-sm text-secondary">Certificado externo</p>}{r.reemplaza_id && <p className="text-label-sm text-secondary">Corrige la #{r.reemplaza_id}</p>}</div> },
                    { k: 'resultado', t: 'Resultado', r: (r) => <div><Estado valor={r.resultado} />{r.restricciones && <p className="text-label-sm text-secondary mt-0.5">{r.restricciones}</p>}</div> },
                    { k: 'vence_en', t: 'Vigencia', r: (r) => fecha(r.vence_en) },
                    { k: 'firma', t: 'Firma', r: (r) => (r.firmada_en ? <div className="text-body-sm">{r.profesional}<p className="text-secondary">{r.matricula} · {fechaHora(r.firmada_en)}</p></div> : <Estado valor="pendiente_validacion" />) },
                  ]} filas={d.revisiones} vacio="Sin revisiones" />
                </>
              )}
            </Consulta>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
