// Camera access + the optional controls Chrome Android exposes (torch, zoom, focus).
// Support varies per phone, so every control is driven by getCapabilities().

export interface CamCaps {
  torch: boolean;
  zoom: { min: number; max: number; step: number } | null;
  focusModes: string[];
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

export async function openCamera(deviceId: string | null): Promise<MediaStream> {
  const video: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...video, deviceId: { exact: deviceId } },
        audio: false,
      });
    } catch {
      // remembered camera no longer exists — fall back to the default rear camera
    }
  }
  return navigator.mediaDevices.getUserMedia({
    video: { ...video, facingMode: { ideal: 'environment' } },
    audio: false,
  });
}

export function capsOf(track: MediaStreamTrack): CamCaps {
  // torch/zoom/focusMode are not in the TS DOM lib yet
  const c = (track.getCapabilities?.() ?? {}) as Record<string, any>;
  const z = c.zoom;
  return {
    torch: !!c.torch,
    zoom: z && z.max > z.min ? { min: z.min, max: z.max, step: z.step || 0.1 } : null,
    focusModes: Array.isArray(c.focusMode) ? c.focusMode : [],
  };
}

export async function applyAdvanced(track: MediaStreamTrack, c: Record<string, unknown>) {
  await track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
