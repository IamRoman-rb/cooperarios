import { useForm } from 'react-hook-form';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, fecha, hoy, fechaHora } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Consulta, Estado, Campo, Entrada, Tabla, Aviso } from '../../components/ui.jsx';

export default function Invitados() {
  const q = useDatos('/api/socio/invitados');
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ defaultValues: { fecha: hoy() } });
  const registrar = useAccion((d) => api.post('/api/socio/invitados', d), { ok: 'Invitado registrado. Se presenta con DNI en portería.', invalidar: ['/api/socio'], alTerminar: () => reset({ fecha: hoy(), nombre: '', dni: '' }) });
  return (
    <>
      <Encabezado titulo="Invitados" subtitulo="Registrá a tus invitados no socios mayores de 18. La entrada se suma a tu cuenta." />
      <div className="grid lg:grid-cols-3 gap-space-md">
        <Tarjeta titulo="Nuevo pase diario" icono="confirmation_number" franja>
          <form onSubmit={handleSubmit((d) => registrar.mutate(d))} className="space-y-space-md">
            <Campo etiqueta="Nombre y apellido" error={errors.nombre && 'Ingresá el nombre'}><Entrada {...register('nombre', { required: true, minLength: 3 })} /></Campo>
            <Campo etiqueta="DNI" error={errors.dni && 'DNI inválido'}><Entrada inputMode="numeric" {...register('dni', { required: true, pattern: /^\d{7,9}$/ })} /></Campo>
            <Campo etiqueta="Fecha de la visita"><Entrada type="date" min={hoy()} {...register('fecha', { required: true })} /></Campo>
            <Aviso tono="info">Entrada de invitado: <strong>{pesos(q.data?.valor ?? 650000)}</strong> por visita.</Aviso>
            <Boton type="submit" completo icono="person_add" cargando={registrar.isPending}>Registrar invitado</Boton>
          </form>
        </Tarjeta>
        <Tarjeta className="lg:col-span-2" titulo="Mis invitados" icono="group">
          <Consulta q={q}>
            {(d) => (
              <Tabla columnas={[
                { k: 'nombre', t: 'Invitado', r: (i) => <div><p className="font-semibold">{i.nombre}</p><p className="text-body-sm text-secondary">DNI {i.dni}</p></div> },
                { k: 'fecha', t: 'Fecha', r: (i) => fecha(i.fecha) },
                { k: 'importe', t: 'Entrada', derecha: true, r: (i) => pesos(i.importe) },
                { k: 'ingreso_en', t: 'Ingreso', r: (i) => (i.ingreso_en ? <Estado tono="exito" texto={fechaHora(i.ingreso_en)} /> : <Estado valor="pendiente" />) },
              ]} filas={d.invitados} vacio="Todavía no registraste invitados" />
            )}
          </Consulta>
        </Tarjeta>
      </div>
    </>
  );
}
