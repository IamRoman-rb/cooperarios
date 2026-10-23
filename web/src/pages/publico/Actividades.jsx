import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { pesos } from '../../lib/formato.js';
import { Icono, Encabezado, Buscador, Selector, Consulta, Vacio, Estado } from '../../components/ui.jsx';

export const TIPOS = [
  { value: '', label: 'Todas' },
  { value: 'deportiva', label: 'Deportivas' },
  { value: 'acuatica', label: 'Acuáticas' },
  { value: 'cultural', label: 'Culturales' },
];

export function TarjetaActividad({ a, a: { id }, destino }) {
  return (
    <Link to={destino ?? `/actividades/${id}`} className="tarjeta p-space-md flex flex-col gap-3 hover:shadow-n2 transition-shadow">
      <div className="flex items-start gap-3">
        <span className="w-12 h-12 rounded-xl bg-primary-fixed text-primary flex items-center justify-center shrink-0"><Icono n={a.icono ?? 'sports'} tam={26} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline-sm text-headline-sm leading-tight">{a.nombre}</h3>
          <p className="text-body-sm text-secondary line-clamp-2 mt-0.5">{a.descripcion}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {a.requisitos?.length > 0 && <Estado tono="alerta" texto="Requiere apto médico" icono="medical_services" />}
        {a.grupos.length === 0 ? <Estado tono="neutro" texto="Horarios a confirmar" /> : (
          <>
            <Estado tono={a.vacantes_total > 0 ? 'exito' : 'critico'} texto={a.vacantes_total > 0 ? `${a.vacantes_total} vacantes` : 'Lista de espera'} />
            <Estado tono="neutro" texto={`${a.grupos.length} ${a.grupos.length === 1 ? 'grupo' : 'grupos'}`} />
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-container">
        <div><p className="etiqueta">Socio desde</p><p className="font-bold text-on-surface">{pesos(a.desde_socio)}</p></div>
        <div><p className="etiqueta">No socio desde</p><p className="font-bold text-on-surface">{pesos(a.desde_no_socio)}</p></div>
      </div>
    </Link>
  );
}

export default function Actividades() {
  const [tipo, setTipo] = useState('');
  const [edad, setEdad] = useState('');
  const [texto, setTexto] = useState('');
  const params = new URLSearchParams({ ...(tipo && { tipo }), ...(edad && { edad }), ...(texto && { q: texto }) });
  const q = useDatos(`/api/publico/actividades?${params}`);
  return (
    <div className="max-w-contenido mx-auto px-gutter-sm lg:px-margin pt-space-lg">
      <Encabezado etiqueta="Catálogo 2026" titulo="Actividades" subtitulo="Días, horarios y aranceles vigentes para socios y no socios. Las vacantes se actualizan en tiempo real." />
      <div className="grid sm:grid-cols-[1fr_180px_160px] gap-2 mb-space-lg">
        <Buscador valor={texto} onChange={setTexto} placeholder="Buscar natación, tenis, karate…" />
        <Selector value={tipo} onChange={(e) => setTipo(e.target.value)} opciones={TIPOS} aria-label="Tipo de actividad" />
        <Selector value={edad} onChange={(e) => setEdad(e.target.value)} aria-label="Edad"
          opciones={[{ value: '', label: 'Todas las edades' }, { value: '5', label: 'Hasta 5 años' }, { value: '10', label: '6 a 13 años' }, { value: '15', label: '14 a 17 años' }, { value: '30', label: 'Adultos' }, { value: '65', label: 'Mayores' }]} />
      </div>
      <Consulta q={q}>
        {(lista) => lista.length === 0 ? <Vacio icono="search_off" titulo="No encontramos actividades" texto="Probá con otros filtros." /> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{lista.map((a) => <TarjetaActividad key={a.id} a={a} />)}</div>
        )}
      </Consulta>
    </div>
  );
}
