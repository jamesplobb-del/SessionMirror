import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const tabs = await fetch('http://127.0.0.1:9239/json/list').then(r => r.json())
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data), p = pending.get(m.id)
  if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result) }
})
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const next = ++id; const timer = setTimeout(() => reject(new Error('Timed out: ' + method)), 120000); pending.set(next, { resolve, reject, timer }); ws.send(JSON.stringify({ id: next, method, params })) })
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
async function wait(expression) {
  for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(r => setTimeout(r, 250)) }
  throw Error('State did not arrive: ' + expression + '\n' + await evaluate('document.body.innerText'))
}
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
async function button(selector) {
  const p = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); const r = b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
  await click(p.x, p.y)
}

await send('Page.enable')
try {
 for (const width of [390,834]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:'http://127.0.0.1:5229/scripts/fixtures/music-feature/index.html?check=1&reader=1'})
  await wait(`document.querySelector('.practice-chart-page canvas[data-drawn="true"]')`)
  await click(width/2,500)
  await wait(`document.querySelector('.practice-chart-paper').dataset.controlsHidden !== 'true'`)
  await button('[aria-label="Workspace"]')
  await wait(`document.querySelector('#music-workspace-tools')`)
  await new Promise(r=>setTimeout(r,450))
  const info=await evaluate(`(()=>{const p=document.querySelector('#music-workspace-tools'),r=p.getBoundingClientRect();return {x:r.x,right:r.right,w:r.width,inert:!!p.closest('[inert]'),buttons:[...p.querySelectorAll('button')].map(b=>({label:b.innerText,w:b.getBoundingClientRect().width,visible:getComputedStyle(b).visibility}))}})()`)
  console.log(width,JSON.stringify(info))
  const menuShot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`build/release-4.2.2-32/menu-${width}.png`,Buffer.from(menuShot.data,'base64'))
  assert.ok(info.x>=0 && info.right<=width && info.w>150 && !info.inert)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await wait(`!document.querySelector('#music-workspace-tools')`)
  await evaluate(`document.querySelector('[aria-label="Workspace"]').focus()`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await wait(`document.querySelector('#music-workspace-tools')`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.equal(await evaluate(`!!document.querySelector('#music-workspace-tools')?.contains(document.activeElement)`),true,'Tab enters the portalled Workspace on phone and iPad')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8})
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Workspace','Shift+Tab returns to the opener')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await button('#music-workspace-tools button')
  await wait(`!document.querySelector('#music-workspace-tools')`)
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`),'Workspace','launching a tool restores focus')
  await button('[aria-label="Workspace"]')
  await wait(`document.querySelector('#music-workspace-tools')`)
  await button('[aria-label="Mark up this score"]')
  await wait(`!document.querySelector('#music-workspace-tools') && document.querySelector('.markup-toolbar')`)
  await button('[aria-label="Done marking"]')
  await wait(`!document.querySelector('.practice-chart-paper[data-marking="true"]')`)
  await new Promise(r=>setTimeout(r,200))
  await button('[aria-label="Workspace"]')
  await wait(`document.querySelector('#music-workspace-tools')`)
  await click(40,800)
  await wait(`!document.querySelector('#music-workspace-tools')`)
  console.log('PASS Workspace layout, keyboard entry/return, launch, markup, outside dismiss:',width)
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(`build/release-4.2.2-32/workspace-${width}.png`,Buffer.from(shot.data,'base64'))
 }
}finally{ws.close()}
