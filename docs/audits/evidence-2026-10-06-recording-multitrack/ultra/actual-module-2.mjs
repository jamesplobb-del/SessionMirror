// naturalTakePreview$:./naturalTakePreview
var readyNaturalTakePreview = (p) => globalThis.__previewPort(p);

// audioSessionRoute$:./audioSessionRoute
var audioSessionRoute_default = globalThis.__playerPort;

// playbackRouteCoordinator$:./playbackRouteCoordinator
var prepareInlineTakeBoxPlaybackRoute = () => globalThis.__holdPort.acquire();
var releaseInlineTakeBoxPlaybackRoute = () => globalThis.__holdPort.release();

// takeStorage$:./takeStorage
var resolveNativeFileUri = async (p) => p;

// ^@capacitor\/core$:@capacitor/core
var Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };

// src/utils/nativeInlineTakeBoxPlayback.ts
function isNativeInlineTakeBoxPlaybackAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}
var endedHandlers = /* @__PURE__ */ new Map();
var activeOwnerId = null;
var playbackGeneration = 0;
var pendingOwnerId = null;
var nativeOperations = Promise.resolve();
function enqueueNativeOperation(operation) {
  const next = nativeOperations.catch(() => {
  }).then(operation);
  nativeOperations = next;
  return next;
}
function setNativeInlineTakeBoxEndedHandler(ownerId, handler) {
  if (handler) endedHandlers.set(ownerId, handler);
  else endedHandlers.delete(ownerId);
}
async function stopNativeInlineTakeBoxPlayback(options = {}) {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return;
  const owner = options.ownerId;
  if (!owner || pendingOwnerId === owner) {
    playbackGeneration += 1;
    pendingOwnerId = null;
  }
  await enqueueNativeOperation(async () => {
    if (owner && activeOwnerId !== null && activeOwnerId !== owner) return;
    if (!owner || activeOwnerId === owner) activeOwnerId = null;
    try {
      await audioSessionRoute_default.stopInlineTakeBoxPlayback({ notify: options.notify !== false });
    } catch {
    }
  });
}

// src/utils/audioModeNativePlayback.ts
var AUDIO_MODE_NATIVE_PLAYBACK_OWNER = "audio-mode-native-playback";
var HEADLESS_INLINE_LAYOUT = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  cornerRadius: 0
};
function shouldUseAudioModeNativePlayback(item) {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return false;
  if (!item.filePath) return false;
  const mime = item.mimeType ?? "";
  return mime.startsWith("audio") || item.filePath.endsWith(".m4a");
}
var playbackGeneration2 = 0;
var endedHandler = null;
var endedListenerInstalled = false;
function setAudioModeNativePlaybackEndedHandler(handler) {
  endedHandler = handler;
}
function ensureEndedListener() {
  if (endedListenerInstalled) return;
  endedListenerInstalled = true;
  setNativeInlineTakeBoxEndedHandler(AUDIO_MODE_NATIVE_PLAYBACK_OWNER, () => {
    endedHandler?.();
  });
}
function teardownAudioModeNativePlaybackListener() {
  setNativeInlineTakeBoxEndedHandler(AUDIO_MODE_NATIVE_PLAYBACK_OWNER, null);
  endedListenerInstalled = false;
  endedHandler = null;
}
async function startAudioModeNativePlayback(options) {
  if (!shouldUseAudioModeNativePlayback({ filePath: options.filePath })) return null;
  const generation = ++playbackGeneration2;
  const fileURL = await resolveNativeFileUri(options.filePath);
  if (!fileURL) {
    console.warn("[AudioModeNativePlayback] could not resolve file URI", options.filePath);
    return null;
  }
  await prepareInlineTakeBoxPlaybackRoute();
  ensureEndedListener();
  const startTime = typeof options.startTime === "number" && Number.isFinite(options.startTime) ? Math.max(0, options.startTime) : 0;
  const gainDb = typeof options.gainDb === "number" && Number.isFinite(options.gainDb) ? Math.max(0, Math.min(options.gainDb, 30)) : 0;
  try {
    const url = await readyNaturalTakePreview(fileURL, "audio");
    if (generation !== playbackGeneration2) return null;
    const result = await audioSessionRoute_default.startInlineTakeBoxPlayback({
      url,
      x: HEADLESS_INLINE_LAYOUT.x,
      y: HEADLESS_INLINE_LAYOUT.y,
      width: HEADLESS_INLINE_LAYOUT.width,
      height: HEADLESS_INLINE_LAYOUT.height,
      cornerRadius: HEADLESS_INLINE_LAYOUT.cornerRadius,
      volume: 1,
      audioOnly: true,
      loudnessGainDb: url === fileURL ? gainDb : 0,
      ownerId: AUDIO_MODE_NATIVE_PLAYBACK_OWNER,
      startTime
    });
    const duration = typeof result.duration === "number" ? result.duration : 0;
    console.info("[AudioModeNativePlayback] started inline AVPlayer (camera parity)", {
      duration,
      route: result.route ?? "inline-take-box",
      systemVolume: result.systemVolume,
      playerVolume: result.playerVolume,
      loudnessGainDb: gainDb
    });
    return { duration };
  } catch (error) {
    console.warn("[AudioModeNativePlayback] failed to start", error);
    await releaseInlineTakeBoxPlaybackRoute();
    return null;
  }
}
async function releaseAudioModeNativePlaybackRoute() {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return;
  await releaseInlineTakeBoxPlaybackRoute();
}
async function stopAudioModeNativePlayback() {
  playbackGeneration2 += 1;
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return;
  try {
    await stopNativeInlineTakeBoxPlayback({
      notify: false,
      ownerId: AUDIO_MODE_NATIVE_PLAYBACK_OWNER
    });
  } catch {
  }
  await releaseInlineTakeBoxPlaybackRoute();
}
export {
  AUDIO_MODE_NATIVE_PLAYBACK_OWNER,
  releaseAudioModeNativePlaybackRoute,
  setAudioModeNativePlaybackEndedHandler,
  shouldUseAudioModeNativePlayback,
  startAudioModeNativePlayback,
  stopAudioModeNativePlayback,
  teardownAudioModeNativePlaybackListener
};
