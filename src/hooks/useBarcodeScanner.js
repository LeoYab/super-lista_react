import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const SCANNER_CONFIG = {
  fps: 15,
  videoConstraints: {
    facingMode: 'environment',
    width: { ideal: 1280 },
    height: { ideal: 720 }
  },
  formatsToSupport: [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128
  ]
};

// Starts the rear camera in the element with id "reader" while `active`.
// Starts/stops are serialized through `pendingStopRef`: without that, React
// StrictMode's double-invoked effect (or a re-run caused by a changing
// callback) starts a second camera before the first one is released, leaving
// two videos in #reader (sometimes one per camera). Callbacks are read from
// refs so changing them never restarts the camera.
export default function useBarcodeScanner(active, onScan, onStartError) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const onStartErrorRef = useRef(onStartError);
  const pendingStopRef = useRef(Promise.resolve());

  useEffect(() => {
    onScanRef.current = onScan;
    onStartErrorRef.current = onStartError;
  });

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    let scanner = null;

    const started = pendingStopRef.current
      .then(async () => {
        if (cancelled) return;
        scanner = new Html5Qrcode('reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          SCANNER_CONFIG,
          (text, result) => onScanRef.current(text, result),
          () => { }
        );
      })
      .catch(err => {
        if (!cancelled) onStartErrorRef.current(err);
      });

    return () => {
      cancelled = true;
      pendingStopRef.current = started.then(async () => {
        if (!scanner) return;
        try { await scanner.stop(); } catch (e) { /* not running */ }
        try { scanner.clear(); } catch (e) { /* already cleared */ }
        if (scannerRef.current === scanner) scannerRef.current = null;
      });
    };
  }, [active]);

  return scannerRef;
}
