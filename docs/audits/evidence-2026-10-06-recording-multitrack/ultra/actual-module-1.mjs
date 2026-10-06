// ^@capacitor\/core$:@capacitor/core
var Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };

// audioSessionRoute$:./audioSessionRoute
var audioSessionRoute_default = globalThis.__routePort;

// headphoneOutput$:./headphoneOutput
var isHeadphoneOutputActive = () => false;

// src/utils/stereoPlaybackRoute.ts
var holdCount = 0;
var nativeRouteEngaged = false;
var nativeStereoPermanentlySkipped = false;
var recordingRouteRestoredHandler = null;
function registerRecordingRouteRestoredHandler(handler) {
  recordingRouteRestoredHandler = handler;
}
function shouldAttemptNativeStereoRoute() {
  if (!Capacitor.isNativePlatform()) return false;
  if (nativeStereoPermanentlySkipped) return false;
  return true;
}
async function isCameraSessionActive() {
  try {
    const snapshot = await audioSessionRoute_default.getCameraSessionState();
    if (snapshot.previewActive === true || snapshot.recordingActive === true) {
      return true;
    }
    return snapshot.recordingMode === "video";
  } catch {
    return false;
  }
}
function markNativeStereoUnavailable(error) {
  console.warn(
    "[AudioRoute] Native stereo route apply failed; Web Audio playback unchanged.",
    error
  );
}
function snapshotIndicatesNativeRouteEngaged(snapshot) {
  if (snapshot.playbackRouteStyle === "coexistent" || snapshot.playbackRouteStyle === "full") {
    return true;
  }
  return snapshot.routeApplied !== false;
}
var engageInFlight = null;
async function ensureNativeStereoRouteEngaged() {
  if (!shouldAttemptNativeStereoRoute()) return;
  if (nativeRouteEngaged && !engageInFlight) return;
  if (!engageInFlight) {
    engageInFlight = (async () => {
      const snapshot = await audioSessionRoute_default.enableStereoPlayback();
      nativeRouteEngaged = snapshotIndicatesNativeRouteEngaged(snapshot);
      if ("routeApplied" in snapshot && snapshot.routeApplied === false) {
        console.info("[AudioRoute] Web playback route unchanged", snapshot);
      }
    })().catch((error) => {
      markNativeStereoUnavailable(error);
    }).finally(() => {
      engageInFlight = null;
    });
  }
  await engageInFlight;
}
function engageStereoPlayback() {
  if (!Capacitor.isNativePlatform()) return;
  holdCount += 1;
  if (!shouldAttemptNativeStereoRoute()) return;
  void ensureNativeStereoRouteEngaged();
}
async function engageStereoPlaybackAsync() {
  if (!Capacitor.isNativePlatform()) return;
  holdCount += 1;
  if (!shouldAttemptNativeStereoRoute()) return;
  await ensureNativeStereoRouteEngaged();
}
function refreshStereoPlaybackRoute() {
  if (!Capacitor.isNativePlatform()) return;
  if (holdCount <= 0) return;
  if (!shouldAttemptNativeStereoRoute()) return;
  if (nativeRouteEngaged) return;
  void ensureNativeStereoRouteEngaged();
}
async function releaseStereoPlayback() {
  if (!Capacitor.isNativePlatform()) return;
  if (holdCount <= 0) return;
  holdCount -= 1;
  if (holdCount > 0) return;
  const wasNativeEngaged = nativeRouteEngaged;
  nativeRouteEngaged = false;
  if (!wasNativeEngaged) return;
  if (isHeadphoneOutputActive()) {
    recordingRouteRestoredHandler?.();
    return;
  }
  const cameraActive = await isCameraSessionActive();
  if (cameraActive) {
    recordingRouteRestoredHandler?.();
    return;
  }
  try {
    await audioSessionRoute_default.enableRecordingRoute();
    recordingRouteRestoredHandler?.();
  } catch (error) {
    console.warn("Failed to release stereo playback route:", error);
  }
}
function isStereoPlaybackEngaged() {
  return holdCount > 0;
}
function isNativeStereoRouteEngaged() {
  return nativeRouteEngaged;
}
function resetStereoPlaybackRouteForTests() {
  holdCount = 0;
  nativeRouteEngaged = false;
  nativeStereoPermanentlySkipped = false;
}
export {
  engageStereoPlayback,
  engageStereoPlaybackAsync,
  isNativeStereoRouteEngaged,
  isStereoPlaybackEngaged,
  refreshStereoPlaybackRoute,
  registerRecordingRouteRestoredHandler,
  releaseStereoPlayback,
  resetStereoPlaybackRouteForTests
};
