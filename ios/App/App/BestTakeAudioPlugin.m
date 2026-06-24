#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BestTakeAudioPlugin, "BestTakeAudioPlugin",
    CAP_PLUGIN_METHOD(setHighQualityBluetoothMode, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(enableStereoPlayback, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(enableRecordingRoute, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getPlaybackOutputProfile, CAPPluginReturnPromise);
)
