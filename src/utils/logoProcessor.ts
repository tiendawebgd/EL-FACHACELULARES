export const LOGO_MASCOT_URL = '/assets/aistudio/logo_8ca7919d.png';
export const LOGO_BANNER_URL = '/assets/aistudio/logo_facha_13e5fef3.png';

const processedCache = new Map<string, string>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Loads an image onto an offscreen <canvas> and removes solid black backgrounds
 * (flood-fill from image edges plus dark-pixel threshold for enclosed black regions)
 * to produce a clean PNG data URL with true alpha transparency.
 */
export async function getTransparentLogoDataUrl(
  src: string = LOGO_MASCOT_URL,
  options: { removeEdgeBlack?: boolean; blackThreshold?: number } = {}
): Promise<string> {
  const key = `transparent:${src}:${options.blackThreshold ?? 32}`;
  const cached = processedCache.get(key);
  if (cached) return cached;

  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;
  const threshold = options.blackThreshold ?? 32;

  const isNearBlack = (idx: number): boolean => {
    const a = data[idx + 3];
    if (a < 10) return true;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const maxC = Math.max(r, g, b);
    return maxC <= threshold;
  };

  if (options.removeEdgeBlack !== false) {
    // Flood-fill from all four edges to preserve dark details inside the phone screen
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;

    const enqueue = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const pos = y * width + x;
      if (visited[pos]) return;
      if (!isNearBlack(pos * 4)) return;
      visited[pos] = 1;
      queue[tail++] = pos;
    };

    for (let x = 0; x < width; x++) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }

    while (head < tail) {
      const pos = queue[head++];
      const x = pos % width;
      const y = (pos - x) / width;
      data[pos * 4 + 3] = 0;
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }

    // Soft feathering on 1px border around cleared background
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const pos = y * width + x;
        if (visited[pos]) continue;
        const idx = pos * 4;
        const maxC = Math.max(data[idx], data[idx + 1], data[idx + 2]);
        if (maxC < threshold + 22) {
          const touchesCleared =
            visited[pos - 1] || visited[pos + 1] || visited[pos - width] || visited[pos + width];
          if (touchesCleared) {
            data[idx + 3] = Math.round(data[idx + 3] * ((maxC - threshold) / 22) * 0.6);
          }
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const result = canvas.toDataURL('image/png');
  processedCache.set(key, result);
  return result;
}

/**
 * Produces a high-contrast black-and-white logo tuned for thermal printers (80mm / 58mm).
 */
export async function getThermalBWLogoDataUrl(src: string = LOGO_MASCOT_URL): Promise<string> {
  const key = `thermal:${src}`;
  const cached = processedCache.get(key);
  if (cached) return cached;

  const transparentUrl = await getTransparentLogoDataUrl(src);
  const img = await loadImage(transparentUrl);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return transparentUrl;

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 25) {
      data[i + 3] = 0;
      continue;
    }
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // High-contrast monochrome mapping suitable for thermal paper
    const bw = lum > 175 ? 255 : lum > 95 ? 45 : 0;
    data[i] = bw;
    data[i + 1] = bw;
    data[i + 2] = bw;
  }

  ctx.putImageData(imageData, 0, 0);
  const result = canvas.toDataURL('image/png');
  processedCache.set(key, result);
  return result;
}

/**
 * Returns base64 payload (without data URL prefix) for embedding into ExcelJS workbooks.
 */
export async function getLogoBase64ForExcel(src: string = LOGO_MASCOT_URL): Promise<string> {
  const dataUrl = await getTransparentLogoDataUrl(src);
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}
