import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();
export const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function haptic(kind: 'light' | 'medium' = 'light') {
  if (isNative) void Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }).catch(() => undefined);
  else if (isTouch) navigator.vibrate?.(kind === 'light' ? 8 : 16);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Saves an exported file. On iOS it is written to the app's Documents folder
 * (visible in the Files app) and the share sheet opens so it can go to Photos,
 * TikTok, Instagram, etc. On the web it downloads, or uses the Web Share API on phones.
 */
export async function saveFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'saved'> {
  if (isNative) {
    // Write in chunks so long videos don't need one giant base64 string.
    const CHUNK = 3 * 1024 * 1024;
    const path = `Exports/${filename}`;
    for (let off = 0; off < blob.size || off === 0; off += CHUNK) {
      const data = await blobToBase64(blob.slice(off, off + CHUNK));
      if (off === 0) await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
      else await Filesystem.appendFile({ path, data, directory: Directory.Documents });
      if (blob.size === 0) break;
    }
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
    try {
      await Share.share({ title: filename, files: [uri] });
      return 'shared';
    } catch {
      // User dismissed the share sheet; the file is still in Files › Xmotion › Exports.
      return 'saved';
    }
  }
  const file = new File([blob], filename, { type: blob.type });
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch {
      /* fall back to a download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

/**
 * Whether the web version can hand files to the share sheet (iPhone/iPad
 * Safari: Save Video / Save Image to Photos). It only opens from a tap.
 */
export function canShareFiles(): boolean {
  if (isNative || !isTouch || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([''], 'x.mp4', { type: 'video/mp4' })] });
  } catch {
    return false;
  }
}

/** Opens the system file / photo picker. */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((res) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.onchange = () => {
      res(Array.from(input.files ?? []));
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}
