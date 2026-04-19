import { useState, useEffect, useRef } from 'react'
import { parseChat, parsePDF, hasGeminiKey } from './gemini.js'
import { exportToExcel } from './export.js'
import * as db from './db.js'

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DEFAULT_CATEGORIES = ["Comida","Delivery","Salidas","Auto y transporte","Servicios e impuestos","Salud y belleza","Casa y art. del hogar","Ropa","Educación","Mascotas","Deporte","Regalos","Ahorro e inversión","Asesorías","Otros","Azul"]
const OBRA_CATS = ["Dirección de obra","Materiales","Mano de obra","Mobiliario/equipamiento","Otro"]
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
  const [transactions,setTransactions]=useState([])
  const [ingresos,setIngresos]=useState([])
  const [usdMovements,setUSDMov]=useState([])
  const [obraMovements,setObraMov]=useState([])
  const [selectedMonth,setSelectedMonth]=useState(()=>{ const d=new Date(); return {month:d.getMonth(),year:d.getFullYear()} })

  useEffect(()=>{
    ;(async()=>{
      const [cats,txs,ings,usd,obra]=await Promise.all([db.getCategories(DEFAULT_CATEGORIES),db.getTransactions(),db.getIngresos(),db.getUSDMovements(),db.getObraMovements()])
      setCategories(cats); setTransactions(txs); setIngresos(ings); setUSDMov(usd); setObraMov(obra); setReady(true)
    })()
  },[])

  if (!ready) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0f0f0f',color:'#444',fontFamily:'Georgia,serif'}}>Cargando...</div>
  if (!hasGeminiKey()) return <SetupScreen onDone={()=>window.location.reload()} />

  const p={transactions,setTransactions,ingresos,setIngresos,usdMovements,setUSDMov,obraMovements,setObraMov,categories,setCategories,selectedMonth,setSelectedMonth}
  return (
    <div style={{minHeight:'100vh',background:'#0f0f0f',color:'#e8dcc8',fontFamily:'Georgia,serif',paddingBottom:'72px'}}>
      {view==='home'&&<HomeView {...p} setView={setView}/>}
      {view==='chat'&&<ChatView {...p}/>}
      {view==='monthly'&&<MonthlyView {...p}/>}
      {view==='usd'&&<USDView {...p}/>}
      {view==='obra'&&<ObraView {...p}/>}
      {view==='settings'&&<SettingsView {...p}/>}
      <BottomNav view={view} setView={setView}/>
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
          <p style={{color:'#555',fontSize:'0.85rem',lineHeight:1.6,margin:0}}>Necesitás una API key de Google Gemini.<br/>Es gratis — 1500 consultas por día.</p>
        </div>
        <div style={{...S.card,padding:'22px'}}>
          <label style={{...S.label,display:'block',marginBottom:'8px'}}>Google Gemini API Key</label>
          <input type="password" placeholder="AIzaSy..." value={key} onChange={e=>setKey(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} style={{...S.input,marginBottom:'14px',fontFamily:'monospace'}}/>
          <button onClick={save} style={{...S.btnGold,width:'100%',padding:'12px'}}>Guardar y comenzar</button>
        </div>
        <p style={{color:'#333',fontSize:'0.72rem',marginTop:'16px',textAlign:'center',lineHeight:1.6}}>Conseguí tu key gratis en <span style={{color:'#555'}}>aistudio.google.com</span><br/>Se guarda solo en tu dispositivo.</p>
      </div>
    </div>
  )
}

function BottomNav({view,setView}){
  const items=[{id:'home',icon:'⌂',label:'Inicio'},{id:'chat',icon:'✦',label:'Registrar'},{id:'monthly',icon:'◈',label:'Mes'},{id:'usd',icon:'$',label:'USD'},{id:'obra',icon:'⚒',label:'Obra'},{id:'settings',icon:'⚙',label:'Config'}]
  return (
    <nav style={{position:'fixed',bottom:0,left:0,right:0,background:'#141414',borderTop:'1px solid #1e1e1e',display:'flex',zIndex:100,paddingBottom:'env(safe-area-inset-bottom)'}}>
      {items.map(it=>(
        <button key={it.id} onClick={()=>setView(it.id)} style={{flex:1,padding:'10px 2px 8px',background:'none',border:'none',color:view===it.id?'#c8a96e':'#444',cursor:'pointer',fontSize:'0.57rem',letterSpacing:'0.05em',textTransform:'uppercase',display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',transition:'color 0.2s'}}>
          <span style={{fontSize:'1.05rem'}}>{it.icon}</span>{it.label}
        </button>
      ))}
    </nav>
  )
}

function MiniCard({label,value,color}){return(<div style={S.card}><div style={S.label}>{label}</div><div style={{fontSize:'1.1rem',color,marginTop:'6px'}}>{value}</div></div>)}

function HomeView({transactions,ingresos,usdMovements,selectedMonth,setSelectedMonth,setView}){
  const {month,year}=selectedMonth
  const mTxs=transactions.filter(t=>{const d=new Date(t.date);return d.getMonth()===month&&d.getFullYear()===year})
  const mIngs=ingresos.filter(t=>{const d=new Date(t.date);return d.getMonth()===month&&d.getFullYear()===year})
  const totalG=mTxs.reduce((s,t)=>s+t.amount,0),totalI=mIngs.reduce((s,t)=>s+t.amount,0),bal=totalI-totalG
  const usdTot=usdMovements.reduce((s,m)=>s+(m.usd100||0)+(m.usd_cambio||0),0)
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
        <MiniCard label="Gastos" value={fmt(totalG)} color="#c87070"/>
      </div>
      <div style={{...S.card,background:bal>=0?'#141f14':'#1f1414',borderColor:bal>=0?'#1e3a1e':'#3a1e1e',marginBottom:'12px'}}>
        <div style={S.label}>Balance del mes</div>
        <div style={{fontSize:'1.6rem',color:bal>=0?'#6e9e6e':'#c87070',marginTop:'6px'}}>{fmt(bal)}</div>
      </div>
      <div style={{...S.card,marginBottom:'22px'}}>
        <div style={S.label}>Dólares en caja</div>
        <div style={{fontSize:'1.4rem',color:'#c8a96e',marginTop:'6px'}}>USD {usdTot.toLocaleString('es-AR')}</div>
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

function ChatView({categories,transactions,setTransactions,ingresos,setIngresos,usdMovements,setUSDMov}){
  const [input,setInput]=useState('')
  const [messages,setMessages]=useState([{role:'assistant',text:'Hola! Escribí los gastos como en el WhatsApp:\n\n• $14.000 pizza\n• $8.300 súper\n• Cambio a 1410 -usd 400 +$564.000\n• + $2.272.400 cancelación sueldo\n\nPodés pegar varias líneas juntas o subir un PDF con 📄'}])
  const [loading,setLoading]=useState(false)
  const [pending,setPending]=useState([])
  const bottomRef=useRef(),fileRef=useRef()
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages])
  const addMsg=(role,text,txs)=>setMessages(p=>[...p,{role,text,txs}])

  const handleSend=async()=>{
    if(!input.trim()||loading)return
    const text=input.trim();setInput('');setLoading(true);addMsg('user',text)
    try{
      const parsed=await parseChat(text,categories)
      if(!parsed.length){addMsg('assistant','No pude interpretar ese texto. Intentá de nuevo.');setLoading(false);return}
      setPending(parsed)
      const summary=parsed.map(t=>{
        if(t.type==='usd')return`💱 Cambio: ${t.usd_amount>0?'+':''}${t.usd_amount} USD @ $${t.exchange_rate} → ${fmt(t.peso_amount)}`
        if(t.type==='ingreso')return`💰 Ingreso: ${fmt(t.amount)} — ${t.description}`
        return`📌 ${t.category}: ${fmt(t.amount)} — ${t.description}`
      }).join('\n')
      addMsg('assistant',`Entendí ${parsed.length} movimiento${parsed.length>1?'s':''}:\n\n${summary}\n\n¿Lo guardo?`,parsed)
    }catch(e){addMsg('assistant',e.message==='NO_API_KEY'?'⚠️ Falta la API key de Gemini.':`Error: ${e.message}`)}
    setLoading(false)
  }

  const handleConfirm=async()=>{
    const dateStr=new Date().toISOString().split('T')[0]
    const gastos=[],usds=[],ings=[]
    pending.forEach(t=>{
      if(t.type==='gasto')gastos.push({date:dateStr,amount:t.amount,category:t.category,description:t.description||''})
      if(t.type==='ingreso')ings.push({date:dateStr,amount:t.amount,description:t.description||''})
      if(t.type==='usd')usds.push({date:dateStr,usd100:t.usd_amount||0,usd_cambio:0,description:t.description||'Cambio',exchange_rate:t.exchange_rate,peso_amount:t.peso_amount})
    })
    if(gastos.length){await db.insertTransactions(gastos);setTransactions(p=>[...p,...gastos])}
    for(const u of usds){await db.insertUSD(u);setUSDMov(p=>[...p,u])}
    for(const i of ings){await db.insertIngreso(i);setIngresos(p=>[...p,i])}
    setPending([]);addMsg('assistant','✓ Guardado correctamente.')
  }

  const handlePDF=async(e)=>{
    const file=e.target.files?.[0];if(!file)return
    setLoading(true);addMsg('user',`📄 ${file.name}`)
    try{
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})
      const parsed=await parsePDF(base64,categories)
      if(!parsed.length){addMsg('assistant','No encontré consumos en el PDF.');setLoading(false);return}
      const withType=parsed.map(t=>({...t,type:'gasto'}));setPending(withType)
      const preview=parsed.slice(0,6).map(t=>`• ${t.description}${t.installment?' ('+t.installment+')':''}: ${fmt(t.amount)} → ${t.category}`).join('\n')
      addMsg('assistant',`Encontré ${parsed.length} consumos:\n\n${preview}${parsed.length>6?`\n...y ${parsed.length-6} más`:''}\n\n¿Lo guardo?`,withType)
    }catch(err){addMsg('assistant',`Error al leer el PDF: ${err.message}`)}
    setLoading(false);e.target.value=''
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 72px)'}}>
      <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1a1a'}}><div style={S.label}>Registrar movimientos</div></div>
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:'12px'}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.role==='user'?'flex-end':'flex-start'}}>
            <div style={{maxWidth:'88%',padding:'10px 14px',borderRadius:'12px',fontSize:'0.88rem',lineHeight:1.55,whiteSpace:'pre-wrap',background:m.role==='user'?'#1e1a10':'#1a1a1a',border:m.role==='user'?'1px solid #3a3020':'1px solid #222',color:m.role==='user'?'#c8a96e':'#e8dcc8'}}>{m.text}</div>
            {m.txs&&m.role==='assistant'&&<button onClick={handleConfirm} style={{...S.btnGold,marginTop:'8px'}}>✓ Confirmar y guardar</button>}
          </div>
        ))}
        {loading&&<div style={{color:'#444',fontSize:'0.82rem',fontStyle:'italic'}}>Procesando...</div>}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:'10px 14px',borderTop:'1px solid #1a1a1a',display:'flex',gap:'8px',alignItems:'flex-end'}}>
        <button onClick={()=>fileRef.current?.click()} style={{background:'#1a1a1a',border:'1px solid #222',color:'#666',padding:'10px 11px',borderRadius:'8px',cursor:'pointer',fontSize:'1rem',flexShrink:0}}>📄</button>
        <input ref={fileRef} type="file" accept="application/pdf" onChange={handlePDF} style={{display:'none'}}/>
        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}}} placeholder="$14.000 pizza  o pegá varias líneas..." rows={1} style={{flex:1,background:'#1a1a1a',border:'1px solid #222',color:'#e8dcc8',padding:'10px 12px',borderRadius:'8px',fontSize:'0.88rem',resize:'none',minHeight:'42px',maxHeight:'120px',fontFamily:'Georgia,serif',outline:'none'}}/>
        <button onClick={handleSend} disabled={loading} style={{...S.btnGold,flexShrink:0,opacity:loading?0.4:1,padding:'10px 18px',fontSize:'1.1rem'}}>›</button>
      </div>
    </div>
  )
}

function MonthlyView({transactions,setTransactions,ingresos,setIngresos,usdMovements,obraMovements,categories,selectedMonth,setSelectedMonth}){
  const {month,year}=selectedMonth
  const [tab,setTab]=useState('resumen')
  const [showAddIng,setShowAddIng]=useState(false)
  const [newIng,setNewIng]=useState({description:'',amount:''})
  const mTxs=transactions.filter(t=>{const d=new Date(t.date);return d.getMonth()===month&&d.getFullYear()===year})
  const mIngs=ingresos.filter(t=>{const d=new Date(t.date);return d.getMonth()===month&&d.getFullYear()===year})
  const totalG=mTxs.reduce((s,t)=>s+t.amount,0),totalI=mIngs.reduce((s,t)=>s+t.amount,0),bal=totalI-totalG
  const byCat=categories.reduce((acc,cat)=>{acc[cat]=mTxs.filter(t=>t.category===cat).reduce((s,t)=>s+t.amount,0);return acc},{})
  const delTx=async(t)=>{await db.deleteTransaction(t.id);setTransactions(p=>p.filter(x=>x!==t))}
  const delIng=async(i)=>{await db.deleteIngreso(i.id);setIngresos(p=>p.filter(x=>x!==i))}
  const addIng=async()=>{
    if(!newIng.description||!newIng.amount)return
    const d=new Date(year,month,new Date().getDate())
    const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const ing={date:dateStr,description:newIng.description,amount:parseFloat(newIng.amount)}
    await db.insertIngreso(ing);setIngresos(p=>[...p,ing]);setNewIng({description:'',amount:''});setShowAddIng(false)
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
      {tab==='resumen'&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'12px'}}>
            <MiniCard label="Ingresos" value={fmt(totalI)} color="#6e9e6e"/>
            <MiniCard label="Gastos" value={fmt(totalG)} color="#c87070"/>
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
        </>
      )}
      {tab==='gastos'&&(
        <>
          {mTxs.length===0&&<div style={{color:'#444',textAlign:'center',padding:'30px',fontSize:'0.88rem'}}>Sin gastos registrados</div>}
          {mTxs.map((t,i)=>(
            <div key={i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
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
        </>
      )}
      {tab==='ingresos'&&(
        <>
          {mIngs.map((t,i)=>(
            <div key={i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
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
        </>
      )}
    </div>
  )
}

function USDView({usdMovements,setUSDMov}){
  const [form,setForm]=useState({date:'',usd100:'',usd_cambio:'',description:'',exchange_rate:''})
  const [show,setShow]=useState(false)
  const usd100Tot=usdMovements.reduce((s,m)=>s+(m.usd100||0),0)
  const usdCambioTot=usdMovements.reduce((s,m)=>s+(m.usd_cambio||0),0)
  const add=async()=>{
    const mv={date:form.date||new Date().toISOString().split('T')[0],usd100:parseFloat(form.usd100)||0,usd_cambio:parseFloat(form.usd_cambio)||0,description:form.description,exchange_rate:parseFloat(form.exchange_rate)||null}
    await db.insertUSD(mv);setUSDMov(p=>[...p,mv]);setForm({date:'',usd100:'',usd_cambio:'',description:'',exchange_rate:''});setShow(false)
  }
  const del=async(m)=>{await db.deleteUSD(m.id);setUSDMov(p=>p.filter(x=>x!==m))}
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
          <div key={i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
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

function ObraView({obraMovements,setObraMov}){
  const [form,setForm]=useState({date:'',category:'Materiales',description:'',pesos:'',usd:'',pay_method:'Transferencia'})
  const [show,setShow]=useState(false)
  const totalUSD=obraMovements.reduce((s,m)=>s+(m.usd||0),0),totalPesos=obraMovements.reduce((s,m)=>s+(m.pesos||0),0)
  const byCat=OBRA_CATS.reduce((acc,c)=>{acc[c]=obraMovements.filter(m=>m.category===c).reduce((s,m)=>s+(m.usd||0),0);return acc},{})
  const add_=async()=>{
    const mv={date:form.date||new Date().toISOString().split('T')[0],category:form.category,description:form.description,pesos:parseFloat(form.pesos)||0,usd:parseFloat(form.usd)||0,pay_method:form.pay_method}
    await db.insertObra(mv);setObraMov(p=>[...p,mv]);setForm({date:'',category:'Materiales',description:'',pesos:'',usd:'',pay_method:'Transferencia'});setShow(false)
  }
  const del=async(m)=>{await db.deleteObra(m.id);setObraMov(p=>p.filter(x=>x!==m))}
  return (
    <div style={{padding:'20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'16px'}}>Obra Libertad</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        <div style={S.card}><div style={S.label}>Total pesos</div><div style={{fontSize:'1rem',color:'#c8a96e',marginTop:'6px'}}>{fmt(totalPesos)}</div></div>
        <div style={S.card}><div style={S.label}>Total USD</div><div style={{fontSize:'1rem',color:'#c8a96e',marginTop:'6px'}}>USD {totalUSD.toLocaleString()}</div></div>
      </div>
      <div style={{...S.card,marginBottom:'16px'}}>
        <div style={{...S.label,marginBottom:'10px'}}>Por categoría (USD)</div>
        {OBRA_CATS.map(c=>byCat[c]>0&&<div key={c} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #1e1e1e',fontSize:'0.85rem'}}><span style={{color:'#bbb'}}>{c}</span><span style={{color:'#c8a96e'}}>USD {byCat[c].toLocaleString()}</span></div>)}
      </div>
      {show&&(
        <div style={{...S.card,marginBottom:'14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={S.input}/>
            <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={{...S.input,background:'#111'}}>{OBRA_CATS.map(c=><option key={c}>{c}</option>)}</select>
            <input placeholder="Pesos" value={form.pesos} onChange={e=>setForm({...form,pesos:e.target.value})} style={S.input} type="number"/>
            <input placeholder="USD" value={form.usd} onChange={e=>setForm({...form,usd:e.target.value})} style={S.input} type="number"/>
          </div>
          <input placeholder="Descripción" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...S.input,marginBottom:'8px'}}/>
          <select value={form.pay_method} onChange={e=>setForm({...form,pay_method:e.target.value})} style={{...S.input,background:'#111',marginBottom:'8px'}}>{['Efectivo','Transferencia','Tarjeta'].map(p=><option key={p}>{p}</option>)}</select>
          <div style={{display:'flex',gap:'8px'}}><button onClick={add_} style={{...S.btnGold,flex:1}}>Guardar</button><button onClick={()=>setShow(false)} style={{...S.btnGray,flex:1}}>Cancelar</button></div>
        </div>
      )}
      {!show&&<button onClick={()=>setShow(true)} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>+ Agregar gasto de obra</button>}
      <div style={{maxHeight:'45vh',overflowY:'auto'}}>
        {[...obraMovements].reverse().map((m,i)=>(
          <div key={i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'0.7rem',color:'#555'}}>{m.date} · {m.category} · {m.pay_method}</div><div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description}</div></div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{textAlign:'right'}}>{m.usd>0&&<div style={{fontSize:'0.8rem',color:'#c8a96e'}}>USD {m.usd}</div>}{m.pesos>0&&<div style={{fontSize:'0.75rem',color:'#888'}}>{fmt(m.pesos)}</div>}</div>
              <button onClick={()=>del(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsView({categories,setCategories}){
  const [cats,setCats]=useState([...categories])
  const [newCat,setNewCat]=useState('')
  const [saved,setSaved]=useState(false)
  const [showKey,setShowKey]=useState(false)
  const [newKey,setNewKey]=useState('')
  const add=()=>{if(!newCat.trim())return;setCats([...cats,newCat.trim()]);setNewCat('')}
  const remove=(i)=>setCats(cats.filter((_,ci)=>ci!==i))
  const saveCats=async()=>{await db.saveCategories(cats);setCategories(cats);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const saveKey_=()=>{if(newKey.trim()){localStorage.setItem('gemini_api_key',newKey.trim());setShowKey(false);setNewKey('');alert('API key actualizada.')}}
  return (
    <div style={{padding:'20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'20px'}}>Configuración</h2>
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
      <div style={{borderTop:'1px solid #1a1a1a',paddingTop:'20px'}}>
        <div style={{...S.label,marginBottom:'12px'}}>Gemini API Key</div>
        {showKey?(<>
          <input type="password" placeholder="AIzaSy..." value={newKey} onChange={e=>setNewKey(e.target.value)} style={{...S.input,marginBottom:'8px'}}/>
          <div style={{display:'flex',gap:'8px'}}><button onClick={saveKey_} style={{...S.btnGold,flex:1}}>Guardar</button><button onClick={()=>setShowKey(false)} style={{...S.btnGray,flex:1}}>Cancelar</button></div>
        </>):(
          <button onClick={()=>setShowKey(true)} style={{...S.btnGray,width:'100%'}}>Cambiar API Key</button>
        )}
      </div>
    </div>
  )
}
