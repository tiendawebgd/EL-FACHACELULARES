import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import {
  getTransparentLogoDataUrl,
  LOGO_BANNER_URL,
  LOGO_MASCOT_URL,
} from '../utils/logoProcessor';

interface BrandLogoProps {
  variant?: 'mascot' | 'banner';
  alt?: string;
  className?: string;
}

export function BrandLogo({
  variant = 'mascot',
  alt = 'El Facha Celulares',
  className = 'w-10 h-10 object-contain',
}: BrandLogoProps) {
  const sourceUrl = variant === 'banner' ? LOGO_BANNER_URL : LOGO_MASCOT_URL;
  const [src, setSrc] = useState<string>(sourceUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    getTransparentLogoDataUrl(sourceUrl, {
      removeEdgeBlack: true,
      blackThreshold: variant === 'banner' ? 24 : 32,
    })
      .then((processed) => {
        if (active) setSrc(processed);
      })
      .catch(() => {
        if (active) setSrc(sourceUrl);
      });
    return () => {
      active = false;
    };
  }, [sourceUrl, variant]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0 ${className}`}
        aria-label={alt}
      >
        <Smartphone className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
