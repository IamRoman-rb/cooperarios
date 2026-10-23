import { useState } from 'react';
import { Pestanas } from '../../components/ui.jsx';
import ResumenFinanciero from '../compartidas/ResumenFinanciero.jsx';
import Presupuesto from '../compartidas/Presupuesto.jsx';
import Reportes from '../contabilidad/Reportes.jsx';

/** Lectura de estados financieros y presupuesto. */
export default function Finanzas() {
  const [vista, setVista] = useState('resumen');
  return (
    <>
      <Pestanas valor={vista} onChange={setVista} opciones={[{ value: 'resumen', label: 'Estado financiero', icono: 'monitoring' }, { value: 'presupuesto', label: 'Presupuesto', icono: 'savings' }, { value: 'reportes', label: 'Flujo y resultados', icono: 'analytics' }]} />
      {vista === 'resumen' && <ResumenFinanciero />}
      {vista === 'presupuesto' && <Presupuesto />}
      {vista === 'reportes' && <Reportes />}
    </>
  );
}
