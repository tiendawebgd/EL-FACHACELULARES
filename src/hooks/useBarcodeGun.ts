import { useEffect, useRef } from 'react';

interface UseBarcodeGunOptions {
  enabled?: boolean;
  /** Called when a barcode scan finishes outside a form input */
  onScan: (code: string) => void;
  /** Called whenever a rapid HID barcode-gun burst is detected (anywhere, including barcode inputs) */
  onGunDetected?: (code: string) => void;
}

const MAX_INTER_KEY_MS = 85;
const MIN_GUN_CODE_LENGTH = 3;

function isBarcodeDedicatedInput(el: HTMLElement | null): boolean {
  return Boolean(el && el.dataset?.barcodeInput === 'true');
}

function isEditableElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.isContentEditable
  );
}

/**
 * Automatically detects USB / Bluetooth HID barcode scanner guns globally.
 * - Captures rapid keystroke bursts (< 85ms between keys) ending in Enter/NumpadEnter/Tab
 *   even when no input field is focused, preventing accidental clicks on focused buttons.
 * - Passively detects gun bursts inside dedicated [data-barcode-input="true"] inputs
 *   to update the "Pistola detectada" indicator without interfering with manual typing.
 */
export function useBarcodeGun({
  enabled = true,
  onScan,
  onGunDetected,
}: UseBarcodeGunOptions): void {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const onGunDetectedRef = useRef(onGunDetected);
  onGunDetectedRef.current = onGunDetected;

  const globalBurstRef = useRef<{
    chars: string[];
    firstTime: number;
    lastTime: number;
  }>({ chars: [], firstTime: 0, lastTime: 0 });

  const inputBurstRef = useRef<{
    chars: string[];
    firstTime: number;
    lastTime: number;
  }>({ chars: [], firstTime: 0, lastTime: 0 });

  useEffect(() => {
    if (!enabled) {
      globalBurstRef.current = { chars: [], firstTime: 0, lastTime: 0 };
      inputBurstRef.current = { chars: [], firstTime: 0, lastTime: 0 };
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      const target = e.target as HTMLElement | null;
      const now = performance.now();
      const inEditable = isEditableElement(target);
      const inDedicatedInput = isBarcodeDedicatedInput(target);

      const isSubmitKey =
        e.key === 'Enter' ||
        e.code === 'NumpadEnter' ||
        e.key === 'Tab';

      if (inEditable) {
        globalBurstRef.current = { chars: [], firstTime: 0, lastTime: 0 };

        if (!inDedicatedInput) {
          inputBurstRef.current = { chars: [], firstTime: 0, lastTime: 0 };
          return;
        }

        const burst = inputBurstRef.current;
        if (isSubmitKey) {
          if (burst.chars.length >= MIN_GUN_CODE_LENGTH) {
            const avgGap =
              (burst.lastTime - burst.firstTime) /
              Math.max(1, burst.chars.length - 1);
            if (avgGap <= 60) {
              const code = burst.chars.join('').trim();
              if (code.length >= MIN_GUN_CODE_LENGTH) {
                onGunDetectedRef.current?.(code);
              }
            }
          }
          inputBurstRef.current = { chars: [], firstTime: 0, lastTime: 0 };
          return;
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (burst.chars.length === 0 || now - burst.lastTime > MAX_INTER_KEY_MS) {
            inputBurstRef.current = { chars: [e.key], firstTime: now, lastTime: now };
          } else {
            burst.chars.push(e.key);
            burst.lastTime = now;
          }
        }
        return;
      }

      // Not inside an editable form field: capture global HID scanner gun stream
      const burst = globalBurstRef.current;

      if (isSubmitKey) {
        const len = burst.chars.length;
        const avgGap =
          len > 1 ? (burst.lastTime - burst.firstTime) / (len - 1) : 0;
        const isFastTab = e.key === 'Tab' && len >= 4 && avgGap <= 55;
        const isEnter = e.key === 'Enter' || e.code === 'NumpadEnter';

        if (len >= MIN_GUN_CODE_LENGTH && (isEnter || isFastTab) && avgGap <= MAX_INTER_KEY_MS) {
          const code = burst.chars.join('').trim();
          globalBurstRef.current = { chars: [], firstTime: 0, lastTime: 0 };
          if (code.length >= MIN_GUN_CODE_LENGTH) {
            // Prevent focused buttons from being clicked by the scanner's trailing Enter/Tab
            e.preventDefault();
            e.stopPropagation();
            onGunDetectedRef.current?.(code);
            onScanRef.current(code);
          }
          return;
        }

        globalBurstRef.current = { chars: [], firstTime: 0, lastTime: 0 };
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (burst.chars.length === 0 || now - burst.lastTime > MAX_INTER_KEY_MS) {
          globalBurstRef.current = { chars: [e.key], firstTime: now, lastTime: now };
        } else {
          burst.chars.push(e.key);
          burst.lastTime = now;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
}
