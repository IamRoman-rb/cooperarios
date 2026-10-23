import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDatos, useAccion } from '../../lib/datos.js';
import { api } from '../../lib/api.js';
import { pesos } from '../../lib/formato.js';
import { Icono, Boton, Tarjeta, Encabezado, Campo, Entrada, Selector, Casilla, Aviso, Cargando } from '../../components/ui.jsx';

const esquema = z.object({
  nombre: z.string().min(2, 'Ingresá tu nombre'),
  apellido: z.string().min(2, 'Ingresá tu apellido'),
  dni: z.string().regex(/^\d{7,9}$/, 'Solo números, sin puntos'),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  email: z.string().email('Email inválido'),
  telefono: z.string().min(6, 'Teléfono inválido'),
  domicilio: z.string().optional(),
  categoria: z.string(),
  familiares: z.array(z.object({ nombre: z.string().min(2), apellido: z.string().min(2), dni: z.string().regex(/^\d{7,9}$/), fecha_nacimiento: z.string().min(10), parentesco: z.string().min(3) })),
  acepta_datos: z.literal(true, { errorMap: () => ({ message: 'Necesitamos tu consentimiento para tratar tus datos' }) }),
  acepta_comunicaciones: z.boolean().optional(),
});

export default function CuotaSocial() {
  const q = useDatos('/api/publico/cuota-social');
  const [enviado, setEnviado] = useState(null);
  const { register, handleSubmit, control, formState: { errors } } = useForm({
    resolver: zodResolver(esquema),
    defaultValues: { categoria: 'Adulto', familiares: [], acepta_comunicaciones: true },
  });
  const familiares = useFieldArray({ control, name: 'familiares' });
  const enviar = useAccion((d) => api.post('/api/publico/solicitud-alta', d), { alTerminar: (r) => setEnviado(r) });

  if (q.isLoading) return <Cargando />;
  const { categorias = [], cargos_unicos = [], consentimiento_version } = q.data ?? {};

  return (
    <div className="max-w-contenido mx-auto px-gutter-sm lg:px-margin pt-space-lg">
      <Encabezado etiqueta="Cuota social 2026 · vigente desde junio" titulo="Asociate al club" subtitulo="La cuota social no incluye las actividades con profesor, que se cobran aparte. La baja la solicita el socio." />
      <div className="grid lg:grid-cols-5 gap-space-lg">
        <div className="lg:col-span-2 space-y-space-md">
          <Tarjeta titulo="Valores mensuales" icono="payments" cuerpo="p-space-md space-y-2">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface">
                <div>
                  <p className="font-label-lg text-label-lg">{c.nombre}</p>
                  <p className="text-body-sm text-secondary">
                    {c.regla_cuota.tipo === 'familia' ? `Por integrante, grupos de ${c.regla_cuota.min}${c.regla_cuota.min === 4 ? ' o más' : ''}` : c.edad_max ? `${c.edad_min} a ${c.edad_max} años` : `Desde ${c.edad_min} años`}
                  </p>
                </div>
                <p className="text-headline-sm font-extrabold whitespace-nowrap">{pesos(c.regla_cuota.valor)}{c.regla_cuota.tipo === 'familia' && <span className="text-body-sm font-normal text-secondary"> c/u</span>}</p>
              </div>
            ))}
          </Tarjeta>
          <Tarjeta titulo="Cargos únicos" icono="key" cuerpo="p-space-md space-y-2">
            {cargos_unicos.map((c) => (
              <div key={c.concepto} className="flex justify-between gap-3 text-body-sm">
                <span>{c.concepto}<br /><span className="text-secondary">{c.detalle}</span></span>
                <span className="font-bold">{pesos(c.valor)}</span>
              </div>
            ))}
          </Tarjeta>
        </div>

        <div className="lg:col-span-3">
          {enviado ? (
            <Tarjeta cuerpo="p-space-lg text-center flex flex-col items-center gap-3">
              <span className="w-14 h-14 rounded-2xl bg-exito-suave text-exito flex items-center justify-center"><Icono n="check_circle" tam={32} relleno /></span>
              <h2 className="text-headline-md">¡Solicitud enviada!</h2>
              <p className="text-body-md text-secondary max-w-md">{enviado.mensaje}</p>
              <p className="text-body-sm text-secondary">Número de solicitud: <strong>#{enviado.id}</strong></p>
            </Tarjeta>
          ) : (
            <Tarjeta titulo="Solicitud de alta" icono="how_to_reg" franja>
              <form onSubmit={handleSubmit((d) => enviar.mutate(d))} className="grid sm:grid-cols-2 gap-space-md" noValidate>
                <Campo etiqueta="Nombre" error={errors.nombre?.message}><Entrada {...register('nombre')} autoComplete="given-name" /></Campo>
                <Campo etiqueta="Apellido" error={errors.apellido?.message}><Entrada {...register('apellido')} autoComplete="family-name" /></Campo>
                <Campo etiqueta="DNI" error={errors.dni?.message}><Entrada {...register('dni')} inputMode="numeric" /></Campo>
                <Campo etiqueta="Fecha de nacimiento" error={errors.fecha_nacimiento?.message}><Entrada type="date" {...register('fecha_nacimiento')} /></Campo>
                <Campo etiqueta="Email" error={errors.email?.message}><Entrada type="email" {...register('email')} autoComplete="email" /></Campo>
                <Campo etiqueta="Teléfono" error={errors.telefono?.message}><Entrada type="tel" {...register('telefono')} autoComplete="tel" /></Campo>
                <Campo etiqueta="Domicilio" className="sm:col-span-2"><Entrada {...register('domicilio')} autoComplete="street-address" /></Campo>
                <Campo etiqueta="Categoría" className="sm:col-span-2">
                  <Selector {...register('categoria')} opciones={categorias.map((c) => ({ value: c.nombre, label: c.nombre }))} />
                </Campo>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-label-lg text-label-lg">Grupo familiar</p>
                    <Boton chico variante="suave" icono="person_add" onClick={() => familiares.append({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', parentesco: '' })}>Agregar integrante</Boton>
                  </div>
                  {familiares.fields.length === 0 && <p className="text-body-sm text-secondary">Desde 3 integrantes la cuota baja a {pesos(1600000)} por persona; desde 4, a {pesos(1400000)}.</p>}
                  <div className="space-y-3">
                    {familiares.fields.map((f, i) => (
                      <div key={f.id} className="p-3 rounded-xl bg-surface grid sm:grid-cols-5 gap-2 items-end">
                        <Entrada placeholder="Nombre" {...register(`familiares.${i}.nombre`)} />
                        <Entrada placeholder="Apellido" {...register(`familiares.${i}.apellido`)} />
                        <Entrada placeholder="DNI" inputMode="numeric" {...register(`familiares.${i}.dni`)} />
                        <Entrada type="date" {...register(`familiares.${i}.fecha_nacimiento`)} aria-label="Fecha de nacimiento" />
                        <div className="flex gap-2">
                          <Entrada placeholder="Parentesco" {...register(`familiares.${i}.parentesco`)} />
                          <Boton variante="fantasma" icono="delete" aria-label="Quitar" onClick={() => familiares.remove(i)} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {errors.familiares && <p className="text-body-sm text-error mt-1">Completá todos los datos de los integrantes.</p>}
                </div>

                <div className="sm:col-span-2 space-y-3">
                  <Aviso tono="info" titulo={`Consentimiento informado (versión ${consentimiento_version})`}>
                    <p>El Club Los Cooperarios es responsable de la base de datos de socios. Usamos tus datos solo para gestionar tu condición de socio, tus actividades, cobranzas, el control de acceso y, si corresponde, la constancia de aptitud médica. Podés acceder, rectificar o suprimir tus datos desde tu portal o en Administración (Ley 25.326). En menores de edad, el consentimiento lo otorga su tutor.</p>
                  </Aviso>
                  <Casilla {...register('acepta_datos')} etiqueta="Acepto el tratamiento de mis datos personales (y los de los integrantes menores a mi cargo) para las finalidades descriptas." />
                  {errors.acepta_datos && <p className="text-body-sm text-error">{errors.acepta_datos.message}</p>}
                  <Casilla {...register('acepta_comunicaciones')} etiqueta="Quiero recibir comunicados del club por correo y notificaciones." />
                </div>
                <div className="sm:col-span-2">
                  <Boton type="submit" cargando={enviar.isPending} icono="send" completo className="h-12">Enviar solicitud</Boton>
                </div>
              </form>
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  );
}
