require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorSessionMirrorAudio'
  s.version = package['version']
  s.summary = 'Route take playback to the iPhone loudspeaker'
  s.license = 'MIT'
  s.homepage = 'https://github.com/jamesplobb-del/SessionMirror'
  s.authors = { 'BestTake' => 'dev@besttake.app' }
  s.source = { :git => 'https://github.com/jamesplobb-del/SessionMirror.git', :tag => 'v#{s.version}' }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
