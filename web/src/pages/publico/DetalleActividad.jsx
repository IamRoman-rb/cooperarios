import { useParams } from 'react-router-dom';
import { useDatos } from '../../lib/datos.js';
import { useSesion } from '../../lib/sesion.jsx';
import { pesos, horarios } from '../../lib/formato.js';
import { Icono, Boton, Tarjeta, Consulta, Estado, Tabla, Aviso, Barra } from '../../components/ui.jsx';

export default function DetalleActividad() {
  const { id } = useParams();
  const { usuario, tieneRol } = useSesion();
  const q = useDatos(`/api/publico/actividades/${id}`);
  const destino = usuario && tieneRol('socio') ? '/mis-actividades/explorar' : '/login?volver=/socio/actividades/explorar';
  return (
    <div className="max-w-contenido mx-auto px-gutter-sm lg:px-margin pt-space-md">
      <Consulta q={q}>
        {(a) => (
          <>
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-graphite to-tertiary text-white p-space-lg">
              <Icono n={a.icono ?? 'sports'} className="absolute right-4 bottom-2 text-white/10" tam={120} />
              <Boton as="link" to="/actividades" variante="suave" chico icono="arrow_back" className="bg-white/15 text-white hover:bg-white/25 mb-4">Actividades</Boton>
              <h1 className="text-headline-xl-mobile lg:text-headline-xl">{a.nombre}</h1>
              <p className="text-body-md text-white/85 max-w-2xl mt-2">{a.descripcion}</p>
              {a.subcomision && <p className="mt-3 inline-flex items-center gap-1.5 text-label-md text-white/80"><Icono n="diversity_3" tam={16} /> {a.subcomision}</p>}
            </section>

            <div className="grid lg:grid-cols-3 gap-space-lg mt-space-lg">
              <div className="lg:col-span-2 space-y-space-lg">
                <Tarjeta titulo="Grupos y horarios" icono="schedule" cuerpo="p-space-md space-y-3">
                  {a.grupos.map((g) => (
                    <div key={g.id} className="p-3 rounded-xl bg-surface">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-label-lg text-label-lg">{g.nombre}</p>
                          <p className="text-body-sm text-secondary">{horarios(g.horarios)}</p>
                          <p className="text-body-sm text-secondary">
                            {g.horarios[0]?.espacio}{g.profesor ? ` · Prof. ${g.profesor}` : ''}
                            {g.edad_min != null || g.edad_max != null ? ` · ${g.edad_min ?? 0}${g.edad_max ? ` a ${g.edad_max}` : '+'} años` : ''}
                          </p>
                        </div>
                        <Estado tono={g.vacantes > 0 ? 'exito' : 'critico'} texto={g.vacantes > 0 ? `${g.vacantes} vacantes` : 'Lista de espera'} />
                      </div>
                      <Barra valor={g.ocupados} max={g.cupo} tono={g.vacantes > 0 ? 'primario' : 'critico'} className="mt-3" />
                    </div>
                  ))}
                </Tarjeta>

                <Tarjeta titulo="Aranceles vigentes" icono="sell" subtitulo="Valores mensuales según frecuencia semanal">
                  <Tabla clave="id" columnas={[
                    { k: 'descripcion', t: 'Frecuencia', r: (x) => x.descripcion ?? `${x.frecuencia} por semana` },
                    { k: 'valor_socio', t: 'Socio', derecha: true, r: (x) => <span className="font-semibold">{pesos(x.valor_socio)}</span> },
                    { k: 'valor_no_socio', t: 'No socio', derecha: true, r: (x) => pesos(x.valor_no_socio) },
                  ]} filas={a.aranceles} />
                </Tarjeta>
              </div>

              <aside className="space-y-space-md">
                {a.requisitos.length > 0 && (
                  <Aviso tono="alerta" titulo="Requiere revisión médica">
                    {a.requisitos.map((r) => (
                      <p key={r.tipo_revision_id}>{r.nombre}: vigencia {r.vigencia_meses} {r.vigencia_meses === 1 ? 'mes' : 'meses'}{r.importe ? ` · arancel ${pesos(r.importe)}` : ''}.</p>
                    ))}
                    <p className="mt-1">Podés inscribirte y quedás «pendiente de apto» hasta que el médico te habilite.</p>
                  </Aviso>
                )}
                {a.descuentos.length > 0 && (
                  <Tarjeta titulo="Descuentos" icono="percent" cuerpo="p-space-md space-y-2">
                    {a.descuentos.map((d) => (
                      <div key={d.id} className="flex justify-between text-body-sm"><span>{d.nombre}{d.solo_socios ? ' (solo socios)' : ''}</span><span className="font-semibold">{d.tipo === 'porcentaje' ? `${d.valor}%` : pesos(d.valor)}</span></div>
                    ))}
                    <p className="text-body-sm text-secondary pt-1">Siempre verás el total antes de confirmar.</p>
                  </Tarjeta>
                )}
                <Tarjeta cuerpo="p-space-md flex flex-col gap-2">
                  <p className="font-headline-sm text-headline-sm">¿Querés sumarte?</p>
                  <p className="text-body-sm text-secondary">Ingresá con tu usuario de socio para ver tu precio, las vacantes por horario e inscribirte.</p>
                  <Boton as="link" to={destino} icono="how_to_reg" completo>Inscribirme</Boton>
                  <Boton as="link" to="/cuota-social" variante="suave" completo>Todavía no soy socio</Boton>
                </Tarjeta>
              </aside>
            </div>
          </>
        )}
      </Consulta>
    </div>
  );
}
