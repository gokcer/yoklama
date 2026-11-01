import { MSG } from '../shared/messages';

export interface CameraInfo {
  stream: MediaStream;
  track: MediaStreamTrack;
  deviceId: string;
  width: number;
  height: number;
  label: string;
}

const PREFERRED: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
};

export async function openCamera(): Promise<CameraInfo> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(MSG.student.cameraInsecure, 'NotSupportedError');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: PREFERRED });
  } catch (e: unknown) {
    // Relax the constraints once (06 §5.3).
    if (e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    } else {
      throw e;
    }
  }
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  return {
    stream,
    track,
    deviceId: settings.deviceId ?? '',
    width: settings.width ?? 640,
    height: settings.height ?? 480,
    label: track.label,
  };
}

export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach(t => t.stop());
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Turkish, user-facing explanation for a getUserMedia failure. */
export function cameraErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : (e as { name?: string })?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError': {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const hint = /iPhone|iPad|iPod/.test(ua) ? MSG.student.cameraHintIos : MSG.student.cameraHintAndroid;
      return `${MSG.student.cameraPermissionDenied} ${hint}`;
    }
    case 'NotFoundError':
    case 'OverconstrainedError': return MSG.student.cameraNotFound;
    case 'NotReadableError':
    case 'AbortError': return MSG.student.cameraBusy;
    case 'NotSupportedError': return MSG.student.cameraInsecure;
    default: return MSG.errors.generic;
  }
}
