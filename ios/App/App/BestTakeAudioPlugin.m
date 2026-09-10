// BestTakeAudioPlugin declares CAPBridgedPlugin and its complete method list
// in BestTakeAudioPlugin.swift. Keep registration there only.
// A CAP_PLUGIN category here overrides Swift's pluginMethods at runtime;
// an outdated second list hid setNativeTunerPitchEnabled and prevented startup.
#import <Capacitor/Capacitor.h>
