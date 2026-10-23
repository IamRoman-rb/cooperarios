// Gráficos livianos en SVG/HTML, con la paleta institucional (carmesí, grafito y estados).
import { pesos } from '../lib/formato.js';

export const COLORES = ['#b91c1c', '#1f2937', '#15803d', '#b45309', '#555f6f', '#93000b', '#bdc7d9'];

const compacto = (v, moneda) => {
  if (!moneda) return new Intl.NumberFormat('es-AR', { notation: 'compact' }).format(v);
  return '$' + new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(v / 100);
};

/** Barras verticales agrupadas o apiladas por período. datos: [{etiqueta, ...series}] */
export function Barras({ datos, series, alto = 180, moneda = true, apiladas = false }) {
  const totales = datos.map((d) => (apiladas ? series.reduce((s, x) => s + (d[x.k] ?? 0), 0) : Math.max(...series.map((x) => d[x.k] ?? 0))));
  const max = Math.max(1, ...totales);
  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3" style={{ height: alto }} role="img" aria-label="Gráfico de barras">
        {datos.map((d, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0 group">
            <div className={`w-full flex ${apiladas ? 'flex-col-reverse' : 'items-end gap-0.5'} justify-start h-full`}>
              {series.map((s, j) => {
                const v = d[s.k] ?? 0;
                return (
                  <div key={s.k} title={`${s.label}: ${moneda ? pesos(v) : v}`}
                    className={`${apiladas ? 'w-full' : 'flex-1'} rounded-t-md transition-all group-hover:opacity-90`}
                    style={{ height: `${(v / max) * 100}%`, background: s.color ?? COLORES[j], minHeight: v ? 2 : 0 }} />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 sm:gap-3 mt-1.5">
        {datos.map((d, i) => <span key={i} className="flex-1 text-center text-[10px] sm:text-label-sm text-secondary truncate">{d.etiqueta}</span>)}
      </div>
      {series.length > 1 && <Leyenda series={series} />}
      <p className="sr-only">{datos.map((d) => `${d.etiqueta}: ${series.map((s) => `${s.label} ${compacto(d[s.k] ?? 0, moneda)}`).join(', ')}`).join('. ')}</p>
    </div>
  );
}

export function Leyenda({ series }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
      {series.map((s, j) => (
        <span key={s.k} className="inline-flex items-center gap-1.5 text-body-sm text-secondary">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color ?? COLORES[j] }} /> {s.label}
        </span>
      ))}
    </div>
  );
}

/** Lista con barras horizontales proporcionales. datos: [{etiqueta, valor, detalle?}] */
export function BarrasH({ datos, moneda = true, max: maxFijo, color = '#b91c1c' }) {
  const max = maxFijo ?? Math.max(1, ...datos.map((d) => d.valor));
  return (
    <ul className="space-y-2.5">
      {datos.map((d, i) => (
        <li key={i}>
          <div className="flex justify-between gap-2 text-body-sm mb-1">
            <span className="text-on-surface truncate">{d.etiqueta}</span>
            <span className="font-semibold tabular-nums whitespace-nowrap">{d.detalle ?? (moneda ? pesos(d.valor) : d.valor)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (d.valor / max) * 100)}%`, background: d.color ?? color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Anillo de proporciones. datos: [{etiqueta, valor}] */
export function Dona({ datos, moneda = true, tam = 140, centro }) {
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg width={tam} height={tam} viewBox="0 0 120 120" role="img" aria-label="Gráfico de anillo" className="shrink-0">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e5eeff" strokeWidth="14" />
        {datos.map((d, i) => {
          const largo = (d.valor / total) * c;
          const seg = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={d.color ?? COLORES[i % COLORES.length]} strokeWidth="14"
            strokeDasharray={`${largo} ${c - largo}`} strokeDashoffset={-acumulado} transform="rotate(-90 60 60)" />;
          acumulado += largo;
          return seg;
        })}
        {centro && <text x="60" y="64" textAnchor="middle" className="fill-on-surface" style={{ fontSize: 13, fontWeight: 800 }}>{centro}</text>}
      </svg>
      <ul className="space-y-1.5 w-full">
        {datos.map((d, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-body-sm">
            <span className="inline-flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color ?? COLORES[i % COLORES.length] }} /><span className="truncate">{d.etiqueta}</span></span>
            <span className="font-semibold tabular-nums">{moneda ? pesos(d.valor) : d.valor} <span className="text-secondary font-normal">({Math.round((d.valor / total) * 100)}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
