import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos, edad } from '../../lib/formato.js';
import { Boton, Tarjeta, Encabezado, Campo, Entrada, Selector, Casilla, Aviso, Buscador, Fila } from '../../components/ui.jsx';

/** Alta de socio y grupo familiar, categorización y entrega de credencial (llave magnética opcional). */
export default function AltaSocio() {
  const navegar = useNavigate();
  const categorias = useDatos('/api/padron/categorias');
  const [grupoTexto, setGrupoTexto] = useState('');
  const [grupo, setGrupo] = useState(null);
  const grupos = useDatos(grupoTexto.length >= 2 ? `/api/padron/grupos-familiares?q=${encodeURIComponent(grupoTexto)}` : null);
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ defaultValues: { crear_grupo_familiar: false, llave: true, consentimiento: false, jubilado: false } });
  const nacimiento = watch('fecha_nacimiento');
  const anios = edad(nacimiento);
  const alta = useAccion((d) => api.post('/api/padron/socios', d), { ok: (r) => `Socio N° ${r.nro_socio} dado de alta`, invalidar: ['/api/padron'], alTerminar: (r) => navegar(`/admin/socios/${r.persona_id}`) });

  const enviar = (d) => alta.mutate({
    ...d, categoria_id: d.categoria_id || undefined, grupo_familiar_id: grupo?.id ?? null,
    tutor_persona_id: grupo && anios < 18 ? grupo.titular_persona_id : null,
  });
  const fijas = (categorias.data ?? []).filter((c) => c.regla_cuota.tipo === 'fija');

  return (
    <>
      <Encabezado titulo="Alta de socio" subtitulo="Datos personales, categoría, grupo familiar y consentimiento informado." volver="/admin/socios" />
      <form onSubmit={handleSubmit(enviar)} className="grid lg:grid-cols-3 gap-space-md">
        <Tarjeta className="lg:col-span-2" titulo="Datos personales" icono="person" franja>
          <div className="grid sm:grid-cols-2 gap-space-md">
            <Campo etiqueta="Nombre" error={errors.nombre && 'Requerido'}><Entrada {...register('nombre', { required: true })} /></Campo>
            <Campo etiqueta="Apellido" error={errors.apellido && 'Requerido'}><Entrada {...register('apellido', { required: true })} /></Campo>
            <Campo etiqueta="DNI" error={errors.dni && 'DNI inválido'}><Entrada inputMode="numeric" {...register('dni', { required: true, pattern: /^\d{7,9}$/ })} /></Campo>
            <Campo etiqueta="Fecha de nacimiento" error={errors.fecha_nacimiento && 'Requerida'} ayuda={anios != null ? `${anios} años` : undefined}><Entrada type="date" {...register('fecha_nacimiento', { required: true })} /></Campo>
            <Campo etiqueta="Email"><Entrada type="email" {...register('email')} /></Campo>
            <Campo etiqueta="Teléfono"><Entrada {...register('telefono')} /></Campo>
            <Campo etiqueta="Domicilio" className="sm:col-span-2"><Entrada {...register('domicilio')} /></Campo>
            <Casilla {...register('jubilado')} etiqueta="Jubilado/a (descuento en actividades)" className="sm:col-span-2" />
          </div>
        </Tarjeta>
        <div className="space-y-space-md">
          <Tarjeta titulo="Categoría" icono="sell" cuerpo="p-space-md space-y-space-md">
            <Campo etiqueta="Categoría" ayuda="Si la dejás en automático, se asigna por edad.">
              <Selector {...register('categoria_id')} vacio="Automática por edad" opciones={fijas.map((c) => ({ value: c.id, label: `${c.nombre} · ${pesos(c.regla_cuota.valor)}` }))} />
            </Campo>
            <Casilla {...register('llave')} etiqueta={`Entregar llave magnética (${pesos(250000)}, única vez)`} />
          </Tarjeta>
          <Tarjeta titulo="Grupo familiar" icono="family_restroom" cuerpo="p-space-md space-y-space-md">
            {grupo ? <Fila icono="family_restroom" titulo={grupo.nombre} detalle={`Titular: ${grupo.titular} · ${grupo.integrantes} integrantes`} derecha={<Boton chico variante="fantasma" onClick={() => setGrupo(null)}>Quitar</Boton>} /> : (
              <>
                <Casilla {...register('crear_grupo_familiar')} etiqueta="Crear un grupo familiar con esta persona como titular" />
                <p className="text-body-sm text-secondary">o sumarla a un grupo existente:</p>
                <Buscador valor={grupoTexto} onChange={setGrupoTexto} placeholder="Buscar grupo (ej.: Fernández)" />
                {(grupos.data ?? []).map((g) => <Fila key={g.id} icono="family_restroom" titulo={g.nombre} detalle={`${g.titular} · ${g.integrantes} integrantes`} onClick={() => setGrupo(g)} />)}
              </>
            )}
            {grupo && anios != null && anios < 18 && <Aviso tono="info">Menor de edad: el titular del grupo queda registrado como tutor.</Aviso>}
          </Tarjeta>
          <Tarjeta cuerpo="p-space-md space-y-space-md">
            <Casilla {...register('consentimiento', { required: true })} etiqueta="La persona (o su tutor) firmó el consentimiento informado de tratamiento de datos." />
            {errors.consentimiento && <p className="text-body-sm text-error">Falta el consentimiento informado.</p>}
            <Boton type="submit" completo icono="how_to_reg" cargando={alta.isPending}>Dar de alta</Boton>
          </Tarjeta>
        </div>
      </form>
    </>
  );
}
