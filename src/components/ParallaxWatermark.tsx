import { useEffect, useState } from 'react';
import { getTransparentLogoDataUrl, LOGO_BANNER_URL } from '../utils/logoProcessor';

export function ParallaxWatermark() {
  const [logoSrc, setLogoSrc] = useState<string>(LOGO_BANNER_URL);
  const [tilt, setTilt] = useState<{ rx: number; ry: number; tx: number; ty: number }>({
    rx: -5,
    ry: 8,
    tx: 0,
    ty: 0,
  });

  useEffect(() => {
    let active = true;
    getTransparentLogoDataUrl(LOGO_BANNER_URL, { removeEdgeBlack: true, blackThreshold: 24 })
      .then((url) => {
        if (active) setLogoSrc(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;

    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      setTilt({
        rx: -ny * 9,
        ry: nx * 12,
        tx: nx * 14,
        ty: ny * 10,
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden select-none lg:pl-64"
    >
      <div
        className="parallax-watermark-layer w-[min(78vw,520px)] h-auto opacity-[0.11] transition-transform duration-200 ease-out drop-shadow-[0_18px_28px_rgba(15,23,42,0.22)]"
        style={{
          transform: `perspective(900px) translate3d(${tilt.tx}px, ${tilt.ty}px, 0) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        }}
      >
        <img
          src={logoSrc}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-auto object-contain rounded-2xl"
        />
      </div>
    </div>
  );
}
