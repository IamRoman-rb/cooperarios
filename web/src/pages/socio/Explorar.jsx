import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, horarios } from '../../lib/formato.js';
import { Icono, Boton, Encabezado, Consulta, Estado, Modal, Campo, Selector, Buscador, Aviso, Barra, Vacio, Casilla } from '../../components/ui.jsx';
import { SelectorFamilia } from '../../components/compartidos.jsx';
import { TIPOS } from '../publico/Actividades.jsx';

export default function Explorar() {
  const [persona, setPersona] = useState(null);
  const [tipo, setTipo] = useState('');
  const [texto, setTexto] = useState('');
  const [todas, setTodas] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [eleccion, setEleccion] = useState(null);
  const params = new URLSearchParams({ ...(persona && { persona_id: persona }), ...(tipo && { tipo }), ...(texto && { q: texto }), ...(todas && { todas: 1 }) });
  const q = useDatos(`/api/socio/explorar?${params}`);
  const yo = q.data?.familia.find((f) => f.yo)?.id;
  const personaId = persona ?? yo;

  return (
    <>
      <Encabezado titulo="Explorar e inscribirme" subtitulo={`Vacantes en tiempo real y el precio que te corresponde${q.data ? ` como ${q.data.condicion === 'socio' ? 'socio' : 'no socio'}` : ''}.`} volver="/socio/actividades" />
      {q.data && <SelectorFamilia familia={q.data.familia} valor={personaId} onChange={setPersona} />}
      <div className="grid sm:grid-cols-[1fr_180px] gap-2 mb-2">
        <Buscador valor={texto} onChange={setTexto} placeholder="Buscar actividad" />
        <Selector value={tipo} onChange={(e) => setTipo(e.target.value)} opciones={TIPOS} aria-label="Tipo" />
      </div>
      <Casilla className="mb-space-md text-body-sm" checked={todas} onChange={(e) => setTodas(e.target.checked)} etiqueta="Mostrar también grupos de otras edades" />
      <Consulta q={q}>
        {(d) => d.actividades.length === 0 ? <Vacio icono="search_off" titulo="No hay actividades para esa búsqueda" /> : (
          <div className="space-y-3">
            {d.actividades.map((a) => (
              <div key={a.id} className="tarjeta overflow-hidden">
                <button className="w-full p-space-md flex items-center gap-3 text-left" onClick={() => setAbierta(abierta === a.id ? null : a.id)} aria-expanded={abierta === a.id}>
                  <span className="w-11 h-11 rounded-xl bg-primary-fixed text-primary flex items-center justify-center shrink-0"><Icono n={a.icono ?? 'sports'} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-headline-sm text-headline-sm">{a.nombre}</p>
                    <p className="text-body-sm text-secondary">Desde {pesos(d.condicion === 'socio' ? a.desde_socio : a.desde_no_socio)} · {a.vacantes_total} vacantes{a.requisitos.length ? ' · requiere apto' : ''}</p>
                  </div>
                  <Icono n={abierta === a.id ? 'expand_less' : 'expand_more'} />
                </button>
                {abierta === a.id && (
                  <div className="px-space-md pb-space-md space-y-2">
                    <p className="text-body-sm text-secondary">{a.descripcion}</p>
                    {a.grupos.map((g) => (
                      <div key={g.id} className="p-3 rounded-xl bg-surface">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-label-lg text-label-lg">{g.nombre}</p>
                            <p className="text-body-sm text-secondary">{horarios(g.horarios)}</p>
                            <p className="text-body-sm text-secondary">{g.horarios[0]?.espacio}{g.profesor ? ` · Prof. ${g.profesor}` : ''}</p>
                          </div>
                          {g.inscripto ? <Estado tono="exito" texto="Inscripto/a" /> : g.en_espera ? <Estado tono="alerta" texto={`En espera #${g.en_espera}`} /> : (
                            <Boton chico icono={g.vacantes > 0 ? 'how_to_reg' : 'hourglass_top'} variante={g.vacantes > 0 ? 'primario' : 'secundario'}
                              onClick={() => setEleccion({ actividad: a, grupo: g, frecuencia: a.aranceles.find((x) => x.frecuencia > 0)?.frecuencia ?? a.aranceles[0]?.frecuencia ?? 1, descuento: '' })}>
                              {g.vacantes > 0 ? 'Inscribirme' : 'Lista de espera'}
                            </Boton>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Barra valor={g.ocupados} max={g.cupo} tono={g.vacantes > 0 ? 'primario' : 'critico'} className="flex-1" />
                          <span className="text-label-sm text-secondary whitespace-nowrap">{g.vacantes} de {g.cupo} libres</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Consulta>
      {eleccion && <Confirmar eleccion={eleccion} setEleccion={setEleccion} personaId={personaId} />}
    </>
  );
}

function Confirmar({ eleccion, setEleccion, personaId }) {
  const navegar = useNavigate();
  const { actividad: a, grupo: g } = eleccion;
  const cot = useDatos(`/api/socio/cotizar?grupo_id=${g.id}&frecuencia=${eleccion.frecuencia}&persona_id=${personaId}${eleccion.descuento ? `&descuento_id=${eleccion.descuento}` : ''}`);
  const inscribir = useAccion((datos) => api.post('/api/socio/inscribirme', datos), {
    ok: (r) => (r.lista_espera ? `Quedaste en la lista de espera (posición ${r.posicion}). Te avisamos si se libera un lugar.` : r.estado === 'pendiente_apto' ? 'Inscripción registrada: queda pendiente de apto médico.' : '¡Inscripción confirmada!'),
    invalidar: ['/api/socio'],
    alTerminar: (r) => { setEleccion(null); if (!r.lista_espera) navegar('/socio/actividades'); },
  });
  const c = cot.data;
  const sinVacantes = g.vacantes <= 0;
  return (
    <Modal abierto titulo={`${a.nombre} · ${g.nombre}`} onCerrar={() => setEleccion(null)}
      pie={<><Boton variante="suave" onClick={() => setEleccion(null)}>Cancelar</Boton>
        <Boton cargando={inscribir.isPending} disabled={!c} icono={sinVacantes ? 'hourglass_top' : 'check'}
          onClick={() => inscribir.mutate({ grupo_id: g.id, frecuencia: Number(eleccion.frecuencia), descuento_id: eleccion.descuento ? Number(eleccion.descuento) : null, persona_id: personaId, lista_espera: sinVacantes })}>
          {sinVacantes ? 'Anotarme en espera' : `Confirmar ${c ? pesos(c.total) : ''}`}
        </Boton></>}>
      <div className="space-y-space-md">
        <p className="text-body-sm text-secondary">{horarios(g.horarios)}</p>
        <Campo etiqueta="Frecuencia semanal">
          <Selector value={eleccion.frecuencia} onChange={(e) => setEleccion({ ...eleccion, frecuencia: e.target.value })}
            opciones={a.aranceles.map((x) => ({ value: x.frecuencia, label: x.descripcion ?? `${x.frecuencia} por semana` }))} />
        </Campo>
        {c?.disponibles?.length > 0 && (
          <Campo etiqueta="Descuento" ayuda="Se aplica el más conveniente salvo que elijas otro. Los descuentos no se acumulan.">
            <Selector value={eleccion.descuento} onChange={(e) => setEleccion({ ...eleccion, descuento: e.target.value })} vacio="El más conveniente"
              opciones={c.disponibles.map((d) => ({ value: d.id, label: `${d.nombre} (${d.tipo === 'porcentaje' ? `${d.valor}%` : pesos(d.valor)})` }))} />
          </Campo>
        )}
        {c && (
          <div className="rounded-xl bg-surface p-space-md space-y-1.5 text-body-md">
            <div className="flex justify-between"><span>Arancel mensual ({c.condicion === 'socio' ? 'socio' : 'no socio'})</span><span className="tabular-nums">{pesos(c.base)}</span></div>
            {c.descuento > 0 && <div className="flex justify-between text-exito"><span>{c.descuento_nombre}</span><span className="tabular-nums">−{pesos(c.descuento)}</span></div>}
            <div className="flex justify-between pt-2 border-t border-surface-container font-bold text-headline-sm"><span>Total por mes</span><span className="tabular-nums">{pesos(c.total)}</span></div>
          </div>
        )}
        {c?.apto?.requiere && !c.apto.vigente && (
          <Aviso tono="alerta" titulo="Esta actividad requiere revisión médica">Te inscribimos y quedás «pendiente de apto» hasta que el médico te habilite. Pedí turno o subí un certificado en Revisión médica.</Aviso>
        )}
        {sinVacantes && <Aviso tono="info">El grupo está completo. Si se libera un lugar, te avisamos por orden de llegada.</Aviso>}
      </div>
    </Modal>
  );
}
