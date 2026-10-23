import { useDatos } from '../../lib/datos.js';
import { relativa, numero } from '../../lib/formato.js';
import { Tarjeta, Encabezado, Consulta, Kpi, Grilla, Estado, Barra, Tabla, Dato } from '../../components/ui.jsx';

const mb = (b) => `${numero(Math.round(b / 1048576))} MB`;
const duracion = (s) => (s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`);

/** Servidor, base de datos, tareas programadas y errores. */
export default function Salud() {
  const q = useDatos('/api/sistema/salud', { refetchInterval: 30_000 });
  return (
    <Consulta q={q}>
      {(d) => {
        const usada = d.servidor.memoria_total - d.servidor.memoria_libre;
        return (
          <>
            <Encabezado titulo="Estado del sistema" subtitulo={`${d.servidor.host} · ${d.servidor.plataforma} · Node ${d.servidor.node}`} />
            <Grilla className="mb-space-md">
              <Kpi etiqueta="En línea hace" valor={duracion(d.servidor.uptime_s)} icono="timer" tono="exito" />
              <Kpi etiqueta="Base de datos" valor={mb(d.base.tamano)} icono="database" detalle={`WAL ${mb(d.base.wal)} · ${d.base.modo}`} />
              <Kpi etiqueta="Sesiones activas" valor={d.sesiones_activas} icono="group" />
              <Kpi etiqueta="Integridad" valor={d.base.integridad === 'ok' ? 'OK' : 'Revisar'} icono="verified" tono={d.base.integridad === 'ok' ? 'exito' : 'critico'} />
            </Grilla>
            <div className="grid lg:grid-cols-2 gap-space-md">
              <Tarjeta titulo="Recursos" icono="memory" cuerpo="p-space-md space-y-space-md">
                <div>
                  <div className="flex justify-between text-body-sm mb-1"><span>Memoria del servidor</span><span>{mb(usada)} / {mb(d.servidor.memoria_total)}</span></div>
                  <Barra valor={usada} max={d.servidor.memoria_total} tono={usada / d.servidor.memoria_total > 0.85 ? 'critico' : 'primario'} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Dato etiqueta="Proceso Node" valor={`${d.servidor.proceso_mb} MB`} />
                  <Dato etiqueta="CPUs" valor={d.servidor.cpus} />
                  <Dato etiqueta="Carga (1/5/15)" valor={d.servidor.cpu.map((c) => c.toFixed(2)).join(' · ')} />
                </div>
              </Tarjeta>
              <Tarjeta titulo="Tareas programadas" icono="schedule" cuerpo="p-space-md">
                <Tabla compacta clave="nombre" columnas={[
                  { k: 'nombre', t: 'Tarea' },
                  { k: 'ultima', t: 'Última ejecución', r: (t) => relativa(t.ultima) || 'Pendiente' },
                  { k: 'ok', t: 'Estado', r: (t) => (t.ultima ? <Estado valor={t.ok ? 'ok' : 'rechazado'} texto={t.ok ? 'OK' : t.error} /> : <Estado tono="neutro" texto="Aún no corrió" />) },
                ]} filas={['cargos_mensuales', 'bajas', 'avisos_aptos', 'avisos_morosidad', 'avisos_tickets', 'retencion', 'backup'].map((n) => ({ nombre: n.replace('_', ' '), ...(d.tareas[n] ?? {}) }))} />
              </Tarjeta>
              <Tarjeta titulo="Migraciones aplicadas" icono="history" cuerpo="p-space-md">
                <Tabla compacta clave="version" columnas={[{ k: 'version', t: 'Versión' }, { k: 'aplicada_en', t: 'Aplicada', r: (m) => relativa(m.aplicada_en) }]} filas={d.base.migraciones} />
              </Tarjeta>
              <Tarjeta titulo="Errores (24 h)" icono="bug_report" cuerpo="p-space-md">
                <p className="text-headline-lg font-extrabold">{d.errores_24h}</p>
                <p className="text-body-sm text-secondary">Los errores del servidor se registran en el log del proceso (PM2 / systemd).</p>
              </Tarjeta>
            </div>
          </>
        );
      }}
    </Consulta>
  );
}
