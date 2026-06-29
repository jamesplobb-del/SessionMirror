#import <Capacitor/Capacitor.h>

CAP_PLUGIN(DronePlugin, "DronePlugin",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(toggleNote, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setOctave, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setVolume, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setWaveform, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getState, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(restoreState, CAPPluginReturnPromise);
)
