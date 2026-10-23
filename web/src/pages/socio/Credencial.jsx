import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useDatos } from '../../lib/datos.js';
import { fecha } from '../../lib/formato.js';
import { useAviso } from '../../components/Avisos.jsx';
import { Icono, Consulta, Estado, Avatar, Boton, Fila } from '../../components/ui.jsx';
import { SelectorFamilia } from '../../components/compartidos.jsx';

/** Credencial dinámica: el QR se renueva cada minuto; una captura vieja no sirve. */
export default function Credencial() {
  const [persona, setPersona] = useState(null);
  const q = useDatos(`/api/mi/credencial${persona ? `?persona_id=${persona}` : ''}`, { refetchInterval: 55_000, staleTime: 0 });
  const [restante, setRestante] = useState(60);
  const aviso = useAviso();
  const expira = q.data?.qr?.expira_en;

  useEffect(() => {
    if (!expira) return undefined;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((new Date(expira) - Date.now()) / 1000));
      setRestante(s);
      if (s === 0) q.refetch();
    }, 1000);
    return () => clearInterval(t);
  }, [expira, q]);

  return (
    <Consulta q={q}>
      {(c) => (
        <div className="max-w-md mx-auto space-y-space-md">
          <SelectorFamilia familia={c.familia} valor={persona ?? c.familia.find((f) => f.yo)?.id} onChange={setPersona} />
          <article className="tarjeta overflow-hidden shadow-n2" aria-label="Carnet de socio digital">
            <div className="h-1.5 bg-primary-container" />
            <div className="p-space-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center"><Icono n="shield" relleno className="text-white" tam={18} /></span>
                  <div className="leading-tight">
                    <p className="font-label-lg text-label-lg text-primary">Los Cooperarios</p>
                    <p className="text-label-sm uppercase text-secondary">Carnet digital</p>
                  </div>
                </div>
                {c.estado === 'activo'
                  ? <Estado tono={c.cuota_al_dia ? 'exito' : 'critico'} texto={c.cuota_al_dia ? 'Cuota al día' : 'Cuota vencida'} />
                  : <Estado valor={c.estado ?? 'pendiente'} texto={c.estado ?? 'No socio'} />}
              </div>
              <div className="flex items-center gap-4 mt-space-lg">
                <Avatar persona={c} tam={72} />
                <div className="min-w-0">
                  <p className="text-headline-md leading-tight">{c.nombre} {c.apellido}</p>
                  <p className="text-body-sm text-secondary">{c.categoria ?? 'No socio'} · DNI {c.dni}</p>
                  {c.nro_socio && <p className="font-mono font-bold text-headline-sm mt-1 tracking-wider">N° {c.nro_socio}</p>}
                </div>
              </div>
              <div className="mt-space-lg flex flex-col items-center">
                <div className={`p-3 rounded-2xl bg-white border-2 ${restante < 10 ? 'border-alerta' : 'border-surface-container'}`}>
                  <QRCodeSVG value={c.qr.token} size={220} level="M" marginSize={0} fgColor="#121c28" />
                </div>
                <div className="flex items-center gap-2 mt-3 text-body-sm text-secondary">
                  <Icono n="autorenew" className={q.isFetching ? 'animate-spin' : ''} tam={16} />
                  Se renueva en <span className="font-bold tabular-nums text-on-surface">{restante}s</span>
                </div>
                <div className="w-full h-1 mt-2 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-primary-container transition-all duration-1000" style={{ width: `${(restante / c.vigencia_segundos) * 100}%` }} />
                </div>
                <p className="text-body-sm text-secondary text-center mt-3">Mostrá este código en el lector de la actividad, al profesor o en portería. No contiene datos personales.</p>
                {import.meta.env.DEV && (
                  <Boton chico variante="suave" icono="content_copy" className="mt-2" onClick={() => { navigator.clipboard.writeText(c.qr.token); aviso.info('Código copiado (solo modo de prueba)'); }}>Copiar código (prueba)</Boton>
                )}
              </div>
            </div>
          </article>
          <div className="tarjeta p-space-md space-y-2">
            <p className="etiqueta">Estado por actividad</p>
            {c.habilitacion.length === 0 && <p className="text-body-sm text-secondary">Sin actividades inscriptas.</p>}
            {c.habilitacion.map((h) => (
              <Fila key={h.actividad_id} icono={h.habilitado ? 'check_circle' : 'block'} tono={h.habilitado ? 'exito' : 'critico'} titulo={h.actividad}
                detalle={h.habilitado ? (h.apto?.requiere ? `Apto hasta ${fecha(h.apto.vence_en)}` : 'Habilitado') : h.mensaje} />
            ))}
          </div>
          <p className="text-center text-body-sm text-secondary">Socio desde {fecha(c.fecha_alta)} · Si no usás celular, presentá tu DNI en portería.</p>
        </div>
      )}
    </Consulta>
  );
}
