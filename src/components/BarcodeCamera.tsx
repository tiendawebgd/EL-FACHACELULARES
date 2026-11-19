import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw, ZoomIn } from 'lucide-react';

interface BarcodeCameraProps {
  active: boolean;
  continuous?: boolean;
  cooldownMs?: number;
  compact?: boolean;
  onScan: (code: string) => void;
  onClose?: () => void;
  onErrorMessage?: (msg: string) => void;
}

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
];

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  const coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches &&
    window.innerWidth < 1024;
  return uaMobile || coarsePointer;
}

function isFrontCameraLabel(label: string): boolean {
  return /\b(front|user|selfie|facetime|frontal|delantera)\b/i.test(label);
}

function isExcludedSecondaryLens(label: string): boolean {
  return /(ultra[-\s]?wide|ultrawide|ultra\s*gran\s*angular|gran\s*angular|super\s*angular|wide[-\s]?angle|0[.,][456]x?|telephoto|teleobjetivo|\btele\b|\bmacro\b|\bdepth\b|profundidad|\btof\b|\bir\b|bokeh|monochrome|monocrom|\bdual\b|\btriple\b|virtual)/i.test(
    label
  );
}

function scoreRearCamera(label: string, index: number): number {
  const lower = label.toLowerCase();
  if (isFrontCameraLabel(lower)) return -2000;

  let score = 0;
  if (/(back|rear|environment|trasera|posterior)/i.test(lower)) score += 120;
  if (/(\b1x\b|main|principal|standard|est[aá]ndar|camera2\s*0|camera\s*0|cam\s*0)/i.test(lower)) {
    score += 150;
  }
  if (/^(back camera|c[aá]mara trasera)$/i.test(lower.trim())) {
    score += 140;
  }
  // Penalize non-0 camera2 modules on Android when explicit camera2 1/2/3/4 appears
  if (/camera2?\s*[1-9]\b/i.test(lower)) score -= 80;
  if (isExcludedSecondaryLens(lower)) score -= 500;

  // Earlier enumerated rear camera is typically the primary 1X module
  score -= index * 5;
  return score;
}

async function discoverRearCameras(): Promise<{
  cameras: MediaDeviceInfo[];
  mobileLocked: boolean;
}> {
  let devices = await navigator.mediaDevices.enumerateDevices();
  let videoInputs = devices.filter((d) => d.kind === 'videoinput');

  const needsLabels = videoInputs.length > 0 && videoInputs.every((d) => !d.label);
  if (needsLabels) {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      tempStream.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
      videoInputs = devices.filter((d) => d.kind === 'videoinput');
    } catch {
      // Permission or enumeration fallback
    }
  }

  const rearNonFront = videoInputs.filter((d) => !isFrontCameraLabel(d.label));
  const rearPool = rearNonFront.length > 0 ? rearNonFront : videoInputs;

  // Strictly remove ultra-wide / gran angular / macro / tele / virtual lenses when a clean 1X lens exists
  const primaryCleanPool = rearPool.filter((d) => !isExcludedSecondaryLens(d.label));
  const candidatePool = primaryCleanPool.length > 0 ? primaryCleanPool : rearPool;

  const sorted = [...candidatePool].sort((a, b) => {
    const idxA = candidatePool.indexOf(a);
    const idxB = candidatePool.indexOf(b);
    return scoreRearCamera(b.label, idxB) - scoreRearCamera(a.label, idxA);
  });

  const mobile = isMobileDevice();
  if (mobile && sorted.length > 0) {
    // On mobile phones, lock strictly to the single best primary rear camera (no ultra-wide switching)
    return { cameras: [sorted[0]], mobileLocked: true };
  }

  return { cameras: sorted, mobileLocked: false };
}

export function BarcodeCamera({
  active,
  continuous = false,
  cooldownMs = 2000,
  compact = false,
  onScan,
  onClose,
  onErrorMessage,
}: BarcodeCameraProps) {
  const rawId = useId();
  const readerId = `facha-qr-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const mountedRef = useRef(true);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mobileLocked, setMobileLocked] = useState(false);
  const [cameraIdx, setCameraIdx] = useState(0);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomVal, setZoomVal] = useState(1.0);
  const [maxZoom, setMaxZoom] = useState(1.0);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    trackRef.current = null;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch {
        // Ignore stop errors
      }
      try {
        instance.clear();
      } catch {
        // Ignore clear errors
      }
    }
  }, []);

  const applyCameraCapabilities = useCallback(async () => {
    const container = document.getElementById(readerId);
    const video = container?.querySelector('video') as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()?.[0] ?? null;
    trackRef.current = track;

    if (!track || typeof track.getCapabilities !== 'function') {
      setZoomSupported(false);
      setZoomVal(1.0);
      setMaxZoom(1.0);
      return;
    }

    const caps = track.getCapabilities() as MediaTrackCapabilities & {
      zoom?: { min: number; max: number; step?: number };
      focusMode?: string[];
    };

    const advancedConstraints: Record<string, unknown>[] = [];
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      advancedConstraints.push({ focusMode: 'continuous' });
    }

    if (caps.zoom && typeof caps.zoom.max === 'number') {
      const clampedMin = Math.max(1.0, caps.zoom.min ?? 1.0);
      const clampedMax = Math.max(clampedMin, caps.zoom.max);
      const initialZoom = Math.max(clampedMin, Math.min(clampedMax, 1.0));
      setZoomSupported(clampedMax > 1.05);
      setMaxZoom(Number(clampedMax.toFixed(1)));
      setZoomVal(Number(initialZoom.toFixed(1)));
      advancedConstraints.push({ zoom: initialZoom });
    } else {
      setZoomSupported(false);
      setZoomVal(1.0);
      setMaxZoom(1.0);
    }

    if (advancedConstraints.length > 0) {
      try {
        await track.applyConstraints({
          advanced: advancedConstraints as MediaTrackConstraintSet[],
        });
      } catch {
        // Device does not allow one of the advanced constraints; continue gracefully
      }
    }
  }, [readerId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopScanner();
    };
  }, [stopScanner]);

  useEffect(() => {
    if (!active) {
      void stopScanner();
      return;
    }

    let cancelled = false;

    const bootCamera = async () => {
      setStarting(true);
      setStatusError(null);

      if (!window.isSecureContext || !navigator.mediaDevices) {
        const msg = 'La cámara requiere conexión segura (HTTPS).';
        setStatusError(msg);
        onErrorMessage?.(msg);
        setStarting(false);
        return;
      }

      try {
        const { cameras: discovered, mobileLocked: locked } = await discoverRearCameras();
        if (cancelled || !mountedRef.current) return;
        setCameras(discovered);
        setMobileLocked(locked);

        const safeIdx = locked ? 0 : cameraIdx % Math.max(1, discovered.length);
        const chosen = discovered[safeIdx];
        await stopScanner();
        if (cancelled || !mountedRef.current) return;

        const scanner = new Html5Qrcode(readerId, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        });
        scannerRef.current = scanner;

        const cameraConstraint: MediaTrackConstraints = chosen?.deviceId
          ? {
              deviceId: { exact: chosen.deviceId },
              width: { ideal: 1280 },
              height: { ideal: 960 },
              aspectRatio: { ideal: 4 / 3 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 960 },
              aspectRatio: { ideal: 4 / 3 },
            };

        await scanner.start(
          chosen?.deviceId ? chosen.deviceId : { facingMode: 'environment' },
          {
            fps: 12,
            aspectRatio: 4 / 3,
            qrbox: compact ? { width: 220, height: 110 } : { width: 260, height: 140 },
            videoConstraints: cameraConstraint,
          },
          (decodedText) => {
            const clean = String(decodedText || '').trim();
            if (!clean) return;
            const now = Date.now();
            if (
              lastScanRef.current.code === clean &&
              now - lastScanRef.current.at < cooldownMs
            ) {
              return;
            }
            lastScanRef.current = { code: clean, at: now };
            if (navigator.vibrate) navigator.vibrate(80);
            onScanRef.current(clean);
            if (!continuous) {
              void stopScanner();
            }
          },
          () => {}
        );

        if (!cancelled && mountedRef.current) {
          await applyCameraCapabilities();
        }
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        const msg = String((err as Error)?.name || (err as Error)?.message || err);
        let friendly = 'No se pudo iniciar la cámara.';
        if (/NotAllowed|Permission/i.test(msg)) {
          friendly = 'Permiso de cámara denegado. Habilitalo en el navegador.';
        } else if (/NotFound|Requested device not found/i.test(msg)) {
          friendly = 'No se encontró una cámara trasera disponible.';
        }
        setStatusError(friendly);
        onErrorMessage?.(friendly);
      } finally {
        if (!cancelled && mountedRef.current) {
          setStarting(false);
        }
      }
    };

    void bootCamera();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [
    active,
    cameraIdx,
    compact,
    continuous,
    cooldownMs,
    readerId,
    applyCameraCapabilities,
    stopScanner,
    onErrorMessage,
  ]);

  const handleZoomChange = async (nextZoom: number) => {
    const clamped = Math.max(1.0, Math.min(maxZoom, nextZoom));
    setZoomVal(clamped);
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
      });
    } catch {
      // Ignore unsupported dynamic zoom update
    }
  };

  if (!active) return null;

  return (
    <div className="rounded-xl bg-slate-950 border border-slate-700 p-3 text-white">
      <div className="relative w-full max-w-[400px] mx-auto aspect-[4/3] rounded-lg overflow-hidden bg-black">
        <div id={readerId} className="w-full h-full [&_video]:object-cover" />
        {starting && (
          <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-xs text-slate-300">
            Iniciando cámara 1X...
          </div>
        )}
      </div>

      {statusError && (
        <p className="mt-2 text-xs text-red-400 text-center font-medium">{statusError}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {zoomSupported ? (
          <div className="flex items-center gap-2 flex-1 min-w-[160px]">
            <ZoomIn className="w-4 h-4 text-emerald-400 shrink-0" />
            <input
              type="range"
              min={1.0}
              max={maxZoom}
              step={0.1}
              value={zoomVal}
              onChange={(e) => void handleZoomChange(parseFloat(e.target.value))}
              aria-label="Zoom de cámara"
              className="flex-1 accent-emerald-500 cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-emerald-300 w-10 text-right">
              {zoomVal.toFixed(1)}x
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>{mobileLocked ? 'Cámara principal 1X' : 'Lente 1.0x (4:3)'}</span>
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {!mobileLocked && cameras.length > 1 && (
            <button
              type="button"
              onClick={() => setCameraIdx((prev) => (prev + 1) % cameras.length)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cambiar cámara</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>Cerrar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
