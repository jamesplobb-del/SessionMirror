#import <Capacitor/Capacitor.h>

CAP_PLUGIN(MetronomePlugin, "MetronomePlugin",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setMuted, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(prepare, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isPlaying, CAPPluginReturnPromise);
)
