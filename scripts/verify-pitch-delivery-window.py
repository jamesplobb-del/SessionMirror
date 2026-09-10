from pathlib import Path
import subprocess, tempfile
source = Path('ios/App/App/BestTakeAudioPlugin.swift').read_text()
helper = source.split('// BEGIN PITCH DELIVERY WINDOW')[1].split('// END PITCH DELIVERY WINDOW')[0]
tests = 'private let window = PitchDeliveryWindow()\nwindow.configure(enabled:true,acknowledged:true)\nlet first = window.reserve()!, second = window.reserve()!\nfor _ in 0..<1_000_000 { precondition(window.reserve() == nil) }\nwindow.acknowledge(first)\nlet next = window.reserve()!\nprecondition(window.reserve() == nil)\nwindow.configure(enabled:false,acknowledged:true)\nprecondition(!window.contains(second) && !window.contains(next))\nwindow.configure(enabled:true,acknowledged:true)\nwindow.acknowledge(second)\nprecondition(window.reserve() != nil && window.reserve() != nil && window.reserve() == nil)\nprint("PASS: one million stalled deliveries bounded at two, ack credit, stale acknowledgements and reset")\n'
with tempfile.TemporaryDirectory(prefix='pitch-window-') as folder:
    path = Path(folder) / 'main.swift'
    path.write_text('import Foundation\n' + helper + tests)
    subprocess.run(['swift', '-module-cache-path', '/tmp/besttake-swift-cache', str(path)], check=True)
