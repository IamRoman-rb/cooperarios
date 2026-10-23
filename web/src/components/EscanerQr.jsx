// Lectura de QR con la cámara del celular o tablet (BarcodeDetector del navegador).
// Si el navegador no lo soporta, se puede pegar el código o validar por DNI.
import { useEffect, useRef, useState } from 'react';
import { Icono, Boton } from './ui.jsx';

export function EscanerQr({ onCodigo, pausado }) {
  const video = useRef(null);
  const [estado, setEstado] = useState('inactivo');
  const soportado = typeof window !== 'undefined' && 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
  const ultimo = useRef({ codigo: null, en: 0 });

  useEffect(() => {
    if (estado !== 'activo') return undefined;
    let stream;
    let cancelado = false;
    let detector;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelado) return;
        video.current.srcObject = stream;
        await video.current.play();
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const bucle = async () => {
          if (cancelado) return;
          if (!pausado && video.current?.readyState >= 2) {
            const codigos = await detector.detect(video.current).catch(() => []);
            const valor = codigos[0]?.rawValue;
            // Evita leer dos veces el mismo código en ráfaga.
            if (valor && (valor !== ultimo.current.codigo || Date.now() - ultimo.current.en > 4000)) {
              ultimo.current = { codigo: valor, en: Date.now() };
              onCodigo(valor);
            }
          }
          setTimeout(bucle, 250);
        };
        bucle();
      } catch {
        setEstado('error');
      }
    })();
    return () => { cancelado = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [estado, onCodigo, pausado]);

  if (!soportado) {
    return (
      <div className="aspect-square max-h-72 w-full rounded-2xl bg-graphite text-white/80 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Icono n="no_photography" tam={36} />
        <p className="text-body-sm">Este navegador no lee QR con la cámara. Usá Chrome en Android, pegá el código o validá por DNI.</p>
      </div>
    );
  }
  return (
    <div className="relative aspect-square max-h-80 w-full rounded-2xl bg-graphite overflow-hidden">
      <video ref={video} className="w-full h-full object-cover" muted playsInline />
      {estado !== 'activo' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
          <Icono n={estado === 'error' ? 'videocam_off' : 'qr_code_scanner'} tam={48} />
          {estado === 'error' && <p className="text-body-sm">No se pudo abrir la cámara. Revisá los permisos.</p>}
          <Boton variante="blanco" icono="photo_camera" onClick={() => setEstado('activo')}>Activar cámara</Boton>
        </div>
      ) : (
        <div className="absolute inset-8 border-4 border-white/80 rounded-2xl pointer-events-none" />
      )}
    </div>
  );
}
