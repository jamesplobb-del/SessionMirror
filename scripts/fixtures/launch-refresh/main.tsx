import React from 'react'
import { createRoot } from 'react-dom/client'
import AppBootGate from '../../../src/components/ui/AppBootGate'
import '../../../src/styles/signal-launch.css'
import './review.css'
function Review() {
 const [dark,setDark]=React.useState(false)
 return <main className={dark?'review dark':'review'}>
   <header><div><small>BestTake</small><h1>A brighter entrance.</h1></div><button onClick={()=>setDark(!dark)}>{dark?'Light appearance':'Dark appearance'}</button></header>
   <section><article><div className="phone"><AppBootGate/></div><p>Launch screen · same component as the app</p></article>
   <article className="icon-review"><img src={dark?'/scripts/fixtures/launch-refresh/icon-dark.png':'/icons/icon.png'} alt="Updated BestTake app icon"/><h2>BestTake</h2><p>The same Signal. Brighter blue and gold.</p></article></section>
 </main>
}
createRoot(document.getElementById('root')!).render(<Review/> )
