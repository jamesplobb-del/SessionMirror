#import <Capacitor/Capacitor.h>

CAP_PLUGIN(QuickTunerPlugin, "QuickTunerPlugin",
    CAP_PLUGIN_METHOD(markWebReady, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(consumePendingLaunch, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getMicrophonePermissionStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestMicrophonePermission, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(openAppSettings, CAPPluginReturnPromise);
)
