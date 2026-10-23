import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api, formData } from '../../lib/api.js';
import { pesos, fecha, fechaHora, periodo, capitalizar } from '../../lib/formato.js';
import { prepararImagen } from '../../lib/imagen.js';
import { useAviso } from '../../components/Avisos.jsx';
import { Icono, Boton, Tarjeta, Encabezado, Consulta, Estado, Vacio, Pestanas, Campo, Entrada, SelectorArchivo, Aviso, cx } from '../../components/ui.jsx';

export default function Pagar() {
  const q = useDatos('/api/socio/pagos');
  const [params] = useSearchParams();
  const [elegidos, setElegidos] = useState(null);
  const [medio, setMedio] = useState('mercadopago');
  const [referencia, setReferencia] = useState('');
  const [archivo, setArchivo] = useState([]);
  const navegar = useNavigate();
  const aviso = useAviso();

  const pendientes = q.data?.pendientes ?? [];
  // Se paga por integrante: por defecto, los vencidos del primero que tenga deuda vencida.
  const primeraPersona = pendientes.find((c) => c.situacion === 'vencido')?.persona_id;
  const seleccion = elegidos ?? new Set(pendientes.filter((c) => c.situacion === 'vencido' && c.persona_id === primeraPersona).map((c) => c.id));
  const elegidosLista = pendientes.filter((c) => seleccion.has(c.id));
  const total = elegidosLista.reduce((s, c) => s + c.saldo, 0);
  const variasPersonas = new Set(elegidosLista.map((c) => c.persona_id)).size > 1;
  const porPersona = useMemo(() => {
    const g = {};
    for (const c of pendientes) (g[c.persona] ??= []).push(c);
    return g;
  }, [pendientes]);

  const alternar = (id) => {
    const s = new Set(seleccion);
    if (s.has(id)) s.delete(id); else s.add(id);
    setElegidos(s);
  };

  const mp = useAccion(() => api.post('/api/socio/pagos/mercadopago', { cargo_ids: [...seleccion] }), {
    alTerminar: (r) => (r.simulado ? navegar(r.init_point) : window.location.assign(r.init_point)),
  });
  const transferencia = useAccion(async () => api.post('/api/socio/pagos/transferencia', formData(
    { cargo_ids: [...seleccion], monto: total, medio: medio === 'billetera' ? 'billetera' : 'transferencia', referencia },
    { comprobante: archivo[0] ? await prepararImagen(archivo[0]) : null },
  )), { ok: 'Comprobante enviado. Te avisamos cuando se acredite.', invalidar: ['/api/socio'], alTerminar: () => { setElegidos(new Set()); setArchivo([]); setReferencia(''); } });

  const copiar = (t) => { navigator.clipboard.writeText(t); aviso.info('Copiado'); };

  return (
    <>
      <Encabezado titulo="Pagar cuotas y aranceles" subtitulo="Elegí los cargos y el medio de pago. No guardamos datos de tarjetas." />
      {params.get('estado') === 'ok' && <div className="mb-space-md"><Aviso tono="exito" titulo="¡Pago recibido! Lo acreditamos en cuanto Mercado Pago lo confirme." /></div>}
      <Consulta q={q}>
        {(d) => pendientes.length === 0 ? (
          <Vacio icono="task_alt" titulo="¡Estás al día!" texto="No tenés cargos pendientes." />
        ) : (
          <div className="grid lg:grid-cols-5 gap-space-md">
            <div className="lg:col-span-3 space-y-space-md">
              {Object.entries(porPersona).map(([persona, cargos]) => (
                <Tarjeta key={persona} titulo={persona} icono="person" cuerpo="p-space-md space-y-2">
                  {cargos.map((c) => (
                    <label key={c.id} className={cx('flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors', seleccion.has(c.id) ? 'border-primary-container bg-critico-suave/30' : 'border-transparent bg-surface')}>
                      <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => alternar(c.id)} className="w-5 h-5 accent-[#b91c1c]" />
                      <div className="flex-1 min-w-0">
                        <p className="font-label-lg text-label-lg truncate">{c.descripcion}</p>
                        <p className="text-body-sm text-secondary">{periodo(c.periodo)} · vence {fecha(c.vencimiento)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">{pesos(c.saldo)}</p>
                        <Estado valor={c.situacion} />
                      </div>
                    </label>
                  ))}
                </Tarjeta>
              ))}
            </div>

            <div className="lg:col-span-2 space-y-space-md">
              <Tarjeta cuerpo="p-space-md space-y-space-md" className="lg:sticky lg:top-24">
                <div className="flex items-end justify-between">
                  <div><p className="etiqueta">Total a pagar</p><p className="text-headline-lg font-extrabold">{pesos(total)}</p></div>
                  <p className="text-body-sm text-secondary">{elegidosLista.length} cargo(s)</p>
                </div>
                {variasPersonas && <Aviso tono="alerta">Pagá los cargos de cada integrante por separado.</Aviso>}
                <Pestanas valor={medio} onChange={setMedio} opciones={[{ value: 'mercadopago', label: 'Mercado Pago' }, { value: 'transferencia', label: 'Transferencia' }, { value: 'billetera', label: 'Billeteras' }]} />
                {medio === 'mercadopago' ? (
                  <>
                    <p className="text-body-sm text-secondary">Pagás con dinero en cuenta, tarjeta u otros medios habilitados. La acreditación es automática.</p>
                    {d.mercado_pago_simulado && <Aviso tono="info">Modo de prueba: el pago se simula sin dinero real.</Aviso>}
                    <Boton completo className="h-12" icono="account_balance_wallet" cargando={mp.isPending} disabled={!total || variasPersonas} onClick={() => mp.mutate()}>Pagar con Mercado Pago</Boton>
                  </>
                ) : (
                  <>
                    {d.cuentas.filter((c) => (medio === 'billetera' ? c.tipo === 'billetera' : c.tipo === 'banco')).map((c) => (
                      <div key={c.nombre} className="p-3 rounded-xl bg-surface space-y-1.5">
                        <p className="font-label-lg text-label-lg">{c.nombre}</p>
                        <button className="w-full flex items-center justify-between text-body-md" onClick={() => copiar(c.alias)}><span>Alias: <strong>{c.alias}</strong></span><Icono n="content_copy" tam={16} /></button>
                        <button className="w-full flex items-center justify-between text-body-md" onClick={() => copiar(c.cbu_cvu)}><span>{c.tipo === 'banco' ? 'CBU' : 'CVU'}: <span className="font-mono">{c.cbu_cvu}</span></span><Icono n="content_copy" tam={16} /></button>
                        <p className="text-body-sm text-secondary">Titular: {c.titular}</p>
                      </div>
                    ))}
                    <p className="text-body-sm">Transferí exactamente <strong>{pesos(total)}</strong> e informá el comprobante. Administración lo verifica y acredita.</p>
                    <Campo etiqueta="Número de operación o referencia"><Entrada value={referencia} onChange={(e) => setReferencia(e.target.value)} /></Campo>
                    <SelectorArchivo etiqueta="Adjuntar comprobante" archivos={archivo} onChange={setArchivo} />
                    <Boton completo icono="upload" cargando={transferencia.isPending} disabled={!total || !archivo.length || variasPersonas} onClick={() => transferencia.mutate()}>Informar transferencia</Boton>
                  </>
                )}
              </Tarjeta>
              {(d.transferencias.length > 0 || d.pagos_online.length > 0) && (
                <Tarjeta titulo="Estado de mis pagos" icono="pending" cuerpo="p-space-md space-y-2">
                  {d.transferencias.slice(0, 5).map((t) => (
                    <div key={`t${t.id}`} className="flex items-center justify-between gap-2 text-body-sm p-2 rounded-lg bg-surface">
                      <span>{capitalizar(t.medio)} · {fechaHora(t.creada_en)}<br /><strong>{pesos(t.monto)}</strong>{t.motivo_rechazo ? <span className="text-error"> · {t.motivo_rechazo}</span> : ''}</span>
                      <Estado valor={t.estado} />
                    </div>
                  ))}
                  {d.pagos_online.slice(0, 5).map((p) => (
                    <div key={`p${p.id}`} className="flex items-center justify-between gap-2 text-body-sm p-2 rounded-lg bg-surface">
                      <span>Mercado Pago · {fechaHora(p.creado_en)}<br /><strong>{pesos(p.monto)}</strong></span>
                      <Estado valor={p.estado} />
                    </div>
                  ))}
                </Tarjeta>
              )}
            </div>
          </div>
        )}
      </Consulta>
    </>
  );
}
