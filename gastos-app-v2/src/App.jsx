import { useState, useEffect, useRef } from 'react'
import { parseChat, parsePDF, hasGeminiKey } from './gemini.js'
import { exportToExcel } from './export.js'
import * as db from './db.js'

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DEFAULT_CATEGORIES = ["Comida","Delivery","Salidas","Auto y transporte","Servicios e impuestos","Salud y belleza","Casa y art. del hogar","Ropa","Educación","Mascotas","Deporte","Regalos","Ahorro e inversión","Asesorías","Mamá","Otros","Azul"]
const DEFAULT_OBRA_SETTINGS = { activeObra: 'Libertad', obras: { Libertad: ['Dirección de obra','Materiales','Mano de obra','Mobiliario/equipamiento','Otro'] } }
const ALL_SECTIONS = ["obra","mama"]
const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0)
const S = {
  card:    {background:'#1a1a1a',border:'1px solid #222',borderRadius:'8px',padding:'16px'},
  navBtn:  {background:'#1a1a1a',border:'1px solid #222',color:'#777',padding:'4px 14px',borderRadius:'4px',cursor:'pointer',fontSize:'1rem'},
  input:   {width:'100%',background:'#111',border:'1px solid #2a2a2a',color:'#e8dcc8',padding:'10px 12px',borderRadius:'6px',fontSize:'0.9rem',fontFamily:'Georgia,serif',outline:'none',boxSizing:'border-box'},
  btnGold: {background:'#c8a96e',color:'#0f0f0f',border:'none',padding:'10px 16px',borderRadius:'6px',cursor:'pointer',fontSize:'0.8rem',fontWeight:'bold',letterSpacing:'0.06em',textTransform:'uppercase'},
  btnGray: {background:'#1a1a1a',color:'#888',border:'1px solid #2a2a2a',padding:'10px 16px',borderRadius:'6px',cursor:'pointer',fontSize:'0.8rem',letterSpacing:'0.06em',textTransform:'uppercase'},
  label:   {fontSize:'0.6rem',letterSpacing:'0.12em',color:'#666',textTransform:'uppercase'},
}

export default function App() {
  const [ready,setReady]=useState(false)
  const [view,setView]=useState('home')
  const [categories,setCategories]=useState(DEFAULT_CATEGORIES)
  const [hiddenSections,setHiddenSections]=useState([])
  const [obraSettings,setObraSettings]=useState(DEFAULT_OBRA_SETTINGS)
  const [transactions,setTransactions]=useState([])
  const [ingresos,setIngresos]=useState([])
  const [usdMovements,setUSDMov]=useState([])
  const [obraMovements,setObraMov]=useState([])
  const [mamaMovements,setMamaMov]=useState([])
  const [selectedMonth,setSelectedMonth]=useState(()=>{ const d=new Date(); return {month:d.getMonth(),year:d.getFullYear()} })

  useEffect(()=>{
    ;(async()=>{
      try {
        const [cats,hidden,obraSet,txs,ings,usd,obra,mama]=await Promise.all([
          db.getCategories(DEFAULT_CATEGORIES),
          db.getHiddenSections(),
          db.getObraSettings(),
          db.getTransactions(),
          db.getIngresos(),
          db.getUSDMovements(),
          db.getObraMovements(),
          db.getMamaMovements(),
        ])
        setCategories(cats||DEFAULT_CATEGORIES)
        setHiddenSections(hidden||[])
        setObraSettings(obraSet||DEFAULT_OBRA_SETTINGS)
        setTransactions(txs||[])
        setIngresos(ings||[])
        setUSDMov(usd||[])
        setObraMov(obra||[])
        setMamaMov(mama||[])
      } catch(e) {
        console.error('Error loading data:', e)
      } finally {
        setReady(true)
      }
    })()
  },[])

  if (!ready) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0f0f0f',color:'#444',fontFamily:'Georgia,serif',fontSize:'0.9rem',letterSpacing:'0.1em'}}>Cargando...</div>
  if (!hasGeminiKey()) return <SetupScreen onDone={()=>window.location.reload()} />

  const isHidden = s => hiddenSections.includes(s)
  const activeObraCats = obraSettings.obras?.[obraSettings.activeObra] || DEFAULT_OBRA_SETTINGS.obras['Libertad']
  const p={transactions,setTransactions,ingresos,setIngresos,usdMovements,setUSDMov,obraMovements,setObraMov,mamaMovements,setMamaMov,categories,setCategories,hiddenSections,setHiddenSections,obraSettings,setObraSettings,activeObraCats,selectedMonth,setSelectedMonth,isHidden}

  return (
    <div style={{minHeight:'100vh',background:'#0f0f0f',color:'#e8dcc8',fontFamily:'Georgia,serif',paddingBottom:'72px'}}>
      {view==='home'     && <HomeView     {...p} setView={setView}/>}
      {view==='chat'     && <ChatView     {...p}/>}
      {view==='monthly'  && <MonthlyView  {...p}/>}
      {view==='usd'      && <USDView      {...p}/>}
      {view==='obra'     && !isHidden('obra') && <ObraView  {...p}/>}
      {view==='obra'     &&  isHidden('obra') && <HiddenSection name="Obra" onBack={()=>setView('home')}/>}
      {view==='mama'     && !isHidden('mama') && <MamaView  {...p}/>}
      {view==='mama'     &&  isHidden('mama') && <HiddenSection name="Cuenta Mamá" onBack={()=>setView('home')}/>}
      {view==='settings' && <SettingsView {...p}/>}
      <BottomNav view={view} setView={setView} isHidden={isHidden} obraSettings={obraSettings}/>
    </div>
  )
}

function SetupScreen({onDone}){
  const [key,setKey]=useState('')
  const save=()=>{
    if(!key.trim().startsWith('AIza')){alert('La key de Gemini empieza con AIza...');return}
    localStorage.setItem('gemini_api_key',key.trim()); onDone()
  }
  return (
    <div style={{minHeight:'100vh',background:'#0f0f0f',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'30px',fontFamily:'Georgia,serif'}}>
      <div style={{maxWidth:'380px',width:'100%'}}>
        <div style={{textAlign:'center',marginBottom:'28px'}}>
          <div style={{fontSize:'0.65rem',letterSpacing:'0.2em',color:'#555',textTransform:'uppercase',marginBottom:'8px'}}>Configuración inicial</div>
          <h1 style={{fontSize:'1.9rem',fontWeight:'normal',color:'#e8dcc8',margin:'0 0 10px'}}>Gastos Familia</h1>
          <p style={{color:'#555',fontSize:'0.85rem',lineHeight:1.6,margin:0}}>Necesitás una API key de Google Gemini.<br/>Conseguila gratis en aistudio.google.com</p>
        </div>
        <div style={{...S.card,padding:'22px'}}>
          <label style={{...S.label,display:'block',marginBottom:'8px'}}>Google Gemini API Key</label>
          <input type="password" placeholder="AIzaSy..." value={key} onChange={e=>setKey(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} style={{...S.input,marginBottom:'14px',fontFamily:'monospace'}}/>
          <button onClick={save} style={{...S.btnGold,width:'100%',padding:'12px'}}>Guardar y comenzar</button>
        </div>
      </div>
    </div>
  )
}

function HiddenSection({name,onBack}){
  return (
    <div style={{padding:'60px 20px',textAlign:'center'}}>
      <div style={{fontSize:'2rem',marginBottom:'16px'}}>🔒</div>
      <div style={{color:'#555',marginBottom:'8px'}}>{name} está oculta</div>
      <div style={{color:'#444',fontSize:'0.8rem',marginBottom:'24px'}}>Podés reactivarla desde Configuración.</div>
      <button onClick={onBack} style={S.btnGray}>← Volver</button>
    </div>
  )
}

function BottomNav({view,setView,isHidden,obraSettings}){
  const obraLabel = obraSettings?.activeObra || 'Obra'
  const items=[
    {id:'home',icon:'⌂',label:'Inicio'},
    {id:'chat',icon:'✦',label:'Registrar'},
    {id:'monthly',icon:'◈',label:'Mes'},
    {id:'usd',icon:'$',label:'USD'},
    {id:'obra',icon:'⚒',label:obraLabel,opt:true},
    {id:'mama',icon:'♡',label:'Mamá',opt:true},
    {id:'settings',icon:'⚙',label:'Config'},
  ]
  return (
    <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#141414',borderTop:'1px solid #1e1e1e',display:'flex',zIndex:100,paddingBottom:'env(safe-area-inset-bottom)'}}>
      {items.map(it=>(
        <button key={it.id} onClick={()=>setView(it.id)}
          style={{flex:1,padding:'10px 2px 8px',background:'none',border:'none',
            color:view===it.id?'#c8a96e':it.opt&&isHidden(it.id)?'#252525':'#444',
            cursor:'pointer',fontSize:'0.54rem',letterSpacing:'0.04em',textTransform:'uppercase',
            display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',transition:'color 0.2s'}}>
          <span style={{fontSize:'1rem'}}>{it.icon}</span>
          <span style={{maxWidth:'42px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{it.label}</span>
        </button>
      ))}
    </nav>
  )
}

function MiniCard({label,value,color}){
  return <div style={S.card}><div style={S.label}>{label}</div><div style={{fontSize:'1.1rem',color,marginTop:'6px'}}>{value}</div></div>
}

function HomeView({transactions,ingresos,usdMovements,mamaMovements,selectedMonth,setSelectedMonth,setView,isHidden,obraSettings}){
  const {month,year}=selectedMonth
  const mTxs=transactions.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year})
  const mIngs=ingresos.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year})
  const totalG=mTxs.reduce((s,t)=>s+(t.amount||0),0)
  const totalI=mIngs.reduce((s,t)=>s+(t.amount||0),0)
  const bal=totalI-totalG
  const usdTot=usdMovements.reduce((s,m)=>s+(m.usd100||0)+(m.usd_cambio||0),0)
  const mamaDeuda=mamaMovements.reduce((s,m)=>s+(m.amount||0),0)
  const prev=()=>{const d=new Date(year,month-1);setSelectedMonth({month:d.getMonth(),year:d.getFullYear()})}
  const next=()=>{const d=new Date(year,month+1);setSelectedMonth({month:d.getMonth(),year:d.getFullYear()})}
  return (
    <div style={{padding:'28px 20px 0'}}>
      <div style={{marginBottom:'22px'}}>
        <div style={{fontSize:'0.62rem',letterSpacing:'0.18em',color:'#444',textTransform:'uppercase',marginBottom:'4px'}}>Control de Gastos</div>
        <h1 style={{fontSize:'2rem',fontWeight:'normal',color:'#e8dcc8',margin:'0 0 10px',letterSpacing:'-0.02em'}}>{MONTHS[month]} {year}</h1>
        <div style={{display:'flex',gap:'8px'}}><button onClick={prev} style={S.navBtn}>‹</button><button onClick={next} style={S.navBtn}>›</button></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'}}>
        <MiniCard label="Ingresos" value={fmt(totalI)} color="#6e9e6e"/>
        <MiniCard label="Gastos"   value={fmt(totalG)} color="#c87070"/>
      </div>
      <div style={{...S.card,background:bal>=0?'#141f14':'#1f1414',borderColor:bal>=0?'#1e3a1e':'#3a1e1e',marginBottom:'12px'}}>
        <div style={S.label}>Balance del mes</div>
        <div style={{fontSize:'1.6rem',color:bal>=0?'#6e9e6e':'#c87070',marginTop:'6px'}}>{fmt(bal)}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:isHidden('mama')?'1fr':'1fr 1fr',gap:'12px',marginBottom:'22px'}}>
        <div style={S.card}>
          <div style={S.label}>Dólares en caja</div>
          <div style={{fontSize:'1.2rem',color:'#c8a96e',marginTop:'6px'}}>USD {usdTot.toLocaleString('es-AR')}</div>
        </div>
        {!isHidden('mama')&&(
          <div style={S.card}>
            <div style={S.label}>Deuda mamá</div>
            <div style={{fontSize:'1.1rem',color:mamaDeuda>0?'#c87070':'#6e9e6e',marginTop:'6px'}}>USD {Math.abs(mamaDeuda).toLocaleString('es-AR',{maximumFractionDigits:2})}</div>
            <div style={{fontSize:'0.62rem',color:'#555',marginTop:'2px'}}>{mamaDeuda>0?'te debe':'le debés'}</div>
          </div>
        )}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
        {[{icon:'✦',label:'Registrar gasto',v:'chat'},{icon:'◈',label:'Ver resumen',v:'monthly'}].map(a=>(
          <button key={a.v} onClick={()=>setView(a.v)} style={{...S.card,cursor:'pointer',textAlign:'center',background:'#161616',width:'100%'}}>
            <div style={{fontSize:'1.4rem',marginBottom:'6px'}}>{a.icon}</div>
            <div style={{fontSize:'0.62rem',letterSpacing:'0.08em',textTransform:'uppercase',color:'#888'}}>{a.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── CHAT ─────────────────────────────────────────────────────────────
function ChatView({categories,activeObraCats,obraSettings,setTransactions,setIngresos,setUSDMov,setMamaMov,setObraMov}){
  const [input,setInput]=useState('')
  const [messages,setMessages]=useState([{role:'assistant',text:'Hola! Escribí los gastos como en el WhatsApp:\n\n• $14.000 pizza\n• $10.000 salud corte bri  ← categoría + detalle\n• $8.300 súper\n• $150.000 obra flete  ← gasto obra en pesos, pide cotización\n• Cambio a 1410 -usd 400 +$564.000\n• + $2.272.400 cancelación sueldo\n• $150.000 le pasé a mami  ← te pido cotización USD\n• + usd 1000 alquiler chinos mama  ← resta deuda + suma caja USD\n\nPodés pegar varias líneas o subir un PDF con 📄'}])
  const [loading,setLoading]=useState(false)
  const [pending,setPending]=useState([])
  // waitingFor: null | 'confirm' | 'cotiz_mama' | 'cotiz_obra' | 'obra_category'
  const [waitingFor,setWaitingFor]=useState(null)
  const [pendingObraItems,setPendingObraItems]=useState([]) // items obra que necesitan cotización/categoría
  const [currentObraIdx,setCurrentObraIdx]=useState(0)
  // PDF category editing
  const [editingCatIdx,setEditingCatIdx]=useState(null)
  const bottomRef=useRef(),fileRef=useRef()
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages])
  const addMsg=(role,text,extra={})=>setMessages(p=>[...p,{role,text,...extra}])

  const guardar=async(parsed,mamasCotiz,obraResolved)=>{
    const dateStr=new Date().toISOString().split('T')[0]
    const gastos=[],usds=[],ings=[],mamas=[],obras=[]
    parsed.forEach(t=>{
      if(t.type==='gasto'){
        gastos.push({date:dateStr,amount:t.amount||0,category:t.category,description:t.description||''})
      }
      else if(t.type==='gasto_mama_pesos'){
        const monto=t.amount||0
        gastos.push({date:dateStr,amount:monto,category:'Mamá',description:t.description||''})
        if(mamasCotiz&&mamasCotiz>0){
          const usdEquiv=parseFloat((monto/mamasCotiz).toFixed(2))
          mamas.push({date:dateStr,amount:usdEquiv,description:`${t.description||'Gasto mamá'} ($${monto.toLocaleString('es-AR')} @ $${mamasCotiz})`,type:'gasto_mama'})
        }
      }
      else if(t.type==='ingreso'){
        ings.push({date:dateStr,amount:t.amount||0,description:t.description||''})
      }
      else if(t.type==='usd'){
        usds.push({date:dateStr,usd100:t.usd_amount||0,usd_cambio:0,description:t.description||'Cambio',exchange_rate:t.exchange_rate||null,peso_amount:t.peso_amount||null})
      }
      else if(t.type==='mama_pago_usd'){
        const usdAmt=t.usd_amount||0
        mamas.push({date:dateStr,amount:-usdAmt,description:t.description||'Pago mamá en USD',type:'pago_cuenta'})
        usds.push({date:dateStr,usd100:usdAmt,usd_cambio:0,description:t.description||'Pago mamá',exchange_rate:null,peso_amount:null})
      }
    })
    // Resolved obra items
    if(obraResolved){
      obraResolved.forEach(o=>{
        const monto=o.amount||0
        gastos.push({date:dateStr,amount:monto,category:'Obra',description:o.description||''})
        obras.push({date:dateStr,category:o.obra_category,description:o.description||'',usd:parseFloat((monto/o.cotiz).toFixed(2)),obra_name:obraSettings.activeObra})
      })
    }

    if(gastos.length){const saved=await db.insertTransactions(gastos);setTransactions(p=>[...p,...(saved||gastos)])}
    for(const u of usds){const s=await db.insertUSD(u);setUSDMov(p=>[...p,s||u])}
    for(const i of ings){const s=await db.insertIngreso(i);setIngresos(p=>[...p,s||i])}
    for(const m of mamas){const s=await db.insertMama(m);setMamaMov(p=>[...p,s||m])}
    for(const o of obras){const s=await db.insertObra(o);setObraMov(p=>[...p,s||o])}

    setPending([]);setWaitingFor(null);setPendingObraItems([]);setCurrentObraIdx(0)
    addMsg('assistant','✓ Guardado correctamente.')
  }

  // Multi-step obra flow state
  const obraFlowRef=useRef({items:[],resolved:[],parsed:null,mamasCotiz:null})

  const startObraFlow=(parsed,mamasCotiz,obraItems)=>{
    obraFlowRef.current={items:obraItems,resolved:[],parsed,mamasCotiz}
    setPendingObraItems(obraItems)
    setCurrentObraIdx(0)
    askNextObra(obraItems,0)
  }

  const askNextObra=(items,idx)=>{
    const item=items[idx]
    if(!item)return
    if(!item.obra_category){
      const catList=activeObraCats.join(', ')
      addMsg('assistant',`Gasto obra "${item.description}" (${fmt(item.amount)})\n¿A qué categoría pertenece?\n${catList}`)
      setWaitingFor('obra_category')
    } else {
      addMsg('assistant',`Gasto obra "${item.description}" (${fmt(item.amount)}) → ${item.obra_category}\n¿A qué cotización dólar lo registro?`)
      setWaitingFor('cotiz_obra')
    }
  }

  const handleSend=async()=>{
    if(!input.trim()||loading)return
    const text=input.trim()

    if(waitingFor==='cotiz_mama'){
      setInput('')
      const val=parseFloat(text.replace(',','.'))
      if(!val||val<100){addMsg('assistant','Ingresá una cotización válida, ej: 1400');return}
      addMsg('user',text)
      const obraItems=pending.filter(t=>t.type==='obra_pesos')
      if(obraItems.length){
        await guardar(pending.filter(t=>t.type!=='obra_pesos'),val,null)
        startObraFlow(pending,val,obraItems)
      } else {
        await guardar(pending,val,null)
      }
      return
    }

    if(waitingFor==='obra_category'){
      setInput('')
      addMsg('user',text)
      const items=[...pendingObraItems]
      const matched=activeObraCats.find(c=>c.toLowerCase()===text.toLowerCase())||activeObraCats.find(c=>c.toLowerCase().includes(text.toLowerCase()))
      const cat=matched||text
      items[currentObraIdx]={...items[currentObraIdx],obra_category:cat}
      setPendingObraItems(items)
      obraFlowRef.current.items=items
      addMsg('assistant',`Categoría: ${cat}\n¿A qué cotización dólar lo registro?`)
      setWaitingFor('cotiz_obra')
      return
    }

    if(waitingFor==='cotiz_obra'){
      setInput('')
      const val=parseFloat(text.replace(',','.'))
      if(!val||val<100){addMsg('assistant','Ingresá una cotización válida, ej: 1400');return}
      addMsg('user',text)
      const items=obraFlowRef.current.items
      const resolved=[...obraFlowRef.current.resolved,{...items[currentObraIdx],cotiz:val}]
      obraFlowRef.current.resolved=resolved
      const nextIdx=currentObraIdx+1
      if(nextIdx<items.length){
        setCurrentObraIdx(nextIdx)
        askNextObra(items,nextIdx)
      } else {
        await guardar(obraFlowRef.current.parsed||pending,obraFlowRef.current.mamasCotiz,resolved)
      }
      return
    }

    setInput('');setLoading(true);addMsg('user',text)
    try{
      const parsed=await parseChat(text,categories,activeObraCats)
      if(!parsed.length){addMsg('assistant','No pude interpretar ese texto. Intentá de nuevo.');setLoading(false);return}
      setPending(parsed)
      const tieneMamaPesos=parsed.some(t=>t.type==='gasto_mama_pesos')
      const tieneObra=parsed.some(t=>t.type==='obra_pesos')
      const summary=parsed.map(t=>{
        if(t.type==='usd')           return `💱 Cambio: ${t.usd_amount>0?'+':''}${t.usd_amount} USD @ $${t.exchange_rate} → ${fmt(t.peso_amount)}`
        if(t.type==='ingreso')       return `💰 Ingreso: ${fmt(t.amount)} — ${t.description}`
        if(t.type==='mama_pago_usd') return `👩💵 Pago mamá en USD: +${t.usd_amount} USD\n   → +USD en caja  |  −USD en deuda mamá`
        if(t.type==='gasto_mama_pesos') return `👩 Gasto por mamá: ${fmt(t.amount)} — ${t.description}\n   (se convertirá a USD según cotización)`
        if(t.type==='obra_pesos')    return `⚒ Obra (pesos→USD): ${fmt(t.amount)} — ${t.description}${t.obra_category?' ['+t.obra_category+']':''}\n   (egreso del mes + suma en Obra en USD)`
        return `📌 ${t.category}: ${fmt(t.amount)}${t.description?' — '+t.description:''}`
      }).join('\n')
      if(tieneMamaPesos){
        addMsg('assistant',`Entendí ${parsed.length} movimiento${parsed.length>1?'s':''}:\n\n${summary}\n\n¿A qué cotización USD registro los gastos de mamá?`)
        setWaitingFor('cotiz_mama')
      } else if(tieneObra&&!tieneMamaPesos){
        addMsg('assistant',`Entendí ${parsed.length} movimiento${parsed.length>1?'s':''}:\n\n${summary}\n\n¿Lo guardo? (los gastos de obra te van a pedir cotización a continuación)`,{txs:parsed})
        setWaitingFor('confirm')
      } else {
        addMsg('assistant',`Entendí ${parsed.length} movimiento${parsed.length>1?'s':''}:\n\n${summary}\n\n¿Lo guardo?`,{txs:parsed})
        setWaitingFor('confirm')
      }
    }catch(e){
      addMsg('assistant',e.message==='NO_API_KEY'?'⚠️ Falta la API key de Gemini.':`Error: ${e.message}`)
    }
    setLoading(false)
  }

  const handleConfirm=async()=>{
    const obraItems=pending.filter(t=>t.type==='obra_pesos')
    const nonObra=pending.filter(t=>t.type!=='obra_pesos')
    if(obraItems.length){
      await guardar(nonObra,null,null)
      startObraFlow(pending,null,obraItems)
    } else {
      await guardar(pending,null,null)
    }
    setWaitingFor(null)
  }

  const handlePDF=async(e)=>{
    const file=e.target.files?.[0];if(!file)return
    setLoading(true);addMsg('user',`📄 ${file.name}`)
    try{
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})
      const parsed=await parsePDF(base64,categories)
      if(!parsed.length){addMsg('assistant','No encontré consumos en el PDF.');setLoading(false);return}
      const withType=parsed.map(t=>({...t,type:'gasto'}));setPending(withType)
      setWaitingFor('confirm')
      addMsg('assistant',
        `Encontré ${parsed.length} consumos:\n\n${parsed.slice(0,8).map((t,i)=>`${i+1}. ${t.description}${t.installment?' ('+t.installment+')':''}: ${fmt(t.amount)} → ${t.category}`).join('\n')}${parsed.length>8?`\n...y ${parsed.length-8} más`:''}\n\nPara cambiar una categoría escribí el número y la nueva categoría, ej: "3 Salidas"\nO escribí "guardar" para confirmar.`,
        {txs:withType,isPDF:true}
      )
    }catch(err){addMsg('assistant',`Error al leer el PDF: ${err.message}`)}
    setLoading(false);e.target.value=''
  }

  // Handle PDF category edit input
  const handleSendPDF=async()=>{
    if(!input.trim()||loading)return
    const text=input.trim().toLowerCase()
    if(text==='guardar'||text==='si'||text==='sí'||text==='ok'){
      setInput('')
      await handleConfirm()
      return
    }
    // Try to parse "N Category"
    const match=input.trim().match(/^(\d+)\s+(.+)$/)
    if(match&&pending.length){
      const idx=parseInt(match[1])-1
      const newCat=match[2]
      if(idx>=0&&idx<pending.length){
        const updated=[...pending]
        updated[idx]={...updated[idx],category:newCat}
        setPending(updated)
        setInput('')
        addMsg('user',input.trim())
        addMsg('assistant',`Categoría ${idx+1} cambiada a "${newCat}".\n\nEscribí otro número para seguir editando o "guardar" para confirmar.`)
        return
      }
    }
    // fallthrough to normal send
    await handleSend()
  }

  const isPDFMode=waitingFor==='confirm'&&messages.some(m=>m.isPDF)

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 72px)'}}>
      <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1a1a'}}><div style={S.label}>Registrar movimientos</div></div>
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:'12px'}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.role==='user'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'88%',padding:'10px 14px',borderRadius:'12px',fontSize:'0.88rem',lineHeight:1.55,whiteSpace:'pre-wrap',
              background:m.role==='user'?'#1e1a10':'#1a1a1a',
              border:m.role==='user'?'1px solid #3a3020':'1px solid #222',
              color:m.role==='user'?'#c8a96e':'#e8dcc8'}}>{m.text}</div>
            {m.txs&&m.role==='assistant'&&!m.isPDF&&(
              <button onClick={handleConfirm} style={{...S.btnGold,marginTop:'8px'}}>✓ Confirmar y guardar</button>
            )}
            {m.txs&&m.role==='assistant'&&m.isPDF&&(
              <button onClick={handleConfirm} style={{...S.btnGold,marginTop:'8px'}}>✓ Guardar todos</button>
            )}
          </div>
        ))}
        {loading&&<div style={{color:'#444',fontSize:'0.82rem',fontStyle:'italic'}}>Procesando...</div>}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:'10px 14px',borderTop:'1px solid #1a1a1a',display:'flex',gap:'8px',alignItems:'flex-end'}}>
        <button onClick={()=>fileRef.current?.click()} style={{background:'#1a1a1a',border:'1px solid #222',color:'#666',padding:'10px 11px',borderRadius:'8px',cursor:'pointer',fontSize:'1rem',flexShrink:0}}>📄</button>
        <input ref={fileRef} type="file" accept="application/pdf" onChange={handlePDF} style={{display:'none'}}/>
        <textarea value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();isPDFMode?handleSendPDF():handleSend()}}}
          placeholder={
            waitingFor==='cotiz_mama'?'Cotización USD (ej: 1400)...':
            waitingFor==='cotiz_obra'?'Cotización dólar blue (ej: 1400)...':
            waitingFor==='obra_category'?`Categoría de obra (${activeObraCats.join(', ')})...`:
            isPDFMode?'Nro + categoría para editar, o "guardar"...':
            '$14.000 pizza  o pegá varias líneas...'
          }
          rows={1} style={{flex:1,
            background:waitingFor?'#1a1810':'#1a1a1a',
            border:`1px solid ${waitingFor?'#3a3020':'#222'}`,
            color:'#e8dcc8',padding:'10px 12px',borderRadius:'8px',fontSize:'0.88rem',resize:'none',minHeight:'42px',maxHeight:'120px',fontFamily:'Georgia,serif',outline:'none'}}/>
        <button onClick={isPDFMode?handleSendPDF:handleSend} disabled={loading}
          style={{...S.btnGold,flexShrink:0,opacity:loading?0.4:1,padding:'10px 18px',fontSize:'1.1rem'}}>›</button>
      </div>
    </div>
  )
}

// ── MONTHLY ───────────────────────────────────────────────────────────
function MonthlyView({transactions,setTransactions,ingresos,setIngresos,usdMovements,obraMovements,categories,selectedMonth,setSelectedMonth,mamaMovements}){
  const {month,year}=selectedMonth
  const [tab,setTab]=useState('resumen')
  const [showAddIng,setShowAddIng]=useState(false)
  const [newIng,setNewIng]=useState({description:'',amount:''})
  const mTxs=transactions.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year})
  const mIngs=ingresos.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year})
  const totalG=mTxs.reduce((s,t)=>s+(t.amount||0),0)
  const totalI=mIngs.reduce((s,t)=>s+(t.amount||0),0)
  const bal=totalI-totalG
  const byCat=categories.reduce((acc,cat)=>{acc[cat]=mTxs.filter(t=>t.category===cat).reduce((s,t)=>s+(t.amount||0),0);return acc},{})
  const delTx=async t=>{await db.deleteTransaction(t.id);setTransactions(p=>p.filter(x=>x.id!==t.id))}
  const delIng=async i=>{await db.deleteIngreso(i.id);setIngresos(p=>p.filter(x=>x.id!==i.id))}
  const addIng=async()=>{
    if(!newIng.description||!newIng.amount)return
    const d=new Date(year,month,new Date().getDate())
    const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const ing={date:dateStr,description:newIng.description,amount:parseFloat(newIng.amount)}
    const saved=await db.insertIngreso(ing);setIngresos(p=>[...p,saved||ing]);setNewIng({description:'',amount:''});setShowAddIng(false)
  }
  const prev=()=>{const d=new Date(year,month-1);setSelectedMonth({month:d.getMonth(),year:d.getFullYear()})}
  const next=()=>{const d=new Date(year,month+1);setSelectedMonth({month:d.getMonth(),year:d.getFullYear()})}
  const handleExport=()=>exportToExcel({transactions,ingresos,usdMovements,obraMovements,categories,month,year})
  return (
    <div style={{padding:'20px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
        <button onClick={prev} style={S.navBtn}>‹</button>
        <h2 style={{flex:1,textAlign:'center',fontWeight:'normal',fontSize:'1.05rem',margin:0}}>{MONTHS[month]} {year}</h2>
        <button onClick={next} style={S.navBtn}>›</button>
      </div>
      <button onClick={handleExport} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>⬇ Exportar Excel — {MONTHS[month]} {year}</button>
      <div style={{display:'flex',gap:'6px',marginBottom:'16px'}}>
        {['resumen','gastos','ingresos'].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'8px 4px',background:tab===t?'#c8a96e':'#1a1a1a',color:tab===t?'#0f0f0f':'#666',border:'1px solid #222',borderRadius:'6px',cursor:'pointer',fontSize:'0.67rem',letterSpacing:'0.08em',textTransform:'uppercase'}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      {tab==='resumen'&&(<>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'12px'}}>
          <MiniCard label="Ingresos" value={fmt(totalI)} color="#6e9e6e"/>
          <MiniCard label="Gastos"   value={fmt(totalG)} color="#c87070"/>
        </div>
        <div style={{...S.card,background:bal>=0?'#141f14':'#1f1414',borderColor:bal>=0?'#1e3a1e':'#3a1e1e',marginBottom:'14px'}}>
          <div style={S.label}>Balance</div><div style={{fontSize:'1.5rem',color:bal>=0?'#6e9e6e':'#c87070',marginTop:'6px'}}>{fmt(bal)}</div>
        </div>
        <div style={S.card}>
          <div style={{...S.label,marginBottom:'12px'}}>Por categoría</div>
          {Object.entries(byCat).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([cat,val])=>(
            <div key={cat} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #1e1e1e'}}>
              <span style={{fontSize:'0.85rem',color:'#bbb'}}>{cat}</span>
              <span style={{fontSize:'0.85rem',color:'#c8a96e'}}>{fmt(val)}</span>
            </div>
          ))}
          {!Object.values(byCat).some(v=>v>0)&&<div style={{color:'#444',textAlign:'center',padding:'20px',fontSize:'0.85rem'}}>Sin gastos este mes</div>}
        </div>
      </>)}
      {tab==='gastos'&&(<>
        {mTxs.length===0&&<div style={{color:'#444',textAlign:'center',padding:'30px',fontSize:'0.88rem'}}>Sin gastos registrados</div>}
        {mTxs.map((t,i)=>(
          <div key={t.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{flex:1,minWidth:0,marginRight:'10px'}}>
              <div style={{fontSize:'0.7rem',color:'#555',marginBottom:'2px'}}>{t.category} · {t.date}</div>
              <div style={{fontSize:'0.88rem',color:'#ddd',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.description||'—'}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
              <span style={{color:'#c87070',fontSize:'0.88rem'}}>{fmt(t.amount)}</span>
              <button onClick={()=>delTx(t)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </>)}
      {tab==='ingresos'&&(<>
        {mIngs.map((t,i)=>(
          <div key={t.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'0.7rem',color:'#555'}}>{t.date}</div><div style={{fontSize:'0.88rem',color:'#ddd'}}>{t.description}</div></div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{color:'#6e9e6e',fontSize:'0.88rem'}}>{fmt(t.amount)}</span>
              <button onClick={()=>delIng(t)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
        {showAddIng?(
          <div style={{...S.card,marginTop:'8px'}}>
            <input placeholder="Descripción (ej: Sueldo Bri)" value={newIng.description} onChange={e=>setNewIng({...newIng,description:e.target.value})} style={S.input}/>
            <input placeholder="Monto en pesos" type="number" value={newIng.amount} onChange={e=>setNewIng({...newIng,amount:e.target.value})} style={{...S.input,marginTop:'8px'}}/>
            <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
              <button onClick={addIng} style={{...S.btnGold,flex:1}}>Guardar</button>
              <button onClick={()=>setShowAddIng(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
            </div>
          </div>
        ):(
          <button onClick={()=>setShowAddIng(true)} style={{...S.btnGray,width:'100%',marginTop:'8px'}}>+ Agregar ingreso</button>
        )}
      </>)}
    </div>
  )
}

// ── USD ───────────────────────────────────────────────────────────────
function USDView({usdMovements,setUSDMov}){
  const [form,setForm]=useState({date:'',usd100:'',usd_cambio:'',description:'',exchange_rate:''})
  const [show,setShow]=useState(false)
  const usd100Tot=usdMovements.reduce((s,m)=>s+(m.usd100||0),0)
  const usdCambioTot=usdMovements.reduce((s,m)=>s+(m.usd_cambio||0),0)
  const add=async()=>{
    const mv={date:form.date||new Date().toISOString().split('T')[0],usd100:parseFloat(form.usd100)||0,usd_cambio:parseFloat(form.usd_cambio)||0,description:form.description,exchange_rate:parseFloat(form.exchange_rate)||null}
    const saved=await db.insertUSD(mv);setUSDMov(p=>[...p,saved||mv]);setForm({date:'',usd100:'',usd_cambio:'',description:'',exchange_rate:''});setShow(false)
  }
  const del=async m=>{await db.deleteUSD(m.id);setUSDMov(p=>p.filter(x=>x.id!==m.id))}
  return (
    <div style={{padding:'20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'16px'}}>Caja USD</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        {[['Billetes',usd100Tot],['Cambio',usdCambioTot],['Total',usd100Tot+usdCambioTot]].map(([l,v])=>(
          <div key={l} style={S.card}><div style={S.label}>{l}</div><div style={{fontSize:'1rem',color:'#c8a96e',marginTop:'6px'}}>USD {v.toLocaleString()}</div></div>
        ))}
      </div>
      {show&&(
        <div style={{...S.card,marginBottom:'14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={S.input}/>
            <input placeholder="USD billetes (±)" value={form.usd100} onChange={e=>setForm({...form,usd100:e.target.value})} style={S.input} type="number"/>
            <input placeholder="USD cambio (±)" value={form.usd_cambio} onChange={e=>setForm({...form,usd_cambio:e.target.value})} style={S.input} type="number"/>
            <input placeholder="Cotización" value={form.exchange_rate} onChange={e=>setForm({...form,exchange_rate:e.target.value})} style={S.input} type="number"/>
          </div>
          <input placeholder="Descripción" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...S.input,marginBottom:'8px'}}/>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={add} style={{...S.btnGold,flex:1}}>Guardar</button>
            <button onClick={()=>setShow(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
          </div>
        </div>
      )}
      {!show&&<button onClick={()=>setShow(true)} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>+ Agregar movimiento</button>}
      <div style={{maxHeight:'52vh',overflowY:'auto'}}>
        {[...usdMovements].reverse().map((m,i)=>(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'0.7rem',color:'#555'}}>{m.date}{m.exchange_rate?` · $${m.exchange_rate}`:''}</div><div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description}</div></div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{textAlign:'right'}}>
                {!!m.usd100&&<div style={{fontSize:'0.8rem',color:m.usd100>0?'#6e9e6e':'#c87070'}}>{m.usd100>0?'+':''}{m.usd100} 💵</div>}
                {!!m.usd_cambio&&<div style={{fontSize:'0.8rem',color:m.usd_cambio>0?'#6e9e6e':'#c87070'}}>{m.usd_cambio>0?'+':''}{m.usd_cambio} 🔄</div>}
              </div>
              <button onClick={()=>del(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── OBRA ──────────────────────────────────────────────────────────────
function ObraView({obraMovements,setObraMov,obraSettings,setObraSettings}){
  const activeObra=obraSettings.activeObra||'Libertad'
  const obraCats=obraSettings.obras?.[activeObra]||['Materiales','Mano de obra','Dirección de obra','Mobiliario/equipamiento','Otro']
  const obrasList=Object.keys(obraSettings.obras||{Libertad:[]})
  const filtered=obraMovements.filter(m=>!m.obra_name||m.obra_name===activeObra)
  const [form,setForm]=useState({date:'',category:obraCats[0]||'Materiales',description:'',usd:''})
  const [show,setShow]=useState(false)
  const totalUSD=filtered.reduce((s,m)=>s+(m.usd||0),0)
  const byCat=obraCats.reduce((acc,c)=>{acc[c]=filtered.filter(m=>m.category===c).reduce((s,m)=>s+(m.usd||0),0);return acc},{})
  const add_=async()=>{
    if(!form.usd)return
    const mv={date:form.date||new Date().toISOString().split('T')[0],category:form.category,description:form.description,usd:parseFloat(form.usd)||0,obra_name:activeObra}
    const saved=await db.insertObra(mv);setObraMov(p=>[...p,saved||mv]);setForm({date:'',category:obraCats[0],description:'',usd:''});setShow(false)
  }
  const del=async m=>{await db.deleteObra(m.id);setObraMov(p=>p.filter(x=>x.id!==m.id))}

  return (
    <div style={{padding:'20px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
        <h2 style={{fontWeight:'normal',fontSize:'1.1rem',margin:0,flex:1}}>Obra {activeObra}</h2>
        {obrasList.length>1&&(
          <select value={activeObra} onChange={async e=>{
            const updated={...obraSettings,activeObra:e.target.value}
            setObraSettings(updated);await db.saveObraSettings(updated)
          }} style={{...S.input,width:'auto',fontSize:'0.75rem',padding:'6px 10px'}}>
            {obrasList.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>
      <div style={{...S.card,marginBottom:'16px',marginTop:'10px'}}>
        <div style={S.label}>Total USD</div>
        <div style={{fontSize:'1.4rem',color:'#c8a96e',marginTop:'6px'}}>USD {totalUSD.toLocaleString('es-AR',{maximumFractionDigits:2})}</div>
      </div>
      <div style={{...S.card,marginBottom:'16px'}}>
        <div style={{...S.label,marginBottom:'10px'}}>Por categoría</div>
        {obraCats.map(c=>(
          <div key={c} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #1e1e1e',fontSize:'0.85rem'}}>
            <span style={{color:'#bbb'}}>{c}</span>
            <span style={{color:byCat[c]>0?'#c8a96e':'#333'}}>USD {(byCat[c]||0).toLocaleString('es-AR',{maximumFractionDigits:2})}</span>
          </div>
        ))}
      </div>
      {show&&(
        <div style={{...S.card,marginBottom:'14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={S.input}/>
            <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={{...S.input,background:'#111'}}>
              {obraCats.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <input placeholder="USD" value={form.usd} onChange={e=>setForm({...form,usd:e.target.value})} style={{...S.input,marginBottom:'8px'}} type="number"/>
          <input placeholder="Descripción (opcional)" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...S.input,marginBottom:'8px'}}/>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={add_} style={{...S.btnGold,flex:1}}>Guardar</button>
            <button onClick={()=>setShow(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
          </div>
        </div>
      )}
      {!show&&<button onClick={()=>setShow(true)} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>+ Agregar gasto de obra</button>}
      <div style={{maxHeight:'38vh',overflowY:'auto'}}>
        {[...filtered].reverse().map((m,i)=>(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'0.7rem',color:'#555'}}>{m.date} · {m.category}</div>
              <div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description||'—'}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'0.85rem',color:'#c8a96e'}}>USD {(m.usd||0).toLocaleString('es-AR',{maximumFractionDigits:2})}</span>
              <button onClick={()=>del(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MAMÁ ──────────────────────────────────────────────────────────────
function MamaView({mamaMovements,setMamaMov}){
  const [form,setForm]=useState({date:'',amount:'',description:'',type:'gasto_mama'})
  const [show,setShow]=useState(false)
  const saldo=mamaMovements.reduce((s,m)=>s+(m.amount||0),0)
  const add=async()=>{
    if(!form.amount||!form.description)return
    const finalAmount=form.type==='pago_cuenta'?-Math.abs(parseFloat(form.amount)):Math.abs(parseFloat(form.amount))
    const mv={date:form.date||new Date().toISOString().split('T')[0],amount:finalAmount,description:form.description,type:form.type}
    const saved=await db.insertMama(mv)
    setMamaMov(p=>[...p,saved||mv])
    setForm({date:'',amount:'',description:'',type:'gasto_mama'})
    setShow(false)
  }
  const del=async m=>{await db.deleteMama(m.id);setMamaMov(p=>p.filter(x=>x.id!==m.id))}
  return (
    <div style={{padding:'20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'6px'}}>Cuenta Mamá</h2>
      <p style={{fontSize:'0.75rem',color:'#555',marginBottom:'16px',lineHeight:1.5}}>
        Los gastos con categoría "Mamá" y pagos en USD se registran automáticamente.<br/>
        Usá este formulario para movimientos manuales.
      </p>
      <div style={{...S.card,background:saldo>0?'#1f1a14':'#141f14',borderColor:saldo>0?'#3a2a1e':'#1e3a1e',marginBottom:'16px'}}>
        <div style={S.label}>Saldo — {saldo>0?'te debe':'le debés'}</div>
        <div style={{fontSize:'1.8rem',color:saldo>0?'#c8a96e':'#6e9e6e',marginTop:'6px'}}>
          USD {Math.abs(saldo).toLocaleString('es-AR',{maximumFractionDigits:2})}
        </div>
      </div>
      {show&&(
        <div style={{...S.card,marginBottom:'14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={S.input}/>
            <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{...S.input,background:'#111'}}>
              <option value="gasto_mama">Gasto por ella (suma)</option>
              <option value="pago_cuenta">Pago a cuenta (resta)</option>
            </select>
          </div>
          <input placeholder="Monto en USD" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={{...S.input,marginBottom:'8px'}} type="number"/>
          <input placeholder="Descripción" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...S.input,marginBottom:'8px'}}/>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={add} style={{...S.btnGold,flex:1}}>Guardar</button>
            <button onClick={()=>setShow(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
          </div>
        </div>
      )}
      {!show&&<button onClick={()=>setShow(true)} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>+ Agregar movimiento manual</button>}
      <div style={{maxHeight:'50vh',overflowY:'auto'}}>
        {[...mamaMovements].reverse().map((m,i)=>(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'0.7rem',color:'#555'}}>{m.date} · {m.type==='pago_cuenta'?'Pago a cuenta':'Gasto por ella'}</div>
              <div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'0.9rem',color:m.amount>=0?'#c87070':'#6e9e6e'}}>{m.amount>=0?'+':''}{(m.amount||0).toLocaleString('es-AR',{maximumFractionDigits:2})} USD</span>
              <button onClick={()=>del(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SETTINGS ──────────────────────────────────────────────────────────
function SettingsView({categories,setCategories,hiddenSections,setHiddenSections,obraSettings,setObraSettings}){
  const [cats,setCats]=useState([...categories])
  const [newCat,setNewCat]=useState('')
  const [saved,setSaved]=useState(false)
  const [showKey,setShowKey]=useState(false)
  const [newKey,setNewKey]=useState('')
  // Obra settings
  const [showObraSettings,setShowObraSettings]=useState(false)
  const [newObraName,setNewObraName]=useState('')
  const [editingObraCats,setEditingObraCats]=useState(null) // obra name being edited
  const [newObraCat,setNewObraCat]=useState('')

  const add=()=>{if(!newCat.trim())return;setCats([...cats,newCat.trim()]);setNewCat('')}
  const remove=i=>setCats(cats.filter((_,ci)=>ci!==i))
  const saveCats=async()=>{await db.saveCategories(cats);setCategories(cats);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const saveKey_=()=>{if(newKey.trim()){localStorage.setItem('gemini_api_key',newKey.trim());setShowKey(false);setNewKey('');alert('API key actualizada.')}}
  const toggleSection=async s=>{
    const updated=hiddenSections.includes(s)?hiddenSections.filter(x=>x!==s):[...hiddenSections,s]
    setHiddenSections(updated);await db.saveHiddenSections(updated)
  }
  const sectionLabels={obra:'⚒ Obra',mama:'♡ Cuenta Mamá'}

  const addObra=async()=>{
    if(!newObraName.trim())return
    const updated={...obraSettings,obras:{...obraSettings.obras,[newObraName.trim()]:['Materiales','Mano de obra','Dirección de obra','Mobiliario/equipamiento','Otro']}}
    setObraSettings(updated);await db.saveObraSettings(updated);setNewObraName('')
  }
  const setActiveObra=async name=>{
    const updated={...obraSettings,activeObra:name}
    setObraSettings(updated);await db.saveObraSettings(updated)
  }
  const addObraCat=async(obraName)=>{
    if(!newObraCat.trim())return
    const currentCats=obraSettings.obras[obraName]||[]
    const updated={...obraSettings,obras:{...obraSettings.obras,[obraName]:[...currentCats,newObraCat.trim()]}}
    setObraSettings(updated);await db.saveObraSettings(updated);setNewObraCat('')
  }
  const removeObraCat=async(obraName,idx)=>{
    const currentCats=obraSettings.obras[obraName]||[]
    const updated={...obraSettings,obras:{...obraSettings.obras,[obraName]:currentCats.filter((_,i)=>i!==idx)}}
    setObraSettings(updated);await db.saveObraSettings(updated)
  }

  return (
    <div style={{padding:'20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'20px'}}>Configuración</h2>

      {/* Secciones opcionales */}
      <div style={{...S.label,marginBottom:'12px'}}>Secciones opcionales</div>
      <div style={{...S.card,marginBottom:'20px'}}>
        <p style={{fontSize:'0.75rem',color:'#555',margin:'0 0 12px',lineHeight:1.5}}>Ocultá secciones que ya no uses. Los datos no se borran.</p>
        {ALL_SECTIONS.map(s=>(
          <div key={s} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1a1a1a'}}>
            <span style={{fontSize:'0.88rem',color:hiddenSections.includes(s)?'#444':'#ccc'}}>{sectionLabels[s]}</span>
            <button onClick={()=>toggleSection(s)} style={{...hiddenSections.includes(s)?S.btnGold:S.btnGray,padding:'6px 14px',fontSize:'0.7rem'}}>
              {hiddenSections.includes(s)?'Mostrar':'Ocultar'}
            </button>
          </div>
        ))}
      </div>

      {/* Obras */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
        <div style={S.label}>Obras</div>
        <button onClick={()=>setShowObraSettings(!showObraSettings)} style={{...S.btnGray,padding:'4px 10px',fontSize:'0.7rem'}}>
          {showObraSettings?'Cerrar':'Gestionar'}
        </button>
      </div>
      {showObraSettings&&(
        <div style={{...S.card,marginBottom:'16px'}}>
          <p style={{fontSize:'0.75rem',color:'#555',margin:'0 0 12px',lineHeight:1.5}}>Creá obras nuevas y gestioná sus categorías.</p>
          {Object.keys(obraSettings.obras||{}).map(obraName=>(
            <div key={obraName} style={{borderBottom:'1px solid #1e1e1e',paddingBottom:'12px',marginBottom:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                <span style={{fontSize:'0.9rem',color:obraSettings.activeObra===obraName?'#c8a96e':'#ccc',fontWeight:obraSettings.activeObra===obraName?'bold':'normal'}}>{obraName}{obraSettings.activeObra===obraName?' ✓':''}</span>
                {obraSettings.activeObra!==obraName&&(
                  <button onClick={()=>setActiveObra(obraName)} style={{...S.btnGray,padding:'4px 10px',fontSize:'0.7rem'}}>Activar</button>
                )}
              </div>
              <button onClick={()=>setEditingObraCats(editingObraCats===obraName?null:obraName)} style={{...S.btnGray,fontSize:'0.68rem',padding:'4px 8px',marginBottom:'6px'}}>
                {editingObraCats===obraName?'▲ Cerrar categorías':'▼ Ver/editar categorías'}
              </button>
              {editingObraCats===obraName&&(
                <div style={{paddingLeft:'8px'}}>
                  {(obraSettings.obras[obraName]||[]).map((c,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:'1px solid #1a1a1a',fontSize:'0.82rem'}}>
                      <span style={{color:'#aaa'}}>{c}</span>
                      <button onClick={()=>removeObraCat(obraName,i)} style={{background:'none',border:'none',color:'#555',cursor:'pointer'}}>✕</button>
                    </div>
                  ))}
                  <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
                    <input placeholder="Nueva categoría..." value={newObraCat} onChange={e=>setNewObraCat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addObraCat(obraName)} style={{...S.input,flex:1,fontSize:'0.82rem',padding:'6px 10px'}}/>
                    <button onClick={()=>addObraCat(obraName)} style={{...S.btnGray,padding:'6px 10px'}}>+</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
            <input placeholder="Nombre nueva obra..." value={newObraName} onChange={e=>setNewObraName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addObra()} style={{...S.input,flex:1}}/>
            <button onClick={addObra} style={S.btnGold}>+ Obra</button>
          </div>
        </div>
      )}

      {/* Categorías de gastos */}
      <div style={{...S.label,marginBottom:'12px'}}>Categorías de gastos</div>
      <div style={{marginBottom:'14px'}}>
        {cats.map((c,i)=>(
          <div key={i} style={{...S.card,marginBottom:'6px',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px'}}>
            <span style={{fontSize:'0.88rem'}}>{c}</span>
            <button onClick={()=>remove(i)} style={{background:'none',border:'none',color:'#555',cursor:'pointer'}}>✕</button>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
        <input placeholder="Nueva categoría..." value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} style={{...S.input,flex:1}}/>
        <button onClick={add} style={S.btnGray}>+</button>
      </div>
      <button onClick={saveCats} style={{...S.btnGold,width:'100%',marginBottom:'24px'}}>{saved?'✓ Guardado':'Guardar categorías'}</button>

      {/* API Key */}
      <div style={{borderTop:'1px solid #1a1a1a',paddingTop:'20px'}}>
        <div style={{...S.label,marginBottom:'12px'}}>Gemini API Key</div>
        {showKey?(<>
          <input type="password" placeholder="AIzaSy..." value={newKey} onChange={e=>setNewKey(e.target.value)} style={{...S.input,marginBottom:'8px'}}/>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={saveKey_} style={{...S.btnGold,flex:1}}>Guardar</button>
            <button onClick={()=>setShowKey(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
          </div>
        </>):(
          <button onClick={()=>setShowKey(true)} style={{...S.btnGray,width:'100%'}}>Cambiar API Key</button>
        )}
      </div>
    </div>
  )
}
