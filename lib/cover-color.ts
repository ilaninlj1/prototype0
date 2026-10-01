// A cover's colors, read from a 3x3 PNG of it. iTunes serves any artwork
// at any size (…/3x3bb.png), so nine pixels cost one tiny request and no
// native module. Pure — the fetch and cache live in hooks/use-cover-colors.ts.

export type Rgb = [number, number, number];
/** The color a song paints its part of the Tasteform with, and the hue family it sorts into. */
export type CoverColor = { main: Rgb; hue: number; neutral: boolean };

/** The same artwork as a 3x3 PNG. */
export function tinyArtworkUrl(url: string): string {
  return url.replace(/\d+x\d+bb\.jpg$/, '3x3bb.png');
}

/** Pixels of a small 8-bit PNG (gray, RGB, gray+alpha or RGBA), or null for anything else. `inflate` undoes zlib (fflate's unzlibSync). */
export function decodeTinyPng(bytes: Uint8Array, inflate: (data: Uint8Array) => Uint8Array): Rgb[] | null {
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const u32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= bytes.length;) {
    const len = u32(i);
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const data = bytes.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      width = u32(i + 8);
      height = u32(i + 12);
      const depth = data[8];
      channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[data[9]] ?? 0;
      if (depth !== 8 || data[12] !== 0 || !channels) return null;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (!width || !height || width * height > 64 || !idat.length) return null;

  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((at, d) => (joined.set(d, at), at + d.length), 0);
  let raw: Uint8Array;
  try {
    raw = inflate(joined);
  } catch {
    return null;
  }

  // Undo each row's filter (PNG spec §9), in place.
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (v + add) & 0xff;
    }
  }

  const out: Rgb[] = [];
  for (let i = 0; i < width * height; i++) {
    const p = i * channels;
    out.push(channels < 3 ? [px[p], px[p], px[p]] : [px[p], px[p + 1], px[p + 2]]);
  }
  return out;
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * The cover's most colorful pixel, lifted so it glows on navy: a black cover
 * would vanish into the room and a white one would glare. Mostly-gray covers
 * stay gray and sort as neutral.
 */
export function coverColor(pixels: Rgb[]): CoverColor | null {
  if (!pixels.length) return null;
  const chroma = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b);
  const best = pixels.reduce((a, p) => (chroma(p) > chroma(a) ? p : a));
  const [h, s, l] = toHsl(best);
  const neutral = chroma(best) < 40;
  const lift = neutral ? Math.min(0.72, Math.max(0.5, l)) : Math.min(0.66, Math.max(0.46, l));
  return {
    main: fromHsl(h, neutral ? s * 0.4 : Math.max(0.55, s), lift),
    hue: Math.round(h),
    neutral,
  };
}

export const rgb = ([r, g, b]: Rgb, a = 1) => (a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`);
