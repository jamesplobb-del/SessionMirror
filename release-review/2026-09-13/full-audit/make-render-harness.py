from pathlib import Path
import re,plistlib
source=Path('ios/App/App/BestTakeAudioPlugin.swift').read_text()
names=['fileURL','creatorStudioRenderSize','percentValue','imageForCreatorStudioAsset','normalizedTrackOrientation','multitrackRectFrame','multitrackVideoGeometry','renderMultitrackVideo']
parts=[]
for name in names:
 match=re.search(r'    (?:private |@objc )?func '+name+r'\(',source)
 start=match.start(); brace=source.index('{',match.end()); depth=1; pos=brace+1
 while depth:
  if source[pos]=='{':depth+=1
  if source[pos]=='}':depth-=1
  pos+=1
 parts.append(source[start:pos].replace('@objc func','func'))
base=Path('/tmp/besttake-render-audit');base.mkdir(exist_ok=True)
(base/'Renderer.swift').write_text('import UIKit\nimport AVFoundation\nimport PDFKit\ntypealias JSObject = [String:Any]\nclass CAPPluginCall {\n let data:JSObject;let completion:(Result<JSObject,Error>)->Void\n init(_ data:JSObject,_ completion:@escaping(Result<JSObject,Error>)->Void){self.data=data;self.completion=completion}\n func getString(_ k:String)->String?{data[k] as? String}\n func getDouble(_ k:String)->Double?{(data[k] as? NSNumber)?.doubleValue}\n func getArray<T>(_ k:String,_ t:T.Type)->[T]?{data[k] as? [T]}\n func getObject(_ k:String)->JSObject?{data[k] as? JSObject}\n func resolve(_ d:JSObject){completion(.success(d))}\n func reject(_ message:String,_ code:String?=nil,_ error:Error?=nil){completion(.failure(error ?? NSError(domain:message,code:1)))}\n}\nclass Renderer {\n'+'\n'.join(parts)+'\n}\n')
app=base/'RenderAudit.app';app.mkdir(exist_ok=True)
(app/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.besttake.audit.render','CFBundleName':'Render Audit','CFBundleExecutable':'RenderAudit','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','CFBundlePackageType':'APPL','MinimumOSVersion':'16.0','UILaunchScreen':{},'UIDeviceFamily':[1,2]}))
print(base)
