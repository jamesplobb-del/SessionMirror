from pathlib import Path
import tempfile, subprocess
source=Path('ios/App/App/NativeCameraRecordingEngine.swift').read_text()
helper=source.split('// BEGIN NATIVE TUNER DETECTOR')[1].split('// END NATIVE TUNER DETECTOR')[0]
test='\nvar worst = 0.0\nfor rate in [44100.0,48000.0] {\n for frequency in [55.0,65.41,82.41,110,220,440,880,1100,1760] {\n  for harmonic in [false,true] {\n   let samples: [Float] = (0..<4096).map { i in\n    let phase = 2 * Double.pi * frequency * Double(i)/rate\n    return Float(0.3*sin(phase)+(harmonic ? 0.2*sin(2*phase)+0.1*sin(3*phase) : 0))\n   }\n   let r = estimateNativeTunerPitch(samples,sampleRate:rate)\n   let error = abs(1200*log2(r.frequency/frequency))\n   worst = max(worst,error)\n   precondition(error < 3,"pitch error \\(frequency) \\(r.frequency) \\(error)")\n   precondition(r.confidence>0.84)\n  }\n }\n}\nlet silent = estimateNativeTunerPitch([Float](repeating:0,count:4096),sampleRate:48000)\nprecondition(silent.frequency==0)\nlet tone = (0..<4096).map { Float(0.3*sin(2*Double.pi*440*Double($0)/48000)) }\nlet start = Date()\nfor _ in 0..<20000 { _ = estimateNativeTunerPitch(tone,sampleRate:48000) }\nprint("PASS: 36 frequency/harmonic cases; worst cents=\\(worst); silence; 20000 frames in \\(Date().timeIntervalSince(start))s")\n'
with tempfile.TemporaryDirectory(prefix='native-tuner-test-') as folder:
 p=Path(folder)/'main.swift';p.write_text('import Foundation\nimport Accelerate\n'+helper+test)
 binary=Path(folder)/'test'
 subprocess.run(['swiftc','-O','-module-cache-path','/tmp/besttake-swift-cache',str(p),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
