// Compose launch artwork from unmodified screenshots of the running app.
// No UI is fabricated. Keep raw captures so every image remains auditable.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
const icon=(await fs.readFile(new URL('../../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url))).toString('base64')
const root = path.dirname(fileURLToPath(import.meta.url))
const meta = JSON.parse(await fs.readFile(path.join(root, 'metadata.json'), 'utf8'))
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const files = await fs.readdir(path.join(root,'raw'))
const rendered=[]
for (const device of ['iphone','ipad']) {
  const tablet=device==='ipad', W=tablet?2064:1284, H=tablet?2752:2778
  for (const shot of meta.screenshots) {
    const file=files.find(f=>f===`${device}-${shot.screen}.png`)
    if(!file)continue
    const photo=await sharp(path.join(root,'raw',file)).png().toBuffer()
    const info=await sharp(photo).metadata()
    const dark=shot.screen==='games', bg=dark?'#18251e':'#f5f1e9', ink=dark?'#f5f1e9':'#20201e', quiet=dark?'#c2ccbd':'#585951'
    const margin=tablet?142:92, font=tablet?154:128, lines=shot.headline.split('\n')
    const top=tablet?210:208, step=font*1.04
    const detailY=top+lines.length*step+78
    const maxWidth=tablet?1440:1010, maxHeight=H-detailY-190
    const scale=Math.min(maxWidth/info.width,maxHeight/info.height)
    const sw=Math.round(info.width*scale),sh=Math.round(info.height*scale),sx=Math.round((W-sw)/2),sy=Math.round(detailY+106)
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><clipPath id="screen"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${tablet?38:72}"/></clipPath></defs>
    <rect width="100%" height="100%" fill="${bg}"/>
    <clipPath id="icon"><rect x="${margin}" y="74" width="54" height="54" rx="12.5"/></clipPath><image x="${margin}" y="74" width="54" height="54" xlink:href="data:image/png;base64,${icon}" clip-path="url(#icon)"/>
    <text x="${margin+70}" y="116" font-family="Helvetica Neue,Arial,sans-serif" font-size="40" font-weight="600" letter-spacing="-1" fill="${ink}">BestTake</text>
    ${lines.map((line,i)=>`<text x="${margin}" y="${top+(i+1)*step}" font-family="Helvetica Neue,Arial,sans-serif" font-size="${font}" font-weight="600" letter-spacing="-6" fill="${ink}">${esc(line)}</text>`).join('')}
    <text x="${margin}" y="${detailY}" font-family="Helvetica Neue,Arial,sans-serif" font-size="${tablet?44:40}" letter-spacing="-0.8" fill="${quiet}">${esc(shot.detail)}</text>
    <rect x="${sx-12}" y="${sy-12}" width="${sw+24}" height="${sh+24}" rx="${tablet?50:84}" fill="#161817"/>
    <image x="${sx}" y="${sy}" width="${sw}" height="${sh}" xlink:href="data:image/png;base64,${photo.toString('base64')}" clip-path="url(#screen)"/>
    </svg>`
    const output=path.join(root,device,`${shot.id}.png`)
    await sharp(Buffer.from(svg)).flatten({background:bg}).png().toFile(output)
    rendered.push({device,id:shot.id,file:output})
  }
}
const thumbs=await Promise.all(rendered.map(async(r)=>({input:await sharp(r.file).resize({width:240}).png().toBuffer(),r})))
if(thumbs.length){
  const cols=Math.min(6,thumbs.length),cellW=264,cellH=550
  await sharp({create:{width:cols*cellW,height:Math.ceil(thumbs.length/cols)*cellH,channels:3,background:'#e5e2db'}})
    .composite(thumbs.map((t,i)=>({input:t.input,left:(i%cols)*cellW+12,top:Math.floor(i/cols)*cellH+12}))).png().toFile(path.join(root,'contact-sheet.png'))
}
const textFields=['name','subtitle','promotionalText','keywords','description','supportURL','privacyPolicyURL','copyright','reviewNotes']
await fs.writeFile(path.join(root,'listing.md'),`# BestTake 4.1 · Build 15\n\n`+textFields.map(k=>`## ${k}\n\n${meta[k]}\n`).join('\n'))
console.log(JSON.stringify(rendered,null,2))
