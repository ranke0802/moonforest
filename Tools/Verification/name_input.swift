import AppKit
import CoreGraphics
import Carbon
let target=CommandLine.arguments[1]
guard let app=NSWorkspace.shared.runningApplications.last(where:{$0.bundleURL?.path==target}) else {exit(1)}
let old=TISCopyCurrentKeyboardInputSource().takeRetainedValue()
defer{TISSelectInputSource(old)}
app.activate(options:[]);Thread.sleep(forTimeInterval:0.4)
let list=TISCreateInputSourceList(nil,false).takeRetainedValue() as! [TISInputSource]
for s in list {if let p=TISGetInputSourceProperty(s,kTISPropertyInputSourceID), (Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String)=="com.apple.inputmethod.Korean.2SetKorean"{TISSelectInputSource(s)}}
let wins=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as! [[String:Any]]
guard let win=wins.first(where:{($0[kCGWindowOwnerPID as String] as? Int)==Int(app.processIdentifier)&&($0[kCGWindowLayer as String] as? Int)==0}),let b=win[kCGWindowBounds as String] as? [String:Double] else{exit(2)}
let scale=b["Width"]!/1280.0, top=b["Y"]!+b["Height"]!-800*scale
print(b)
func click(_ x:Double,_ y:Double){guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else {exit(3)};let p=CGPoint(x:b["X"]!+x*scale,y:top+y*scale);for t:CGEventType in [.mouseMoved,.leftMouseDown,.leftMouseUp]{CGEvent(mouseEventSource:nil,mouseType:t,mouseCursorPosition:p,mouseButton:.left)?.post(tap:.cghidEventTap);Thread.sleep(forTimeInterval:0.1)}}
func key(_ n:CGKeyCode){CGEvent(keyboardEventSource:nil,virtualKey:n,keyDown:true)?.postToPid(app.processIdentifier);Thread.sleep(forTimeInterval:0.08);CGEvent(keyboardEventSource:nil,virtualKey:n,keyDown:false)?.postToPid(app.processIdentifier);Thread.sleep(forTimeInterval:0.15)}
let mode=CommandLine.arguments.count>2 ? CommandLine.arguments[2] : "click"
click(820,322);Thread.sleep(forTimeInterval:0.3)
click(820,400);Thread.sleep(forTimeInterval:0.3)
for code:CGKeyCode in (mode=="hangul" ? [2,11,3,37,6,40] : [2,2]) {key(code)}
Thread.sleep(forTimeInterval:0.2)
if mode=="blur" || mode=="append" {click(820,282);Thread.sleep(forTimeInterval:0.3);key(101)}
if mode=="append" {click(970,400);key(2)}
if mode=="inside" {click(970,400);Thread.sleep(forTimeInterval:0.3);key(2)}
if mode=="delete" {key(51)}
if mode=="enter" || mode=="tab" {
 key(mode=="enter" ? 36 : 48);Thread.sleep(forTimeInterval:0.3);key(101);Thread.sleep(forTimeInterval:0.2);key(mode=="enter" ? 14 : 38)
} else {click(820,477)}
Thread.sleep(forTimeInterval:0.3)
