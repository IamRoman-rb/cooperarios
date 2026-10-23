import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { fechaHora, relativa, numero } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Tabla, Aviso, Kpi, Grilla } from '../../components/ui.jsx';

/** Estado, verificación y pruebas de restauración. */
export default function Backups() {
  const q = useDatos('/api/sistema/backups');
  const crear = useAccion(() => api.post('/api/sistema/backups'), { ok: (r) => `Backup creado: ${r.archivo}`, invalidar: ['/api/sistema'] });
  const verificar = useAccion((archivo) => api.post('/api/sistema/backups/verificar', { archivo }), { ok: (r) => (r.ok ? `Restauración verificada: ${r.tablas} tablas, ${r.socios} socios, ${r.pagos} pagos` : `Falló la verificación: ${r.integridad}`) });
  return (
    <Consulta q={q}>
      {(d) => (
        <>
          <Encabezado titulo="Backups y recuperación" subtitulo={d.politica} acciones={<Boton icono="backup" cargando={crear.isPending} onClick={() => crear.mutate()}>Backup ahora</Boton>} />
          <Grilla cols="grid-cols-2 lg:grid-cols-3" className="mb-space-md">
            <Kpi etiqueta="Copias guardadas" valor={d.archivos.length} icono="inventory_2" detalle="Rotación: últimas 30" />
            <Kpi etiqueta="Última copia" valor={d.archivos[0] ? relativa(d.archivos[0].fecha) : '—'} icono="schedule" tono={d.archivos[0] ? 'exito' : 'alerta'} />
            <Kpi etiqueta="Tamaño" valor={d.archivos[0] ? `${numero(Math.round(d.archivos[0].tamano / 1024))} KB` : '—'} icono="database" />
          </Grilla>
          <Tarjeta cuerpo="p-space-md">
            <Tabla clave="archivo" columnas={[
              { k: 'archivo', t: 'Archivo', r: (a) => <span className="font-mono text-body-sm">{a.archivo}</span> },
              { k: 'fecha', t: 'Fecha', r: (a) => fechaHora(a.fecha) },
              { k: 'tamano', t: 'Tamaño', derecha: true, r: (a) => `${numero(Math.round(a.tamano / 1024))} KB` },
              { k: 'acc', t: '', derecha: true, r: (a) => <Boton chico variante="suave" icono="fact_check" cargando={verificar.isPending} onClick={() => verificar.mutate(a.archivo)}>Probar restauración</Boton> },
            ]} filas={d.archivos} vacio="Todavía no hay copias: corré un backup ahora" />
          </Tarjeta>
          <div className="mt-space-md"><Aviso tono="info">La prueba abre la copia en una base temporal y verifica integridad y conteos. Hacela al menos una vez por trimestre. La copia nocturna debe además salir del servidor (Backup Premium de DonWeb).</Aviso></div>
        </>
      )}
    </Consulta>
  );
}
