// Descarga de archivos con control de acceso por rol y por titularidad.
import { Router } from 'express';
import fs from 'node:fs';
import { getDb } from '../db/index.js';
import { requiereSesion } from '../lib/auth.js';
import { puede } from '../lib/rbac.js';
import { noEncontrado, prohibido } from '../lib/util.js';
import { rutaAbsoluta, CATEGORIAS } from '../services/archivos.js';
import { personasACargo } from './socio.js';
import { auditar } from '../lib/auditoria.js';

const r = Router();
r.use(requiereSesion);

function autorizado(req, categoria, relativa) {
  const db = getDb();
  const u = req.usuario;
  switch (categoria) {
    case 'fotos':
    case 'documentos':
      return true;
    case 'tickets': {
      if (puede(u, 'tickets', 'leer', 'gestionar')) return true;
      const t = db.prepare('SELECT t.reportado_por, t.asignado_a FROM ticket_fotos f JOIN tickets_mantenimiento t ON t.id = f.ticket_id WHERE f.archivo = ?').get(relativa);
      return !!t && (t.reportado_por === u.id || t.asignado_a === u.id);
    }
    case 'certificados': {
      // Dato sensible: médico y auxiliar, y el titular (o su tutor).
      if (puede(u, 'resultados_medicos', 'gestionar', 'solicitar')) return true;
      const persona = db.prepare('SELECT persona_id FROM revisiones_medicas WHERE certificado_externo = ?').pluck().get(relativa);
      return !!persona && personasACargo(u).includes(persona);
    }
    case 'comprobantes': {
      if (puede(u, 'pagos_online', 'leer', 'gestionar') || puede(u, 'ingresos', 'leer')) return true;
      const persona = db.prepare('SELECT persona_id FROM transferencias_informadas WHERE comprobante_archivo = ?').pluck().get(relativa);
      return !!persona && personasACargo(u).includes(persona);
    }
    case 'gastos':
      return puede(u, 'gastos', 'leer', 'aprobar', 'gestionar');
    case 'actas':
      return puede(u, 'actas', 'leer', 'leer_ambito', 'gestionar');
    default:
      return false;
  }
}

r.get('/:categoria/:archivo', (req, res) => {
  const { categoria, archivo } = req.params;
  if (!CATEGORIAS.includes(categoria) || !/^[\w-]+\.(jpg|png|webp|pdf)$/.test(archivo)) throw noEncontrado('Archivo');
  const relativa = `${categoria}/${archivo}`;
  if (!autorizado(req, categoria, relativa)) throw prohibido();
  const abs = rutaAbsoluta(relativa);
  if (!fs.existsSync(abs)) throw noEncontrado('Archivo');
  if (categoria === 'certificados') auditar(req, 'ver_certificado', 'revisiones_medicas', null, null, { archivo: relativa });
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(abs);
});

export default r;
