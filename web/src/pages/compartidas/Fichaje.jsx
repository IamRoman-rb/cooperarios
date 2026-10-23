// Fichaje por QR: profesor (grupo en curso, registra asistencia) y portería (puntos de acceso, invitados, apertura manual).
// El operador ve solo verde o rojo y un motivo genérico, nunca montos ni datos clínicos.
import { useCallback, useState } from 'react';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { hora, horarios, DIAS, hoy } from '../../lib/formato.js';
import { Icono, Boton, Tarjeta, Encabezado, Selector, Campo, Entrada, Estado, Avatar, Pestanas, Modal, Area, Vacio, Consulta, Tabla, cx } from '../../components/ui.jsx';
import { EscanerQr } from '../../components/EscanerQr.jsx';

function Resultado({ r, onCerrar }) {
  if (!r) return null;
  return (
    <div className={cx('rounded-2xl p-space-lg text-white flex flex-col items-center text-center gap-2 shadow-n2', r.habilitado ? 'bg-exito' : 'bg-critico')} role="alert">
      <Icono n={r.habilitado ? 'check_circle' : 'cancel'} relleno tam={64} />
      <p className="text-headline-lg">{r.habilitado ? 'HABILITADO' : 'NO HABILITADO'}</p>
      {r.persona && (
        <div className="flex items-center gap-3 bg-white/15 rounded-xl p-2 pr-4">
          <Avatar persona={{ nombre: r.persona.nombre.split(' ')[0], apellido: r.persona.nombre.split(' ').slice(-1)[0], foto: r.persona.foto }} tam={44} />
          <div className="text-left"><p className="font-semibold">{r.persona.nombre}</p>{r.persona.nro_socio && <p className="text-body-sm opacity-90">Socio N° {r.persona.nro_socio}</p>}</div>
        </div>
      )}
      {!r.habilitado && <p className="text-body-lg font-semibold">{r.mensaje}</p>}
      <Boton variante="blanco" chico onClick={onCerrar}>Siguiente</Boton>
    </div>
  );
}

export default function Fichaje({ modo }) {
  const esProfesor = modo === 'profesor';
  const grupos = useDatos(esProfesor ? '/api/profesor/grupos' : null);
  const puntos = useDatos(!esProfesor ? '/api/acceso/puntos' : null);
  const [destino, setDestino] = useState('');
  const [resultado, setResultado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [manual, setManual] = useState('');
  const [vista, setVista] = useState('escaner');
  const [apertura, setApertura] = useState(false);
  const [motivo, setMotivo] = useState('');

  // Grupo en curso por defecto: el que tiene clase ahora.
  const ahora = new Date();
  const grupoEnCurso = grupos.data?.find((g) => g.horarios.some((h) => h.dia_semana === ahora.getDay() && h.hora_inicio <= hora(ahora.toISOString()) && hora(ahora.toISOString()) <= h.hora_fin));
  const destinoId = destino || (esProfesor ? grupoEnCurso?.id ?? grupos.data?.[0]?.id : puntos.data?.[0]?.id) || null;

  const fichar = useAccion((cuerpo) => api.post(esProfesor ? '/api/acceso/fichar-grupo' : '/api/acceso/fichar', esProfesor ? { ...cuerpo, grupo_id: destinoId } : { ...cuerpo, punto_acceso_id: destinoId }), {
    invalidar: ['/api/profesor', '/api/acceso'],
    alTerminar: (r) => {
      setResultado(r);
      setHistorial((h) => [{ ...r, en: new Date().toISOString() }, ...h].slice(0, 15));
      if (navigator.vibrate) navigator.vibrate(r.habilitado ? 80 : [80, 60, 80]);
    },
  });
  const alLeer = useCallback((codigo) => { if (!fichar.isPending) fichar.mutate({ codigo }); }, [fichar]);
  const abrir = useAccion(() => api.post('/api/acceso/apertura-manual', { punto_acceso_id: destinoId, motivo }), { ok: 'Apertura registrada', alTerminar: () => { setApertura(false); setMotivo(''); } });

  const grupoActual = grupos.data?.find((g) => g.id === destinoId);
  return (
    <>
      <Encabezado titulo={esProfesor ? 'Fichaje por QR' : 'Puesto de portería'} subtitulo={esProfesor ? 'Escaneá el QR de cada alumno: la asistencia se registra sola.' : 'Escáner QR, ingreso de invitados y apertura manual con registro.'}
        acciones={!esProfesor && <Boton variante="secundario" icono="lock_open" onClick={() => setApertura(true)}>Apertura manual</Boton>} />
      {!esProfesor && <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'escaner', label: 'Escáner', icono: 'qr_code_scanner' }, { value: 'invitados', label: 'Invitados de hoy', icono: 'group' }]} />}
      {vista === 'invitados' ? <InvitadosHoy /> : (
        <div className="grid lg:grid-cols-2 gap-space-md">
          <div className="space-y-space-md">
            <Tarjeta cuerpo="p-space-md space-y-space-md">
              <Campo etiqueta={esProfesor ? 'Grupo' : 'Punto de acceso'}>
                <Selector value={destinoId || ''} onChange={(e) => setDestino(e.target.value)}
                  opciones={esProfesor ? (grupos.data ?? []).map((g) => ({ value: g.id, label: `${g.actividad} · ${g.nombre}${g.id === grupoEnCurso?.id ? ' (en curso)' : ''}` })) : (puntos.data ?? []).map((p) => ({ value: p.id, label: `${p.nombre}${p.actividad ? ` · ${p.actividad}` : ''}` }))} />
              </Campo>
              {grupoActual && <p className="text-body-sm text-secondary -mt-2">{horarios(grupoActual.horarios.filter((h) => h.dia_semana === ahora.getDay())) || `Hoy (${DIAS[ahora.getDay()]}) no tiene clase: se validará igual el horario.`}</p>}
              {resultado ? <Resultado r={resultado} onCerrar={() => setResultado(null)} /> : <EscanerQr onCodigo={alLeer} pausado={!!resultado || fichar.isPending} />}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Entrada value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Pegar código o DNI / N° de socio" />
                <Boton icono="send" cargando={fichar.isPending} disabled={!manual.trim()} onClick={() => {
                  const v = manual.trim();
                  fichar.mutate(/^\d{7,9}$/.test(v) ? { dni: v } : /^\d{1,6}$/.test(v) ? { nro_socio: Number(v) } : { codigo: v });
                  setManual('');
                }}>Validar</Boton>
              </div>
              <p className="text-body-sm text-secondary">Quien usa llave magnética y no celular se valida con su DNI o número de socio.</p>
            </Tarjeta>
          </div>
          <Tarjeta titulo="Últimas lecturas" icono="history" cuerpo="p-space-md space-y-2">
            {historial.length === 0 ? <Vacio icono="qr_code" titulo="Todavía no hay lecturas" /> : historial.map((h, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface">
                <Icono n={h.habilitado ? 'check_circle' : 'cancel'} relleno className={h.habilitado ? 'text-exito' : 'text-critico'} />
                <div className="flex-1 min-w-0"><p className="font-label-lg text-label-lg truncate">{h.persona?.nombre ?? 'Código inválido'}</p><p className="text-body-sm text-secondary">{h.mensaje}</p></div>
                <span className="text-body-sm text-secondary">{hora(h.en)}</span>
              </div>
            ))}
          </Tarjeta>
        </div>
      )}
      <Modal abierto={apertura} titulo="Apertura manual" onCerrar={() => setApertura(false)}
        pie={<><Boton variante="suave" onClick={() => setApertura(false)}>Cancelar</Boton><Boton cargando={abrir.isPending} disabled={motivo.trim().length < 5} onClick={() => abrir.mutate()}>Registrar y abrir</Boton></>}>
        <p className="text-body-sm text-secondary mb-3">Queda registrada con tu usuario, el punto de acceso y el motivo.</p>
        <Campo etiqueta="Motivo"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: corte de internet, lector sin respuesta…" /></Campo>
      </Modal>
    </>
  );
}

function InvitadosHoy() {
  const q = useDatos('/api/acceso/invitados');
  const ingreso = useAccion((id) => api.post(`/api/acceso/invitados/${id}/ingreso`), { ok: 'Ingreso registrado', invalidar: ['/api/acceso/invitados'] });
  return (
    <Tarjeta titulo={`Invitados del ${hoy().split('-').reverse().join('/')}`} icono="group">
      <Consulta q={q}>
        {(lista) => (
          <Tabla columnas={[
            { k: 'nombre', t: 'Invitado', r: (i) => <div><p className="font-semibold">{i.nombre}</p><p className="text-body-sm text-secondary">DNI {i.dni}</p></div> },
            { k: 'anfitrion', t: 'Socio anfitrión', r: (i) => `${i.anfitrion} (N° ${i.nro_socio})` },
            { k: 'ingreso_en', t: '', derecha: true, r: (i) => (i.ingreso_en ? <Estado tono="exito" texto={`Ingresó ${hora(i.ingreso_en)}`} /> : <Boton chico icono="login" cargando={ingreso.isPending} onClick={() => ingreso.mutate(i.id)}>Registrar ingreso</Boton>) },
          ]} filas={lista} vacio="No hay invitados registrados para hoy" />
        )}
      </Consulta>
    </Tarjeta>
  );
}
