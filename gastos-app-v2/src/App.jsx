import { useState, useEffect, useRef } from 'react'
import { parseChat, parsePDF, hasGeminiKey } from './gemini.js'
import { exportToExcel, exportToPDF } from './export.js'
import * as db from './db.js'
import { entityBalance } from './db.js'

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DEFAULT_CATEGORIES = ["Comida","Delivery","Salidas","Auto y transporte","Servicios e impuestos","Salud y belleza","Casa y art. del hogar","Ropa","Educación","Mascotas","Deporte","Regalos","Ahorro e inversión","Asesorías","Mamá","Obra","Préstamos/Entidades","Cambio USD","Otros","Azul","Ajuste de cierre"]
const DEFAULT_PROJECT_CATS = ['Dirección de obra','Materiales','Mano de obra','Mobiliario/equipamiento','Otro']
const ALL_SECTIONS = ["entities","projects"]
const fmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0)
const fmtUsd = n => `USD ${(n||0).toLocaleString('es-AR',{maximumFractionDigits:2})}`
const S = {
  card:    {background:'#1a1a1a',border:'1px solid #222',borderRadius:'8px',padding:'16px'},
  navBtn:  {background:'#1a1a1a',border:'1px solid #222',color:'#777',padding:'4px 14px',borderRadius:'4px',cursor:'pointer',fontSize:'1rem'},
  input:   {width:'100%',background:'#111',border:'1px solid #2a2a2a',color:'#e8dcc8',padding:'10px 12px',borderRadius:'6px',fontSize:'0.9rem',fontFamily:'Georgia,serif',outline:'none',boxSizing:'border-box'},
  btnGold: {background:'#c8a96e',color:'#0f0f0f',border:'none',padding:'10px 16px',borderRadius:'6px',cursor:'pointer',fontSize:'0.8rem',fontWeight:'bold',letterSpacing:'0.06em',textTransform:'uppercase'},
  btnGray: {background:'#1a1a1a',color:'#888',border:'1px solid #2a2a2a',padding:'10px 16px',borderRadius:'6px',cursor:'pointer',fontSize:'0.8rem',letterSpacing:'0.06em',textTransform:'uppercase'},
  label:   {fontSize:'0.6rem',letterSpacing:'0.12em',color:'#666',textTransform:'uppercase'},
}

function matchByName(list, text) {
  if (!text) return null
  const t = text.toLowerCase().trim()
  return list.find(x => x.name.toLowerCase() === t) || list.find(x => x.name.toLowerCase().includes(t) || t.includes(x.name.toLowerCase())) || null
}

const SETTER_BY_TABLE = {
  transactions: 'setTransactions',
  ingresos: 'setIngresos',
  usd_movements: 'setUSDMov',
  entity_movements: 'setEntityMov',
  project_movements: 'setProjectMov',
}

// Borra una fila y, si tiene una operación vinculada (linked_table/linked_id),
// borra también esa contraparte — así nunca queda una mitad de la jugada sola.
// "setters" tiene que traer las 5 funciones de set de abajo (vienen todas en "p").
async function deleteLinked(table, row, setters) {
  await db.deleteRow(table, row.id)
  setters[SETTER_BY_TABLE[table]](p => p.filter(x => x.id !== row.id))
  if (row.linked_table && row.linked_id && SETTER_BY_TABLE[row.linked_table]) {
    await db.deleteRow(row.linked_table, row.linked_id)
    setters[SETTER_BY_TABLE[row.linked_table]](p => p.filter(x => x.id !== row.linked_id))
  }
}

// Edita una fila. Si está vinculada, solo propaga fecha/descripción a la
// contraparte (los dos comparten esos nombres de columna en las 5 tablas).
// El monto/categoría/moneda de un registro vinculado no se propaga acá a
// propósito — si hace falta corregir el monto de un vínculo, conviene
// borrarlo (se borran las dos puntas solas) y volver a cargarlo bien.
async function updateLinked(table, row, fields, setters) {
  await db.updateRow(table, row.id, fields)
  setters[SETTER_BY_TABLE[table]](p => p.map(x => x.id === row.id ? { ...x, ...fields } : x))
  if (row.linked_table && row.linked_id && SETTER_BY_TABLE[row.linked_table]) {
    const propagated = {}
    if ('date' in fields) propagated.date = fields.date
    if ('description' in fields) propagated.description = fields.description
    if (Object.keys(propagated).length) {
      await db.updateRow(row.linked_table, row.linked_id, propagated)
      setters[SETTER_BY_TABLE[row.linked_table]](p => p.map(x => x.id === row.linked_id ? { ...x, ...propagated } : x))
    }
  }
}

// Formulario de edición genérico, reutilizado en las 5 listas de movimientos.
function EditForm({fields, values, onChange, onSave, onCancel, note}){
  return (
    <div style={{...S.card,marginBottom:'8px',border:'1px solid #3a3020'}}>
      {note&&<div style={{fontSize:'0.68rem',color:'#888',marginBottom:'10px',lineHeight:1.5}}>{note}</div>}
      {fields.map(f=>(
        <div key={f.key} style={{marginBottom:'8px'}}>
          {f.type==='select'?(
            <select value={values[f.key]??''} onChange={e=>onChange(f.key,e.target.value)} style={{...S.input,background:'#111'}}>
              {f.options.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          ):(
            <input type={f.type||'text'} placeholder={f.label} value={values[f.key]??''} onChange={e=>onChange(f.key,e.target.value)} style={S.input}/>
          )}
        </div>
      ))}
      <div style={{display:'flex',gap:'8px'}}>
        <button onClick={onSave} style={{...S.btnGold,flex:1}}>Guardar</button>
        <button onClick={onCancel} style={{...S.btnGray,flex:1}}>Cancelar</button>
      </div>
    </div>
  )
}

export default function App() {
  const [ready,setReady]=useState(false)
  const [view,setView]=useState('chat')
  const [categories,setCategories]=useState(DEFAULT_CATEGORIES)
  const [hiddenSections,setHiddenSections]=useState([])
  const [transactions,setTransactions]=useState([])
  const [ingresos,setIngresos]=useState([])
  const [usdMovements,setUSDMov]=useState([])
  const [entities,setEntities]=useState([])
  const [entityMovements,setEntityMov]=useState([])
  const [projects,setProjects]=useState([])
  const [projectMovements,setProjectMov]=useState([])
  const [selectedMonth,setSelectedMonth]=useState(()=>{ const d=new Date(); return {month:d.getMonth(),year:d.getFullYear()} })
  const [carryover,setCarryover]=useState(null) // null | false | number

  useEffect(()=>{
    ;(async()=>{
      try {
        const [cats,hidden,txs,ings,usd,ents,entMovs,projs,projMovs]=await Promise.all([
          db.getCategories(DEFAULT_CATEGORIES),
          db.getHiddenSections(),
          db.getTransactions(),
          db.getIngresos(),
          db.getUSDMovements(),
          db.getEntities(),
          db.getEntityMovements(),
          db.getProjects(),
          db.getProjectMovements(),
        ])
        setCategories(cats||DEFAULT_CATEGORIES)
        setHiddenSections(hidden||[])
        setTransactions(txs||[])
        setIngresos(ings||[])
        setUSDMov(usd||[])
        setEntities(ents||[])
        setEntityMov(entMovs||[])
        setProjects(projs||[])
        setProjectMov(projMovs||[])

        // ── Carryover: si el mes actual no tiene "Saldo mes anterior",
        // calcular el balance del mes previo y ofrecer arrastarlo.
        const now=new Date()
        const curM=now.getMonth(), curY=now.getFullYear()
        const alreadyAdded=(ings||[]).some(i=>{
          const d=new Date(i.date+'T12:00:00')
          return d.getMonth()===curM&&d.getFullYear()===curY&&i.description==='Saldo mes anterior'
        })
        if(!alreadyAdded){
          const prevM=curM===0?11:curM-1, prevY=curM===0?curY-1:curY
          const prevTxs=(txs||[]).filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===prevM&&d.getFullYear()===prevY})
          const prevIngs=(ings||[]).filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===prevM&&d.getFullYear()===prevY})
          const bal=prevIngs.reduce((s,t)=>s+(t.amount||0),0)-prevTxs.reduce((s,t)=>s+(t.amount||0),0)
          if(bal>0) setCarryover(bal)
        }
      } catch(e) {
        console.error('Error loading data:', e)
      } finally {
        setReady(true)
      }
    })()
  },[])

  const applyCarryover=async()=>{
    if(!carryover) return
    const now=new Date()
    const dateStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
    const ing={date:dateStr,amount:carryover,description:'Saldo mes anterior'}
    const saved=await db.insertIngreso(ing)
    setIngresos(p=>[...p,saved||ing])
    setCarryover(false)
  }

  if (!ready) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0f0f0f',color:'#444',fontFamily:'Georgia,serif',fontSize:'0.9rem',letterSpacing:'0.1em'}}>Cargando...</div>
  if (!hasGeminiKey()) return <SetupScreen onDone={()=>window.location.reload()} />

  const isHidden = s => hiddenSections.includes(s)
  const activeEntities = entities.filter(e=>e.status!=='cerrado')
  const activeProjects = projects.filter(p=>p.status!=='cerrado')
  const p={
    transactions,setTransactions,ingresos,setIngresos,usdMovements,setUSDMov,
    entities,setEntities,entityMovements,setEntityMov,activeEntities,
    projects,setProjects,projectMovements,setProjectMov,activeProjects,
    categories,setCategories,hiddenSections,setHiddenSections,
    selectedMonth,setSelectedMonth,isHidden,
  }

  return (
    <div style={{minHeight:'100vh',background:'#0f0f0f',color:'#e8dcc8',fontFamily:'Georgia,serif',paddingBottom:'72px'}}>
      {carryover&&carryover!==false&&(
        <div style={{position:'sticky',top:0,zIndex:200,background:'#1a1f1a',borderBottom:'1px solid #2e4a2e',padding:'10px 16px',display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
          <span style={{flex:1,fontSize:'0.82rem',color:'#9ec89e'}}>
            📅 El mes anterior cerró con <strong>{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(carryover)}</strong> a favor. ¿Lo arrastro como saldo inicial de este mes?
          </span>
          <button onClick={applyCarryover} style={{background:'#2e5e2e',color:'#9ec89e',border:'1px solid #3a7a3a',padding:'6px 14px',borderRadius:'6px',cursor:'pointer',fontSize:'0.78rem',fontWeight:'bold',whiteSpace:'nowrap'}}>Sí, agregar</button>
          <button onClick={()=>setCarryover(false)} style={{background:'none',color:'#555',border:'1px solid #2a2a2a',padding:'6px 12px',borderRadius:'6px',cursor:'pointer',fontSize:'0.78rem',whiteSpace:'nowrap'}}>Descartar</button>
        </div>
      )}
      {view==='home'     && <HomeView      {...p} setView={setView}/>}
      {view==='chat'     && <ChatView      {...p}/>}
      {view==='monthly'  && <MonthlyView   {...p}/>}
      {view==='usd'      && <USDView       {...p}/>}
      {view==='entities' && !isHidden('entities') && <EntitiesView {...p}/>}
      {view==='entities' &&  isHidden('entities') && <HiddenSection name="Deudores/Acreedores" onBack={()=>setView('home')}/>}
      {view==='projects' && !isHidden('projects') && <ProjectsView {...p}/>}
      {view==='projects' &&  isHidden('projects') && <HiddenSection name="Proyectos" onBack={()=>setView('home')}/>}
      {view==='new'      && <NewConceptView {...p} setView={setView}/>}
      {view==='settings' && <SettingsView  {...p}/>}
      <BottomNav view={view} setView={setView} isHidden={isHidden}/>
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

function BottomNav({view,setView,isHidden}){
  const items=[
    {id:'home',icon:'⌂',label:'Inicio'},
    {id:'chat',icon:'✦',label:'Registrar'},
    {id:'monthly',icon:'◈',label:'Mes'},
    {id:'usd',icon:'$',label:'USD'},
    {id:'entities',icon:'♡',label:'Deudores',opt:true},
    {id:'projects',icon:'⚒',label:'Proyectos',opt:true},
    {id:'new',icon:'+',label:'Nuevo'},
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

// ── HOME ─────────────────────────────────────────────────────────────
function HomeView({transactions,ingresos,usdMovements,activeEntities,entityMovements,selectedMonth,setSelectedMonth,setView,isHidden}){
  const {month,year}=selectedMonth
  const mTxs=transactions.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year})
  const mIngs=ingresos.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year})
  const totalG=mTxs.reduce((s,t)=>s+(t.amount||0),0)
  const totalI=mIngs.reduce((s,t)=>s+(t.amount||0),0)
  const bal=totalI-totalG
  const usdTot=usdMovements.reduce((s,m)=>s+(m.usd100||0)+(m.usd_cambio||0),0)

  // Diferencia neta entre lo que te deben y lo que debés, por moneda.
  // entityNetEffect() ya devuelve el saldo de cada entidad en términos de
  // "a tu favor / en contra", así que sumar directamente da el neto correcto.
  const netByCurrency = activeEntities.reduce((acc,e)=>{
    const b = db.entityNetEffect(e, entityMovements)
    acc.ARS += b.ARS; acc.USD += b.USD
    return acc
  },{ARS:0,USD:0})

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
      <div style={{display:'grid',gridTemplateColumns:isHidden('entities')?'1fr':'1fr 1fr',gap:'12px',marginBottom:'22px'}}>
        <div style={S.card}>
          <div style={S.label}>Dólares en caja</div>
          <div style={{fontSize:'1.2rem',color:'#c8a96e',marginTop:'6px'}}>{fmtUsd(usdTot)}</div>
        </div>
        {!isHidden('entities')&&(
          <div style={S.card}>
            <div style={S.label}>Diferencia deudores/acreedores</div>
            {netByCurrency.ARS===0&&netByCurrency.USD===0&&<div style={{fontSize:'0.95rem',color:'#555',marginTop:'6px'}}>Sin saldos</div>}
            {netByCurrency.ARS!==0&&<div style={{fontSize:'1rem',color:netByCurrency.ARS>0?'#6e9e6e':'#c87070',marginTop:'6px'}}>{fmt(Math.abs(netByCurrency.ARS))} {netByCurrency.ARS>0?'a favor':'en contra'}</div>}
            {netByCurrency.USD!==0&&<div style={{fontSize:'1rem',color:netByCurrency.USD>0?'#6e9e6e':'#c87070',marginTop:'4px'}}>{fmtUsd(Math.abs(netByCurrency.USD))} {netByCurrency.USD>0?'a favor':'en contra'}</div>}
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
function ChatView({categories,activeEntities,activeProjects,setTransactions,setIngresos,setUSDMov,setEntities,setEntityMov,setProjects,setProjectMov}){
  const [input,setInput]=useState('')
  const [messages,setMessages]=useState([{role:'assistant',text:'Hola! Escribí los gastos como en el WhatsApp:\n\n• $14.000 pizza\n• $10.000 salud corte bri  ← categoría + detalle\n• Cambio a 1410 -usd 400 +$564.000\n• + $2.272.400 cancelación sueldo\n• marina + usd 1000  ← cobraste, resta deuda de Marina y suma a tu caja USD\n• le presté 50.000 a dani  ← sale de tu bolsillo\n• $150.000 obra flete  ← gasto de proyecto en pesos, pide cotización\n• obra 500 usd plomero  ← gasto de proyecto en dólares directo, sin cotización\n• ajuste -$3.500  ← ajuste de cierre de caja\n\nPodés pegar varias líneas o subir un PDF con 📄'}])
  const [loading,setLoading]=useState(false)
  const [pending,setPending]=useState([])
  // waitingFor: null | 'confirm' | 'entity_type' | 'project_choice' | 'project_category' | 'project_cotiz'
  const [waitingFor,setWaitingFor]=useState(null)
  const [pdfItems,setPdfItems]=useState(null)  // null = sin PDF abierto; array = panel de revisión activo
  const [pdfObraCotiz,setPdfObraCotiz]=useState('')  // cotización para items Obra del PDF
  const [pdfObraProject,setPdfObraProject]=useState(null)  // proyecto al que asignar los items Obra
  const [lastImportIds,setLastImportIds]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('last_pdf_import')||'[]')}catch{return[]}
  })
  const todayStr=new Date().toISOString().split('T')[0]
  const bottomRef=useRef(),fileRef=useRef()
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages])
  const addMsg=(role,text,extra={})=>setMessages(p=>[...p,{role,text,...extra}])

  // Refs para las colas de resolución multi-paso
  const entityQueueRef=useRef([])       // nombres nuevos de entidades por resolver (tipo deudor/acreedor)
  const newEntityTypesRef=useRef({})    // name -> 'deudor'|'acreedor' ya resuelto en este envío
  const projectQueueRef=useRef([])      // índices en "pending" de items project_gasto por resolver
  const projectQueueIdxRef=useRef(0)
  const pendingRef=useRef([])           // copia mutable de pending mientras se resuelve

  const finalizeAndSave=async()=>{
    await guardar(pendingRef.current)
  }

  const guardar=async(parsed)=>{
    const dateStr=new Date().toISOString().split('T')[0]
    const gastos=[],usds=[],ings=[],entMovs=[],projMovs=[]
    for(const t of parsed){
      if(t.type==='gasto'){
        // Los gastos parseados de un PDF (resumen de tarjeta) traen su propia
        // fecha real — solo usamos "hoy" como default para los del chat, que no la traen.
        const gDate=t.date||dateStr
        if(t.currency==='USD'){
          // Consumo en dólares de la tarjeta (ej: Netflix, Spotify) -> sale de la caja USD,
          // no se mezcla con gastos en pesos.
          usds.push({date:gDate,usd100:-Math.abs(t.amount||0),usd_cambio:0,description:t.description||'',exchange_rate:null,peso_amount:null})
        } else {
          gastos.push({date:gDate,amount:t.amount||0,category:t.category,description:t.description||''})
        }
      }
      else if(t.type==='ingreso'){
        ings.push({date:dateStr,amount:t.amount||0,description:t.description||''})
      }
      else if(t.type==='usd'){
        const usdId=crypto.randomUUID()
        let pesoLink=null, pesoTable=null
        if(t.peso_amount){
          pesoLink=crypto.randomUUID()
          if(t.peso_amount>0){ ings.push({id:pesoLink,date:dateStr,amount:t.peso_amount,description:`Cambio ${Math.abs(t.usd_amount||0)} USD @ $${t.exchange_rate||'—'}`,linked_table:'usd_movements',linked_id:usdId}); pesoTable='ingresos' }
          else { gastos.push({id:pesoLink,date:dateStr,amount:Math.abs(t.peso_amount),category:'Cambio USD',description:t.description||'Cambio USD',linked_table:'usd_movements',linked_id:usdId}); pesoTable='transactions' }
        }
        usds.push({id:usdId,date:dateStr,usd100:t.usd_amount||0,usd_cambio:0,description:t.description||'Cambio',exchange_rate:t.exchange_rate||null,peso_amount:t.peso_amount||null,linked_table:pesoTable,linked_id:pesoLink})
      }
      else if(t.type==='entity_movement'){
        let entity=matchByName(activeEntities,t.entity_name)
        if(!entity && newEntityTypesRef.current[t.entity_name]){
          entity=await db.saveEntity({name:t.entity_name,type:newEntityTypesRef.current[t.entity_name]})
          setEntities(p=>[...p,entity])
        }
        if(!entity) continue // por seguridad, si no se pudo resolver no se guarda huérfano
        const amt=t.amount||0
        const label=`${entity.name}${t.description?': '+t.description:''}`
        const entId=crypto.randomUUID(), cashId=crypto.randomUUID()
        // El flujo de caja real de la entidad también tiene que reflejarse en tu caja:
        // USD -> caja de dólares; ARS -> ingreso (cobraste) o gasto (prestaste) en la caja de pesos.
        // Quedan vinculados (linked_table/linked_id) para poder borrarse juntos.
        let cashTable=null
        if((t.currency||'ARS')==='USD'){
          usds.push({id:cashId,date:dateStr,usd100:amt,usd_cambio:0,description:label,exchange_rate:null,peso_amount:null,linked_table:'entity_movements',linked_id:entId})
          cashTable='usd_movements'
        } else if(amt>0){
          ings.push({id:cashId,date:dateStr,amount:amt,description:label,linked_table:'entity_movements',linked_id:entId})
          cashTable='ingresos'
        } else if(amt<0){
          gastos.push({id:cashId,date:dateStr,amount:Math.abs(amt),category:'Préstamos/Entidades',description:label,linked_table:'entity_movements',linked_id:entId})
          cashTable='transactions'
        }
        entMovs.push({id:entId,entity_id:entity.id,date:dateStr,amount:amt,currency:t.currency||'ARS',description:t.description||'',linked_table:cashTable,linked_id:cashTable?cashId:null})
      }
      else if(t.type==='project_gasto'){
        const project=matchByName(activeProjects,t.project_name)
        if(!project) continue
        const monto=t.amount||0
        if((t.currency||'ARS')==='USD'){
          // Pago directo en dólares: no pasa por la caja de pesos, sale de la caja USD.
          const projId=crypto.randomUUID(), cashId=crypto.randomUUID()
          projMovs.push({id:projId,project_id:project.id,date:dateStr,category:t.category||'Otro',description:t.description||'',amount:monto,currency:'USD',exchange_rate:null,linked_table:'usd_movements',linked_id:cashId})
          usds.push({id:cashId,date:dateStr,usd100:-Math.abs(monto),usd_cambio:0,description:`${project.name}: ${t.description||'gasto'}`,exchange_rate:null,peso_amount:null,linked_table:'project_movements',linked_id:projId})
        } else {
          const rate=t.exchange_rate||1
          gastos.push({date:dateStr,amount:monto,category:'Obra',description:t.description||''})
          projMovs.push({project_id:project.id,date:dateStr,category:t.category||'Otro',description:t.description||'',amount:parseFloat((monto/rate).toFixed(2)),currency:'USD',exchange_rate:rate})
        }
      }
    }
    let savedTxIds=[],savedUsdIds=[]
    if(gastos.length){const saved=await db.insertTransactions(gastos);const arr=saved||gastos;savedTxIds=arr.map(t=>t.id).filter(Boolean);setTransactions(p=>[...p,...arr])}
    for(const u of usds){const s=await db.insertUSD(u);if(s?.id)savedUsdIds.push(s.id);setUSDMov(p=>[...p,s||u])}
    for(const i of ings){const s=await db.insertIngreso(i);setIngresos(p=>[...p,s||i])}
    for(const m of entMovs){const s=await db.insertEntityMovement(m);setEntityMov(p=>[...p,s||m])}
    for(const m of projMovs){const s=await db.insertProjectMovement(m);setProjectMov(p=>[...p,s||m])}

    setPending([]);setWaitingFor(null)
    entityQueueRef.current=[];newEntityTypesRef.current={};projectQueueRef.current=[];projectQueueIdxRef.current=0;pendingRef.current=[]
    addMsg('assistant','✓ Guardado correctamente.')
    return {txIds:savedTxIds,usdIds:savedUsdIds}
  }

  const summarize=(parsed)=>parsed.map(t=>{
    if(t.type==='usd')return `💱 Cambio: ${t.usd_amount>0?'+':''}${t.usd_amount} USD @ $${t.exchange_rate} → ${fmt(t.peso_amount)}`
    if(t.type==='ingreso')return `💰 Ingreso: ${fmt(t.amount)} — ${t.description}`
    if(t.type==='entity_movement')return `${t.amount>=0?'💵':'➖'} ${t.entity_name}: ${t.amount>=0?'+':''}${t.amount} ${t.currency}${t.description?' — '+t.description:''}`
    if(t.type==='project_gasto')return `⚒ ${t.project_name||'Proyecto'}${t.currency==='USD'?' (USD directo)':' (pesos→USD)'}: ${t.currency==='USD'?fmtUsd(t.amount):fmt(t.amount)} — ${t.description}${t.category?' ['+t.category+']':''}`
    return `📌 ${t.category}: ${fmt(t.amount)}${t.description?' — '+t.description:''}`
  }).join('\n')

  // Arranca la cadena de resolución: primero entidades nuevas, después proyectos pendientes.
  const startResolution=(parsed)=>{
    pendingRef.current=parsed
    const newNames=[...new Set(parsed.filter(t=>t.type==='entity_movement'&&t.is_new).map(t=>t.entity_name))]
    entityQueueRef.current=newNames
    projectQueueRef.current=parsed.map((t,i)=>t.type==='project_gasto'?i:null).filter(i=>i!==null)
    projectQueueIdxRef.current=0
    askNextInQueue()
  }

  const askNextInQueue=()=>{
    if(entityQueueRef.current.length){
      const name=entityQueueRef.current[0]
      addMsg('assistant',`"${name}" no está en tu lista de deudores/acreedores. ¿Es deudor (te debe a vos) o acreedor (vos le debés)?`)
      setWaitingFor('entity_type')
      return
    }
    if(projectQueueIdxRef.current<projectQueueRef.current.length){
      askProjectStep()
      return
    }
    finishResolution()
  }

  const askProjectStep=()=>{
    const idx=projectQueueRef.current[projectQueueIdxRef.current]
    const item=pendingRef.current[idx]
    if(!item.project_name){
      addMsg('assistant',`¿A qué proyecto pertenece "${item.description||'ese gasto'}"? (${activeProjects.map(p=>p.name).join(', ')})`)
      setWaitingFor('project_choice')
      return
    }
    const project=matchByName(activeProjects,item.project_name)
    const cats=project?.categories||DEFAULT_PROJECT_CATS
    if(!item.category){
      addMsg('assistant',`Gasto de "${project?.name||item.project_name}" (${item.currency==='USD'?fmtUsd(item.amount):fmt(item.amount)})\n¿A qué categoría pertenece?\n${cats.join(', ')}`)
      setWaitingFor('project_category')
      return
    }
    if((item.currency||'ARS')==='USD'){
      // Pago directo en dólares: no hace falta cotización, ya está resuelto.
      projectQueueIdxRef.current+=1
      askNextInQueue()
      return
    }
    addMsg('assistant',`${project?.name||item.project_name} → ${item.category} (${fmt(item.amount)})\n¿A qué cotización dólar lo registro?`)
    setWaitingFor('project_cotiz')
  }

  const finishResolution=()=>{
    addMsg('assistant',`Entendí ${pendingRef.current.length} movimiento${pendingRef.current.length>1?'s':''}:\n\n${summarize(pendingRef.current)}\n\n¿Lo guardo?`,{txs:pendingRef.current})
    setWaitingFor('confirm')
  }

  const handleSend=async()=>{
    if(!input.trim()||loading)return
    const text=input.trim()

    if(waitingFor==='entity_type'){
      setInput('');addMsg('user',text)
      const t=text.toLowerCase()
      const type=t.includes('acreed')?'acreedor':t.includes('deud')?'deudor':null
      if(!type){addMsg('assistant','Respondé "deudor" o "acreedor".');return}
      const name=entityQueueRef.current[0]
      newEntityTypesRef.current[name]=type
      entityQueueRef.current=entityQueueRef.current.slice(1)
      addMsg('assistant',`Listo, "${name}" queda como ${type}.`)
      askNextInQueue()
      return
    }

    if(waitingFor==='project_choice'){
      setInput('');addMsg('user',text)
      const idx=projectQueueRef.current[projectQueueIdxRef.current]
      const matched=matchByName(activeProjects,text)
      if(!matched){addMsg('assistant',`No encontré ese proyecto. Opciones: ${activeProjects.map(p=>p.name).join(', ')}`);return}
      pendingRef.current[idx]={...pendingRef.current[idx],project_name:matched.name}
      askProjectStep()
      return
    }

    if(waitingFor==='project_category'){
      setInput('');addMsg('user',text)
      const idx=projectQueueRef.current[projectQueueIdxRef.current]
      const item=pendingRef.current[idx]
      const project=matchByName(activeProjects,item.project_name)
      const cats=project?.categories||DEFAULT_PROJECT_CATS
      const matched=cats.find(c=>c.toLowerCase()===text.toLowerCase())||cats.find(c=>c.toLowerCase().includes(text.toLowerCase()))||text
      pendingRef.current[idx]={...item,category:matched}
      askProjectStep()
      return
    }

    if(waitingFor==='project_cotiz'){
      setInput('')
      const val=parseFloat(text.replace(',','.'))
      if(!val||val<100){addMsg('assistant','Ingresá una cotización válida, ej: 1400');return}
      addMsg('user',text)
      const idx=projectQueueRef.current[projectQueueIdxRef.current]
      pendingRef.current[idx]={...pendingRef.current[idx],exchange_rate:val}
      projectQueueIdxRef.current+=1
      askNextInQueue()
      return
    }

    setInput('');setLoading(true);addMsg('user',text)
    try{
      const parsed=await parseChat(text,categories,activeEntities,activeProjects)
      if(!parsed.length){addMsg('assistant','No pude interpretar ese texto. Intentá de nuevo.');setLoading(false);return}
      startResolution(parsed)
    }catch(e){
      addMsg('assistant',e.message==='NO_API_KEY'?'⚠️ Falta la API key de Gemini.':`Error: ${e.message}`)
    }
    setLoading(false)
  }

  const handleConfirm=async()=>{
    await finalizeAndSave()
  }

  // ── PDF: nuevo flujo con panel de revisión completo ─────────────────
  const handlePDF=async(e)=>{
    const file=e.target.files?.[0];if(!file)return
    setLoading(true);addMsg('user',`📄 ${file.name}`)
    try{
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})
      const parsed=await parsePDF(base64,categories)
      if(!parsed.length){addMsg('assistant','No encontré consumos en el PDF.');setLoading(false);e.target.value='';return}
      // Inicializamos los items con fecha = HOY (no la del resumen).
      // Se guarda la fecha original solo como referencia visual.
      // Pre-asignar el proyecto para items de Obra (si hay al menos uno activo, tomamos el primero)
      const defaultProject=activeProjects[0]||null
      const defaultProjCats=defaultProject?.categories||DEFAULT_PROJECT_CATS
      const items=parsed.map((t,i)=>({
        ...t,
        _key:i,
        _sel:true,                // seleccionado por defecto
        _date:todayStr,           // FECHA DEL DÍA DE CARGA, no la del resumen
        _cat:t.category||'Otros', // categoría editable
        _origDate:t.date||'',     // para referencia visual
        _projCat:(t.category||'')==='Obra'?defaultProjCats[0]:undefined, // categoría dentro del proyecto (solo Obra)
      }))
      setPdfItems(items)
      if(defaultProject) setPdfObraProject(defaultProject)
      addMsg('assistant',`Encontré ${parsed.length} consumos de ${file.name}. Revisalos en el panel de abajo — la fecha ya quedó asignada a hoy. Cambiá categorías o fechas si necesitás y luego guardá.`)
    }catch(err){addMsg('assistant',`Error al leer el PDF: ${err.message}`)}
    setLoading(false);e.target.value=''
  }

  const savePDF=async()=>{
    if(!pdfItems)return
    const selected=pdfItems.filter(t=>t._sel)
    if(!selected.length){addMsg('assistant','No hay items seleccionados.');return}
    setLoading(true)
    const pesoItems=selected.filter(t=>t.currency!=='USD'||!t.currency)
    const usdItems=selected.filter(t=>t.currency==='USD')
    const cotiz=parseFloat((pdfObraCotiz||'').replace(',','.'))
    const obraItems=pesoItems.filter(t=>(t._cat||'Otros')==='Obra')
    const toInsert=pesoItems.map(t=>({
      date:t._date,
      amount:Math.abs(t.amount||0),
      category:t._cat||'Otros',
      description:`${t.description||''}${t.installment?' ('+t.installment+')':''}`.trim(),
    }))
    const saved=toInsert.length?await db.insertTransactions(toInsert):[]
    if(saved?.length) setTransactions(p=>[...p,...saved])
    for(const t of usdItems){
      const u=await db.insertUSD({date:t._date,usd100:-Math.abs(t.amount||0),usd_cambio:0,description:t.description||''})
      setUSDMov(p=>[...p,u])
    }
    // Si hay items de Obra con cotización → crear también los project_movements en USD
    if(obraItems.length&&cotiz>0&&pdfObraProject){
      const projCatsForSave=pdfObraProject?.categories||DEFAULT_PROJECT_CATS
      for(const t of obraItems){
        const monto=Math.abs(t.amount||0)
        const mv={
          project_id:pdfObraProject.id,
          date:t._date,
          category:t._projCat||projCatsForSave[0],
          description:`${t.description||''}${t.installment?' ('+t.installment+')':''}`.trim(),
          amount:parseFloat((monto/cotiz).toFixed(2)),
          currency:'USD',
          exchange_rate:cotiz,
        }
        const s=await db.insertProjectMovement(mv)
        setProjectMov(p=>[...p,s||mv])
      }
    }
    const ids=(saved||[]).map(t=>t.id).filter(Boolean)
    localStorage.setItem('last_pdf_import',JSON.stringify(ids))
    setLastImportIds(ids)
    setLoading(false);setPdfItems(null);setPdfObraCotiz('')
    const obraMsg=obraItems.length&&cotiz>0?` (${obraItems.length} items de Obra registrados en ${pdfObraProject?.name||'proyecto'} @ $${cotiz})`
      :obraItems.length&&!cotiz?' ⚠️ Nota: había items de Obra pero no pusiste cotización, así que NO se registraron los costos en USD en el proyecto. Podés agregarlos manualmente desde Proyectos.':''
    addMsg('assistant',`✓ Se guardaron ${selected.length} consumos.${obraMsg}\nSi necesitás deshacer esta importación, tocá el botón "↩ Deshacer PDF".`)
  }

  const undoLastImport=async()=>{
    if(!lastImportIds.length)return
    if(!window.confirm(`¿Borrar los ${lastImportIds.length} registros de la última importación PDF? Esta acción no se puede deshacer.`))return
    for(const id of lastImportIds) await db.deleteTransaction(id)
    setTransactions(p=>p.filter(t=>!lastImportIds.includes(t.id)))
    localStorage.removeItem('last_pdf_import')
    setLastImportIds([])
    addMsg('assistant',`✓ Se borraron ${lastImportIds.length} registros de la última importación PDF.`)
  }

  const isPDFMode=waitingFor==='confirm'&&messages.some(m=>m.isPDF)

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 72px)'}}>
      <div style={{padding:'10px 20px',borderBottom:'1px solid #1a1a1a',display:'flex',alignItems:'center',gap:'8px'}}>
        <div style={{...S.label,flex:1}}>Registrar movimientos</div>
        {lastImportIds.length>0&&(
          <button onClick={undoLastImport} style={{...S.btnGray,padding:'5px 10px',fontSize:'0.68rem',color:'#c87070',borderColor:'#3a1e1e'}}>
            ↩ Deshacer PDF ({lastImportIds.length})
          </button>
        )}
      </div>

      {/* PANEL DE REVISIÓN PDF */}
      {pdfItems&&(
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {/* Controles globales */}
          <div style={{padding:'10px 14px',borderBottom:'1px solid #1a1a1a',display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center',background:'#141414'}}>
            <label style={{fontSize:'0.72rem',color:'#888'}}>
              <input type="checkbox" checked={pdfItems.every(t=>t._sel)}
                onChange={e=>setPdfItems(p=>p.map(t=>({...t,_sel:e.target.checked})))} style={{marginRight:'5px'}}/>
              Todos ({pdfItems.filter(t=>t._sel).length}/{pdfItems.length})
            </label>
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginLeft:'auto'}}>
              <span style={{fontSize:'0.72rem',color:'#888'}}>Fecha para todos:</span>
              <input type="date" value={pdfItems.find(t=>t._sel)?._date||todayStr}
                onChange={e=>setPdfItems(p=>p.map(t=>t._sel?{...t,_date:e.target.value}:t))}
                style={{...S.input,padding:'4px 8px',fontSize:'0.78rem',width:'130px'}}/>
            </div>
          </div>
          {/* Lista de items */}
          {(()=>{
            const projCatsForPdf=pdfObraProject?.categories||DEFAULT_PROJECT_CATS
            return (
          <div style={{flex:1,overflowY:'auto',padding:'8px 10px',display:'flex',flexDirection:'column',gap:'4px'}}>
            {pdfItems.map((t,i)=>(
              <div key={t._key} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 10px',background:t._sel?'#1a1a1a':'#111',borderRadius:'6px',border:'1px solid #222',opacity:t._sel?1:0.45}}>
                <input type="checkbox" checked={t._sel} onChange={e=>setPdfItems(p=>p.map((x,j)=>j===i?{...x,_sel:e.target.checked}:x))} style={{flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'0.8rem',color:'#ddd',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {t.description}{t.installment?<span style={{color:'#666',fontSize:'0.72rem'}}> ({t.installment})</span>:''}
                  </div>
                  <div style={{fontSize:'0.7rem',color:'#666',marginTop:'1px'}}>
                    orig: {t._origDate}
                  </div>
                </div>
                <div style={{fontSize:'0.82rem',color:t.currency==='USD'?'#c8a96e':'#c87070',flexShrink:0,minWidth:'70px',textAlign:'right'}}>
                  {t.currency==='USD'?fmtUsd(t.amount):fmt(t.amount)}
                </div>
                <select value={t._cat} onChange={e=>setPdfItems(p=>p.map((x,j)=>j===i?{...x,_cat:e.target.value,_projCat:e.target.value==='Obra'?(x._projCat||projCatsForPdf[0]):x._projCat}:x))}
                  style={{...S.input,padding:'3px 6px',fontSize:'0.72rem',width:'110px',background:'#111'}}>
                  {categories.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                {t._cat==='Obra'&&(
                  <select value={t._projCat||projCatsForPdf[0]} onChange={e=>setPdfItems(p=>p.map((x,j)=>j===i?{...x,_projCat:e.target.value}:x))}
                    title="Categoría dentro del proyecto"
                    style={{...S.input,padding:'3px 6px',fontSize:'0.72rem',width:'130px',background:'#111',borderColor:'#2a3a2a'}}>
                    {projCatsForPdf.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <input type="date" value={t._date} onChange={e=>setPdfItems(p=>p.map((x,j)=>j===i?{...x,_date:e.target.value}:x))}
                  style={{...S.input,padding:'3px 6px',fontSize:'0.72rem',width:'120px'}}/>
              </div>
            ))}
          </div>
            )
          })()}
          {/* Footer del panel */}
          {(()=>{
            const obraSelected=pdfItems.filter(t=>t._sel&&(t._cat||'Otros')==='Obra')
            return obraSelected.length>0?(
              <div style={{padding:'8px 14px',borderTop:'1px solid #1a1a1a',background:'#141f14',flexShrink:0}}>
                <div style={{fontSize:'0.72rem',color:'#9ec89e',marginBottom:'6px'}}>
                  ⚒ {obraSelected.length} item{obraSelected.length>1?'s':''} categorizados como <strong>Obra</strong> — para registrar también el costo en USD en el proyecto, ingresá la cotización:
                </div>
                <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                  {activeProjects.length>1&&(
                    <select value={pdfObraProject?.id||''} onChange={e=>{
                        const newProj=activeProjects.find(p=>p.id===e.target.value)||null
                        const newCats=newProj?.categories||DEFAULT_PROJECT_CATS
                        setPdfObraProject(newProj)
                        setPdfItems(p=>p.map(x=>x._cat==='Obra'?{...x,_projCat:newCats[0]}:x))
                      }}
                      style={{...S.input,padding:'5px 9px',fontSize:'0.78rem',width:'140px',background:'#111'}}>
                      {activeProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  {activeProjects.length===1&&(
                    <span style={{fontSize:'0.78rem',color:'#6e9e6e',padding:'5px 0'}}>→ {activeProjects[0].name}</span>
                  )}
                  <input type="number" placeholder="Cotización $ (ej: 1460)" value={pdfObraCotiz}
                    onChange={e=>setPdfObraCotiz(e.target.value)}
                    style={{...S.input,padding:'5px 9px',fontSize:'0.78rem',width:'180px'}}/>
                  {!pdfObraCotiz&&<span style={{fontSize:'0.7rem',color:'#555'}}>(opcional — dejá vacío para no registrar en proyecto)</span>}
                </div>
              </div>
            ):null
          })()}
          <div style={{padding:'10px 14px',borderTop:'1px solid #1a1a1a',display:'flex',gap:'8px'}}>
            <button onClick={savePDF} disabled={loading||!pdfItems.some(t=>t._sel)}
              style={{...S.btnGold,flex:1,opacity:(!pdfItems.some(t=>t._sel)||loading)?0.4:1}}>
              ✓ Guardar seleccionados ({pdfItems.filter(t=>t._sel).length})
            </button>
            <button onClick={()=>setPdfItems(null)} style={{...S.btnGray}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* CHAT NORMAL */}
      {!pdfItems&&(<>
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:'12px'}}>
          {messages.map((m,i)=>(
            <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.role==='user'?'flex-end':'flex-start'}}>
              <div style={{maxWidth:'88%',padding:'10px 14px',borderRadius:'12px',fontSize:'0.88rem',lineHeight:1.55,whiteSpace:'pre-wrap',
                background:m.role==='user'?'#1e1a10':'#1a1a1a',
                border:m.role==='user'?'1px solid #3a3020':'1px solid #222',
                color:m.role==='user'?'#c8a96e':'#e8dcc8'}}>{m.text}</div>
              {m.txs&&m.role==='assistant'&&(
                <button onClick={handleConfirm} style={{...S.btnGold,marginTop:'8px'}}>✓ Confirmar y guardar</button>
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
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()}}}
            placeholder={
              waitingFor==='entity_type'?'deudor o acreedor...':
              waitingFor==='project_choice'?'Nombre del proyecto...':
              waitingFor==='project_category'?'Categoría del proyecto...':
              waitingFor==='project_cotiz'?'Cotización dólar blue (ej: 1400)...':
              '$14.000 pizza  o pegá varias líneas...'
            }
            rows={1} style={{flex:1,
              background:waitingFor&&waitingFor!=='confirm'?'#1a1810':'#1a1a1a',
              border:`1px solid ${waitingFor&&waitingFor!=='confirm'?'#3a3020':'#222'}`,
              color:'#e8dcc8',padding:'10px 12px',borderRadius:'8px',fontSize:'0.88rem',resize:'none',minHeight:'42px',maxHeight:'120px',fontFamily:'Georgia,serif',outline:'none'}}/>
          <button onClick={handleSend} disabled={loading}
            style={{...S.btnGold,flexShrink:0,opacity:loading?0.4:1,padding:'10px 18px',fontSize:'1.1rem'}}>›</button>
        </div>
      </>)}
    </div>
  )
}

// ── MONTHLY ───────────────────────────────────────────────────────────
function MonthlyView({transactions,setTransactions,ingresos,setIngresos,usdMovements,setUSDMov,setEntityMov,setProjectMov,categories,selectedMonth,setSelectedMonth}){
  const {month,year}=selectedMonth
  const [tab,setTab]=useState('resumen')
  const [showAddIng,setShowAddIng]=useState(false)
  const [newIng,setNewIng]=useState({description:'',amount:''})
  const [editingId,setEditingId]=useState(null)
  const [editVals,setEditVals]=useState({})
  const [selectMode,setSelectMode]=useState(false)
  const [selectedTxs,setSelectedTxs]=useState(new Set())
  const byRecent=(a,b)=>{
    const d=new Date(b.date)-new Date(a.date)
    if(d!==0)return d
    return new Date(b.created_at||0)-new Date(a.created_at||0)
  }
  const mTxs=transactions.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year}).sort(byRecent)
  const mIngs=ingresos.filter(t=>{const d=new Date(t.date+'T12:00:00');return d.getMonth()===month&&d.getFullYear()===year}).sort(byRecent)
  const totalG=mTxs.reduce((s,t)=>s+(t.amount||0),0)
  const totalI=mIngs.reduce((s,t)=>s+(t.amount||0),0)
  const bal=totalI-totalG
  const byCat=categories.reduce((acc,cat)=>{acc[cat]=mTxs.filter(t=>t.category===cat).reduce((s,t)=>s+(t.amount||0),0);return acc},{})
  const delTx=async t=>deleteLinked('transactions',t,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
  const delIng=async i=>deleteLinked('ingresos',i,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
  const startEdit=row=>{setEditingId(row.id);setEditVals({date:row.date,description:row.description||'',category:row.category,amount:row.amount})}
  const cancelEdit=()=>{setEditingId(null);setEditVals({})}
  const saveEditTx=async row=>{
    const fields=row.linked_table?{date:editVals.date,description:editVals.description}:{date:editVals.date,description:editVals.description,category:editVals.category,amount:parseFloat(editVals.amount)||0}
    await updateLinked('transactions',row,fields,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
    cancelEdit()
  }
  const saveEditIng=async row=>{
    const fields=row.linked_table?{date:editVals.date,description:editVals.description}:{date:editVals.date,description:editVals.description,amount:parseFloat(editVals.amount)||0}
    await updateLinked('ingresos',row,fields,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
    cancelEdit()
  }
  const addIng=async()=>{
    if(!newIng.description||!newIng.amount)return
    const d=new Date(year,month,new Date().getDate())
    const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const ing={date:dateStr,description:newIng.description,amount:parseFloat(newIng.amount)}
    const saved=await db.insertIngreso(ing);setIngresos(p=>[...p,saved||ing]);setNewIng({description:'',amount:''});setShowAddIng(false)
  }
  const prev=()=>{const d=new Date(year,month-1);setSelectedMonth({month:d.getMonth(),year:d.getFullYear()})}
  const next=()=>{const d=new Date(year,month+1);setSelectedMonth({month:d.getMonth(),year:d.getFullYear()})}
  const handleExport=()=>exportToExcel({transactions,ingresos,usdMovements,categories,month,year})
  const handleExportPDF=()=>exportToPDF({transactions,ingresos,categories,month,year})

  // ── Selección múltiple para borrado masivo ─────────────────────────
  const toggleSelectMode=()=>{setSelectMode(s=>!s);setSelectedTxs(new Set())}
  const toggleTx=id=>setSelectedTxs(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n})
  const allSelected=mTxs.length>0&&mTxs.every(t=>selectedTxs.has(t.id))
  const toggleAll=()=>setSelectedTxs(allSelected?new Set():new Set(mTxs.map(t=>t.id)))
  const deleteSelected=async()=>{
    if(!window.confirm(`¿Borrar ${selectedTxs.size} gasto${selectedTxs.size!==1?'s':''}?\n\nSi estaban vinculados a la caja USD, el vínculo también se borra.\n\nEsta acción no se puede deshacer.`))return
    for(const t of mTxs.filter(t=>selectedTxs.has(t.id))){
      await deleteLinked('transactions',t,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
    }
    setSelectedTxs(new Set())
  }
  return (
    <div style={{padding:'20px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
        <button onClick={prev} style={S.navBtn}>‹</button>
        <h2 style={{flex:1,textAlign:'center',fontWeight:'normal',fontSize:'1.05rem',margin:0}}>{MONTHS[month]} {year}</h2>
        <button onClick={next} style={S.navBtn}>›</button>
      </div>
      <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
        <button onClick={handleExport} style={{...S.btnGray,flex:1}}>⬇ Excel</button>
        <button onClick={handleExportPDF} style={{...S.btnGray,flex:1}}>⬇ PDF</button>
      </div>
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
        {/* Barra de selección múltiple */}
        <div style={{display:'flex',gap:'8px',marginBottom:'10px',alignItems:'center'}}>
          <button onClick={toggleSelectMode} style={{...S.btnGray,padding:'6px 12px',fontSize:'0.7rem',color:selectMode?'#c8a96e':'#666',borderColor:selectMode?'#c8a96e':'#2a2a2a'}}>
            {selectMode?'✕ Cancelar selección':'☐ Seleccionar'}
          </button>
          {selectMode&&mTxs.length>0&&(<>
            <button onClick={toggleAll} style={{...S.btnGray,padding:'6px 10px',fontSize:'0.7rem'}}>{allSelected?'Ninguno':'Todos'}</button>
            {selectedTxs.size>0&&(
              <button onClick={deleteSelected} style={{...S.btnGray,padding:'6px 12px',fontSize:'0.7rem',color:'#c87070',borderColor:'#3a1e1e',fontWeight:'bold'}}>
                🗑 Borrar {selectedTxs.size}
              </button>
            )}
            <span style={{color:'#555',fontSize:'0.72rem',marginLeft:'auto'}}>{selectedTxs.size}/{mTxs.length} seleccionados</span>
          </>)}
        </div>
        {mTxs.length===0&&<div style={{color:'#444',textAlign:'center',padding:'30px',fontSize:'0.88rem'}}>Sin gastos registrados</div>}
        {mTxs.map((t,i)=>editingId===t.id?(
          <EditForm key={t.id||i}
            note={t.linked_table?'Este gasto está vinculado a otra caja — por ahora solo se puede corregir la fecha y la descripción. Para cambiar el monto o la categoría, borralo (se borra el vínculo entero) y volvé a cargarlo.':null}
            fields={t.linked_table?[
              {key:'date',type:'date',label:'Fecha'},
              {key:'description',label:'Descripción'},
            ]:[
              {key:'date',type:'date',label:'Fecha'},
              {key:'category',type:'select',options:categories},
              {key:'amount',type:'number',label:'Monto'},
              {key:'description',label:'Descripción'},
            ]}
            values={editVals} onChange={(k,v)=>setEditVals({...editVals,[k]:v})}
            onSave={()=>saveEditTx(t)} onCancel={cancelEdit}/>
        ):(
          <div key={t.id||i} onClick={selectMode?()=>toggleTx(t.id):undefined}
            style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:selectMode?'pointer':'default',background:selectedTxs.has(t.id)?'#1e1a10':'#1a1a1a',borderColor:selectedTxs.has(t.id)?'#3a3020':'#222',transition:'background 0.15s'}}>
            {selectMode&&(
              <input type="checkbox" checked={selectedTxs.has(t.id)} onChange={()=>toggleTx(t.id)} onClick={e=>e.stopPropagation()}
                style={{marginRight:'8px',width:'15px',height:'15px',flexShrink:0,accentColor:'#c8a96e',cursor:'pointer'}}/>
            )}
            <div style={{flex:1,minWidth:0,marginRight:'10px'}}>
              <div style={{fontSize:'0.7rem',color:'#555',marginBottom:'2px'}}>{t.category} · {t.date}</div>
              <div style={{fontSize:'0.88rem',color:'#ddd',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.description||'—'}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
              <span style={{color:'#c87070',fontSize:'0.88rem'}}>{fmt(t.amount)}</span>
              {!selectMode&&<button onClick={()=>startEdit(t)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',padding:'4px'}}>✎</button>}
              {!selectMode&&<button onClick={()=>delTx(t)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>}
            </div>
          </div>
        ))}
      </>)}
      {tab==='ingresos'&&(<>
        {mIngs.map((t,i)=>editingId===t.id?(
          <EditForm key={t.id||i}
            note={t.linked_table?'Este ingreso está vinculado a otra caja — por ahora solo se puede corregir la fecha y la descripción. Para cambiar el monto, borralo (se borra el vínculo entero) y volvé a cargarlo.':null}
            fields={t.linked_table?[
              {key:'date',type:'date',label:'Fecha'},
              {key:'description',label:'Descripción'},
            ]:[
              {key:'date',type:'date',label:'Fecha'},
              {key:'description',label:'Descripción'},
              {key:'amount',type:'number',label:'Monto'},
            ]}
            values={editVals} onChange={(k,v)=>setEditVals({...editVals,[k]:v})}
            onSave={()=>saveEditIng(t)} onCancel={cancelEdit}/>
        ):(
          <div key={t.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'0.7rem',color:'#555'}}>{t.date}</div><div style={{fontSize:'0.88rem',color:'#ddd'}}>{t.description}</div></div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{color:'#6e9e6e',fontSize:'0.88rem'}}>{fmt(t.amount)}</span>
              <button onClick={()=>startEdit(t)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',padding:'4px'}}>✎</button>
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
function USDView({usdMovements,setUSDMov,setTransactions,setIngresos,setEntityMov,setProjectMov}){
  const [form,setForm]=useState({date:'',usd100:'',usd_cambio:'',description:'',exchange_rate:''})
  const [show,setShow]=useState(false)
  const [editingId,setEditingId]=useState(null)
  const [editVals,setEditVals]=useState({})
  const usd100Tot=usdMovements.reduce((s,m)=>s+(m.usd100||0),0)
  const usdCambioTot=usdMovements.reduce((s,m)=>s+(m.usd_cambio||0),0)
  const add=async()=>{
    const mv={date:form.date||new Date().toISOString().split('T')[0],usd100:parseFloat(form.usd100)||0,usd_cambio:parseFloat(form.usd_cambio)||0,description:form.description,exchange_rate:parseFloat(form.exchange_rate)||null}
    const saved=await db.insertUSD(mv);setUSDMov(p=>[...p,saved||mv]);setForm({date:'',usd100:'',usd_cambio:'',description:'',exchange_rate:''});setShow(false)
  }
  const del=async m=>deleteLinked('usd_movements',m,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
  const startEdit=m=>{setEditingId(m.id);setEditVals({date:m.date,description:m.description||'',usd100:m.usd100,usd_cambio:m.usd_cambio,exchange_rate:m.exchange_rate})}
  const cancelEdit=()=>{setEditingId(null);setEditVals({})}
  const saveEdit=async m=>{
    const fields=m.linked_table?{date:editVals.date,description:editVals.description}:{date:editVals.date,description:editVals.description,usd100:parseFloat(editVals.usd100)||0,usd_cambio:parseFloat(editVals.usd_cambio)||0,exchange_rate:parseFloat(editVals.exchange_rate)||null}
    await updateLinked('usd_movements',m,fields,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
    cancelEdit()
  }
  return (
    <div style={{padding:'20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'16px'}}>Caja USD</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        {[['Billetes',usd100Tot],['Cambio',usdCambioTot],['Total',usd100Tot+usdCambioTot]].map(([l,v])=>(
          <div key={l} style={S.card}><div style={S.label}>{l}</div><div style={{fontSize:'1rem',color:'#c8a96e',marginTop:'6px'}}>{fmtUsd(v)}</div></div>
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
        {[...usdMovements].reverse().map((m,i)=>editingId===m.id?(
          <EditForm key={m.id||i}
            note={m.linked_table?'Este movimiento está vinculado a otra caja — por ahora solo se puede corregir la fecha y la descripción. Para cambiar el monto, borralo (se borra el vínculo entero) y volvé a cargarlo.':null}
            fields={m.linked_table?[
              {key:'date',type:'date',label:'Fecha'},
              {key:'description',label:'Descripción'},
            ]:[
              {key:'date',type:'date',label:'Fecha'},
              {key:'usd100',type:'number',label:'USD billetes (±)'},
              {key:'usd_cambio',type:'number',label:'USD cambio (±)'},
              {key:'exchange_rate',type:'number',label:'Cotización'},
              {key:'description',label:'Descripción'},
            ]}
            values={editVals} onChange={(k,v)=>setEditVals({...editVals,[k]:v})}
            onSave={()=>saveEdit(m)} onCancel={cancelEdit}/>
        ):(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'0.7rem',color:'#555'}}>{m.date}{m.exchange_rate?` · $${m.exchange_rate}`:''}</div><div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description}</div></div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{textAlign:'right'}}>
                {!!m.usd100&&<div style={{fontSize:'0.8rem',color:m.usd100>0?'#6e9e6e':'#c87070'}}>{m.usd100>0?'+':''}{m.usd100} 💵</div>}
                {!!m.usd_cambio&&<div style={{fontSize:'0.8rem',color:m.usd_cambio>0?'#6e9e6e':'#c87070'}}>{m.usd_cambio>0?'+':''}{m.usd_cambio} 🔄</div>}
              </div>
              <button onClick={()=>startEdit(m)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',padding:'4px'}}>✎</button>
              <button onClick={()=>del(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── DEUDORES / ACREEDORES ───────────────────────────────────────────────
function EntitiesView({entities,setEntities,entityMovements,setEntityMov,setUSDMov,setIngresos,setTransactions,setProjectMov}){
  const [selectedId,setSelectedId]=useState(null)
  const [showNew,setShowNew]=useState(false)
  const [newEnt,setNewEnt]=useState({name:'',type:'deudor'})
  const [form,setForm]=useState({date:'',amount:'',currency:'ARS',description:'',direction:'recibo',link:true})
  const [showForm,setShowForm]=useState(false)
  const [renaming,setRenaming]=useState(false)
  const [newName,setNewName]=useState('')
  const [editingId,setEditingId]=useState(null)
  const [editVals,setEditVals]=useState({})

  const selected=entities.find(e=>e.id===selectedId)

  const createEntity=async()=>{
    if(!newEnt.name.trim())return
    const saved=await db.saveEntity({name:newEnt.name.trim(),type:newEnt.type})
    setEntities(p=>[...p,saved])
    setSelectedId(saved.id);setNewEnt({name:'',type:'deudor'});setShowNew(false)
  }

  const renameEntity=async()=>{
    if(!newName.trim()||!selected)return
    const updated=await db.saveEntity({id:selected.id,name:newName.trim(),type:selected.type})
    setEntities(p=>p.map(x=>x.id===selected.id?{...x,...updated}:x))
    setRenaming(false);setNewName('')
  }

  const addMovement=async()=>{
    if(!selected||!form.amount)return
    const signedAmount=form.direction==='recibo'?Math.abs(parseFloat(form.amount)):-Math.abs(parseFloat(form.amount))
    const dateStr=form.date||new Date().toISOString().split('T')[0]
    const entId=crypto.randomUUID()
    const label=`${selected.name}${form.description?': '+form.description:''}`
    // Si "link" está desmarcado (ej: conteo inicial de un saldo que ya existía
    // de antes), NO se toca la caja — solo queda registrada la deuda.
    let cashTable=null, cashId=null
    if(form.link){
      cashId=crypto.randomUUID()
      // El mismo flujo de caja real que en el chat: esto tiene que aparecer
      // en la caja de USD o en ingresos/gastos de pesos, no solo en la deuda.
      // Quedan vinculados (linked_table/linked_id) para poder borrarse juntos.
      if(form.currency==='USD'){
        const u={id:cashId,date:dateStr,usd100:signedAmount,usd_cambio:0,description:label,linked_table:'entity_movements',linked_id:entId}
        const su=await db.insertUSD(u);setUSDMov(p=>[...p,su||u]);cashTable='usd_movements'
      } else if(signedAmount>0){
        const i={id:cashId,date:dateStr,amount:signedAmount,description:label,linked_table:'entity_movements',linked_id:entId}
        const si=await db.insertIngreso(i);setIngresos(p=>[...p,si||i]);cashTable='ingresos'
      } else if(signedAmount<0){
        const tx={id:cashId,date:dateStr,amount:Math.abs(signedAmount),category:'Préstamos/Entidades',description:label,linked_table:'entity_movements',linked_id:entId}
        const stx=await db.insertTransactions([tx]);setTransactions(p=>[...p,...(stx||[tx])]);cashTable='transactions'
      }
    }
    const mv={id:entId,entity_id:selected.id,date:dateStr,amount:signedAmount,currency:form.currency,description:form.description,linked_table:cashTable,linked_id:cashTable?cashId:null}
    const saved=await db.insertEntityMovement(mv)
    setEntityMov(p=>[...p,saved||mv])
    setForm({date:'',amount:'',currency:'ARS',description:'',direction:'recibo',link:true});setShowForm(false)
  }
  const delMovement=async m=>deleteLinked('entity_movements',m,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
  const startEditMov=m=>{setEditingId(m.id);setEditVals({date:m.date,description:m.description||'',amount:m.amount,currency:m.currency})}
  const cancelEditMov=()=>{setEditingId(null);setEditVals({})}
  const saveEditMov=async m=>{
    const fields=m.linked_table?{date:editVals.date,description:editVals.description}:{date:editVals.date,description:editVals.description,amount:parseFloat(editVals.amount)||0,currency:editVals.currency}
    await updateLinked('entity_movements',m,fields,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
    cancelEditMov()
  }
  const toggleStatus=async e=>{const updated=await db.setEntityStatus(e.id,e.status==='cerrado'?'activo':'cerrado');setEntities(p=>p.map(x=>x.id===e.id?{...x,...updated}:x))}

  if(!selected){
    return (
      <div style={{padding:'20px'}}>
        <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'16px'}}>Deudores / Acreedores</h2>
        {entities.length===0&&<div style={{color:'#555',textAlign:'center',padding:'30px',fontSize:'0.88rem'}}>Todavía no agregaste a nadie.</div>}
        {entities.map(e=>{
          const b=entityBalance(e,entityMovements)
          return (
            <button key={e.id} onClick={()=>setSelectedId(e.id)} style={{...S.card,width:'100%',textAlign:'left',marginBottom:'8px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:e.status==='cerrado'?0.5:1}}>
              <div>
                <div style={{fontSize:'0.92rem',color:'#ddd'}}>{e.name}{e.status==='cerrado'?' (cerrado)':''}</div>
                <div style={{fontSize:'0.68rem',color:'#666',marginTop:'2px',textTransform:'uppercase',letterSpacing:'0.06em'}}>{e.type==='deudor'?'te debe':'le debés'}</div>
              </div>
              <div style={{textAlign:'right'}}>
                {b.ARS!==0&&<div style={{fontSize:'0.85rem',color:'#c8a96e'}}>{fmt(Math.abs(b.ARS))}</div>}
                {b.USD!==0&&<div style={{fontSize:'0.85rem',color:'#c8a96e'}}>{fmtUsd(Math.abs(b.USD))}</div>}
                {b.ARS===0&&b.USD===0&&<div style={{fontSize:'0.8rem',color:'#444'}}>saldado</div>}
              </div>
            </button>
          )
        })}
        {showNew?(
          <div style={{...S.card,marginTop:'10px'}}>
            <input placeholder="Nombre (ej: Marina)" value={newEnt.name} onChange={e=>setNewEnt({...newEnt,name:e.target.value})} style={{...S.input,marginBottom:'8px'}}/>
            <select value={newEnt.type} onChange={e=>setNewEnt({...newEnt,type:e.target.value})} style={{...S.input,background:'#111',marginBottom:'8px'}}>
              <option value="deudor">Deudor (me debe a mí)</option>
              <option value="acreedor">Acreedor (yo le debo)</option>
            </select>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={createEntity} style={{...S.btnGold,flex:1}}>Crear</button>
              <button onClick={()=>setShowNew(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
            </div>
          </div>
        ):(
          <button onClick={()=>setShowNew(true)} style={{...S.btnGray,width:'100%',marginTop:'10px'}}>+ Nuevo deudor/acreedor</button>
        )}
      </div>
    )
  }

  const b=entityBalance(selected,entityMovements)
  const myMovs=entityMovements.filter(m=>m.entity_id===selected.id)
  return (
    <div style={{padding:'20px'}}>
      <button onClick={()=>setSelectedId(null)} style={{...S.btnGray,marginBottom:'14px',padding:'6px 12px',fontSize:'0.7rem'}}>← Todos</button>
      {renaming?(
        <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder={selected.name} style={{...S.input,flex:1}}/>
          <button onClick={renameEntity} style={{...S.btnGold,padding:'10px 14px'}}>✓</button>
          <button onClick={()=>{setRenaming(false);setNewName('')}} style={{...S.btnGray,padding:'10px 14px'}}>✕</button>
        </div>
      ):(
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
          <h2 style={{fontWeight:'normal',fontSize:'1.1rem',margin:0,flex:1}}>{selected.name}</h2>
          <button onClick={()=>{setRenaming(true);setNewName(selected.name)}} style={{background:'none',border:'none',color:'#555',cursor:'pointer',padding:'4px',fontSize:'0.9rem'}}>✎</button>
          <button onClick={()=>toggleStatus(selected)} style={{...S.btnGray,padding:'5px 10px',fontSize:'0.66rem'}}>{selected.status==='cerrado'?'Reactivar':'Cerrar'}</button>
        </div>
      )}
      <div style={{fontSize:'0.68rem',color:'#666',marginBottom:'14px',textTransform:'uppercase',letterSpacing:'0.06em'}}>{selected.type==='deudor'?'Te debe':'Le debés'}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        <MiniCard label="Saldo ARS" value={fmt(Math.abs(b.ARS))} color={b.ARS>=0?'#6e9e6e':'#c87070'}/>
        <MiniCard label="Saldo USD" value={fmtUsd(Math.abs(b.USD))} color={b.USD>=0?'#6e9e6e':'#c87070'}/>
      </div>
      {showForm?(
        <div style={{...S.card,marginBottom:'14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})} style={{...S.input,background:'#111'}}>
              <option value="recibo">Recibo plata</option>
              <option value="entrego">Entrego plata</option>
            </select>
            <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})} style={{...S.input,background:'#111'}}>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </div>
          <input placeholder="Monto" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={{...S.input,marginBottom:'8px'}} type="number"/>
          <input placeholder="Descripción (opcional)" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...S.input,marginBottom:'8px'}}/>
          <label style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px',fontSize:'0.78rem',color:'#999',cursor:'pointer'}}>
            <input type="checkbox" checked={form.link} onChange={e=>setForm({...form,link:e.target.checked})}/>
            Vincular con la caja {form.currency==='USD'?'de dólares':'de pesos'} (desmarcá esto para conteos iniciales / saldos de plata que ya tenías de antes)
          </label>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={addMovement} style={{...S.btnGold,flex:1}}>Guardar</button>
            <button onClick={()=>setShowForm(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setShowForm(true)} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>+ Agregar movimiento</button>
      )}
      <div style={{maxHeight:'42vh',overflowY:'auto'}}>
        {[...myMovs].reverse().map((m,i)=>editingId===m.id?(
          <EditForm key={m.id||i}
            note={m.linked_table?'Este movimiento está vinculado a tu caja — por ahora solo se puede corregir la fecha y la descripción. Para cambiar el monto, borralo (se borra la deuda y el movimiento de caja juntos) y volvé a cargarlo.':null}
            fields={m.linked_table?[
              {key:'date',type:'date',label:'Fecha'},
              {key:'description',label:'Descripción'},
            ]:[
              {key:'date',type:'date',label:'Fecha'},
              {key:'amount',type:'number',label:'Monto (+ = te debe más / − = le debés más)'},
              {key:'currency',type:'select',options:['ARS','USD']},
              {key:'description',label:'Descripción'},
            ]}
            values={editVals} onChange={(k,v)=>setEditVals({...editVals,[k]:v})}
            onSave={()=>saveEditMov(m)} onCancel={cancelEditMov}/>
        ):(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'0.7rem',color:'#555'}}>{m.date}{!m.linked_table?' · sin vincular':''}</div><div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description||'—'}</div></div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'0.88rem',color:m.amount>=0?'#6e9e6e':'#c87070'}}>{m.amount>=0?'+':''}{m.amount.toLocaleString('es-AR')} {m.currency}</span>
              <button onClick={()=>startEditMov(m)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',padding:'4px'}}>✎</button>
              <button onClick={()=>delMovement(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PROYECTOS ────────────────────────────────────────────────────────
function ProjectsView({projects,setProjects,projectMovements,setProjectMov,setUSDMov,setTransactions,setIngresos,setEntityMov}){
  const [selectedId,setSelectedId]=useState(null)
  const [showNew,setShowNew]=useState(false)
  const [newName,setNewName]=useState('')
  const [form,setForm]=useState({date:'',category:'',currency:'USD',amount:'',description:''})
  const [showForm,setShowForm]=useState(false)
  const [newCat,setNewCat]=useState('')
  const [renaming,setRenaming]=useState(false)
  const [renameVal,setRenameVal]=useState('')
  const [editingId,setEditingId]=useState(null)
  const [editVals,setEditVals]=useState({})

  const selected=projects.find(p=>p.id===selectedId)

  const createProject=async()=>{
    if(!newName.trim())return
    const saved=await db.saveProject({name:newName.trim(),categories:DEFAULT_PROJECT_CATS})
    setProjects(p=>[...p,saved])
    setSelectedId(saved.id);setNewName('');setShowNew(false)
  }
  const renameProject=async()=>{
    if(!renameVal.trim()||!selected)return
    const updated=await db.saveProject({...selected,name:renameVal.trim()})
    setProjects(p=>p.map(x=>x.id===selected.id?updated:x))
    setRenaming(false);setRenameVal('')
  }
  const toggleStatus=async pr=>{const updated=await db.setProjectStatus(pr.id,pr.status==='cerrado'?'activo':'cerrado');setProjects(p=>p.map(x=>x.id===pr.id?{...x,...updated}:x))}
  const removeProject=async pr=>{
    if(!window.confirm(`¿Seguro que querés borrar "${pr.name}"?\n\nEsta acción no se puede deshacer y se van a perder todos sus movimientos registrados.`))return
    // Si algún gasto del proyecto era en USD directo, tiene una contraparte en la
    // caja de dólares — hay que borrarla también para no dejar un movimiento huérfano.
    const linkedUsdIds=projectMovements.filter(m=>m.project_id===pr.id&&m.linked_table==='usd_movements').map(m=>m.linked_id)
    for(const id of linkedUsdIds){ await db.deleteRow('usd_movements',id) }
    if(linkedUsdIds.length) setUSDMov(p=>p.filter(u=>!linkedUsdIds.includes(u.id)))
    await db.deleteProject(pr.id)
    setProjects(p=>p.filter(x=>x.id!==pr.id))
    setProjectMov(p=>p.filter(m=>m.project_id!==pr.id))
    setSelectedId(null)
  }
  const addCategory=async()=>{
    if(!newCat.trim()||!selected)return
    const updated=await db.saveProject({...selected,categories:[...(selected.categories||[]),newCat.trim()]})
    setProjects(p=>p.map(x=>x.id===selected.id?updated:x));setNewCat('')
  }
  const addMovement=async()=>{
    if(!selected||!form.amount||!form.category)return
    const mv={project_id:selected.id,date:form.date||new Date().toISOString().split('T')[0],category:form.category,description:form.description,amount:parseFloat(form.amount)||0,currency:form.currency,exchange_rate:null}
    const saved=await db.insertProjectMovement(mv)
    setProjectMov(p=>[...p,saved||mv])
    setForm({date:'',category:'',currency:'USD',amount:'',description:''});setShowForm(false)
  }
  const delMovement=async m=>deleteLinked('project_movements',m,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
  const startEditMov=m=>{setEditingId(m.id);setEditVals({date:m.date,category:m.category,description:m.description||'',amount:m.amount})}
  const cancelEditMov=()=>{setEditingId(null);setEditVals({})}
  const saveEditMov=async m=>{
    const fields=m.linked_table?{date:editVals.date,description:editVals.description}:{date:editVals.date,category:editVals.category,description:editVals.description,amount:parseFloat(editVals.amount)||0}
    await updateLinked('project_movements',m,fields,{setTransactions,setIngresos,setUSDMov,setEntityMov,setProjectMov})
    cancelEditMov()
  }

  if(!selected){
    return (
      <div style={{padding:'20px'}}>
        <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'16px'}}>Proyectos</h2>
        {projects.length===0&&<div style={{color:'#555',textAlign:'center',padding:'30px',fontSize:'0.88rem'}}>Todavía no creaste ningún proyecto.</div>}
        {projects.map(pr=>{
          const mine=projectMovements.filter(m=>m.project_id===pr.id)
          const totUSD=mine.filter(m=>m.currency==='USD').reduce((s,m)=>s+(m.amount||0),0)
          const totARS=mine.filter(m=>m.currency==='ARS').reduce((s,m)=>s+(m.amount||0),0)
          return (
            <button key={pr.id} onClick={()=>setSelectedId(pr.id)} style={{...S.card,width:'100%',textAlign:'left',marginBottom:'8px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:pr.status==='cerrado'?0.5:1}}>
              <div style={{fontSize:'0.92rem',color:'#ddd'}}>{pr.name}{pr.status==='cerrado'?' (cerrado)':''}</div>
              <div style={{textAlign:'right'}}>
                {totUSD>0&&<div style={{fontSize:'0.85rem',color:'#c8a96e'}}>{fmtUsd(totUSD)}</div>}
                {totARS>0&&<div style={{fontSize:'0.85rem',color:'#c8a96e'}}>{fmt(totARS)}</div>}
              </div>
            </button>
          )
        })}
        {showNew?(
          <div style={{...S.card,marginTop:'10px'}}>
            <input placeholder="Nombre del proyecto (ej: Libertad)" value={newName} onChange={e=>setNewName(e.target.value)} style={{...S.input,marginBottom:'8px'}}/>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={createProject} style={{...S.btnGold,flex:1}}>Crear</button>
              <button onClick={()=>setShowNew(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
            </div>
          </div>
        ):(
          <button onClick={()=>setShowNew(true)} style={{...S.btnGray,width:'100%',marginTop:'10px'}}>+ Nuevo proyecto</button>
        )}
      </div>
    )
  }

  const mine=projectMovements.filter(m=>m.project_id===selected.id)
  const totUSD=mine.filter(m=>m.currency==='USD').reduce((s,m)=>s+(m.amount||0),0)
  const totARS=mine.filter(m=>m.currency==='ARS').reduce((s,m)=>s+(m.amount||0),0)
  const cats=selected.categories||DEFAULT_PROJECT_CATS
  const byCat=cats.reduce((acc,c)=>{acc[c]=mine.filter(m=>m.category===c&&m.currency==='USD').reduce((s,m)=>s+(m.amount||0),0);return acc},{})

  return (
    <div style={{padding:'20px'}}>
      <button onClick={()=>setSelectedId(null)} style={{...S.btnGray,marginBottom:'14px',padding:'6px 12px',fontSize:'0.7rem'}}>← Todos</button>
      {renaming?(
        <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
          <input value={renameVal} onChange={e=>setRenameVal(e.target.value)} placeholder={selected.name} style={{...S.input,flex:1}}/>
          <button onClick={renameProject} style={{...S.btnGold,padding:'10px 14px'}}>✓</button>
          <button onClick={()=>{setRenaming(false);setRenameVal('')}} style={{...S.btnGray,padding:'10px 14px'}}>✕</button>
        </div>
      ):(
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
          <h2 style={{fontWeight:'normal',fontSize:'1.1rem',margin:0,flex:1}}>{selected.name}</h2>
          <button onClick={()=>{setRenaming(true);setRenameVal(selected.name)}} style={{background:'none',border:'none',color:'#555',cursor:'pointer',padding:'4px',fontSize:'0.9rem'}}>✎</button>
          <button onClick={()=>toggleStatus(selected)} style={{...S.btnGray,padding:'5px 10px',fontSize:'0.66rem'}}>{selected.status==='cerrado'?'Reactivar':'Cerrar'}</button>
          <button onClick={()=>removeProject(selected)} style={{...S.btnGray,padding:'5px 10px',fontSize:'0.66rem',color:'#c87070',borderColor:'#3a1e1e'}}>Borrar</button>
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        <MiniCard label="Total USD" value={fmtUsd(totUSD)} color="#c8a96e"/>
        <MiniCard label="Total ARS" value={fmt(totARS)} color="#c8a96e"/>
      </div>
      <div style={{...S.card,marginBottom:'16px'}}>
        <div style={{...S.label,marginBottom:'10px'}}>Por categoría (USD)</div>
        {cats.map(c=>(
          <div key={c} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #1e1e1e',fontSize:'0.85rem'}}>
            <span style={{color:'#bbb'}}>{c}</span>
            <span style={{color:byCat[c]>0?'#c8a96e':'#333'}}>{fmtUsd(byCat[c]||0)}</span>
          </div>
        ))}
        <div style={{display:'flex',gap:'6px',marginTop:'10px'}}>
          <input placeholder="Nueva categoría..." value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCategory()} style={{...S.input,flex:1,fontSize:'0.8rem',padding:'6px 10px'}}/>
          <button onClick={addCategory} style={{...S.btnGray,padding:'6px 10px'}}>+</button>
        </div>
      </div>
      {showForm?(
        <div style={{...S.card,marginBottom:'14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={{...S.input,background:'#111'}}>
              <option value="">Categoría...</option>
              {cats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})} style={{...S.input,background:'#111'}}>
              <option value="USD">Dólares</option>
              <option value="ARS">Pesos</option>
            </select>
          </div>
          <input placeholder="Monto" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} style={{...S.input,marginBottom:'8px'}} type="number"/>
          <input placeholder="Descripción (opcional)" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...S.input,marginBottom:'8px'}}/>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={addMovement} style={{...S.btnGold,flex:1}}>Guardar</button>
            <button onClick={()=>setShowForm(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setShowForm(true)} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>+ Agregar gasto</button>
      )}
      <div style={{maxHeight:'34vh',overflowY:'auto'}}>
        {[...mine].reverse().map((m,i)=>editingId===m.id?(
          <EditForm key={m.id||i}
            note={m.linked_table?'Este gasto está vinculado a tu caja USD — por ahora solo se puede corregir la fecha y la descripción. Para cambiar el monto, borralo (se borra el vínculo entero) y volvé a cargarlo.':null}
            fields={m.linked_table?[
              {key:'date',type:'date',label:'Fecha'},
              {key:'description',label:'Descripción'},
            ]:[
              {key:'date',type:'date',label:'Fecha'},
              {key:'category',type:'select',options:cats},
              {key:'amount',type:'number',label:'Monto'},
              {key:'description',label:'Descripción'},
            ]}
            values={editVals} onChange={(k,v)=>setEditVals({...editVals,[k]:v})}
            onSave={()=>saveEditMov(m)} onCancel={cancelEditMov}/>
        ):(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'0.7rem',color:'#555'}}>{m.date} · {m.category}</div>
              <div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description||'—'}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'0.85rem',color:'#c8a96e'}}>{m.currency==='USD'?fmtUsd(m.amount):fmt(m.amount)}</span>
              <button onClick={()=>startEditMov(m)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',padding:'4px'}}>✎</button>
              <button onClick={()=>delMovement(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── NUEVO CONCEPTO (botón "+") ─────────────────────────────────────────
function NewConceptView({setView}){
  return (
    <div style={{padding:'30px 20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'20px'}}>¿Qué querés crear?</h2>
      <button onClick={()=>setView('entities')} style={{...S.card,width:'100%',textAlign:'left',cursor:'pointer',marginBottom:'10px',display:'flex',alignItems:'center',gap:'12px'}}>
        <span style={{fontSize:'1.4rem'}}>♡</span>
        <div>
          <div style={{fontSize:'0.92rem',color:'#ddd'}}>Deudor o acreedor</div>
          <div style={{fontSize:'0.72rem',color:'#666',marginTop:'2px'}}>Una persona que te debe, o a la que le debés</div>
        </div>
      </button>
      <button onClick={()=>setView('projects')} style={{...S.card,width:'100%',textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',gap:'12px'}}>
        <span style={{fontSize:'1.4rem'}}>⚒</span>
        <div>
          <div style={{fontSize:'0.92rem',color:'#ddd'}}>Proyecto</div>
          <div style={{fontSize:'0.72rem',color:'#666',marginTop:'2px'}}>Una obra o proyecto nuevo para llevar costos</div>
        </div>
      </button>
    </div>
  )
}

// ── SETTINGS ──────────────────────────────────────────────────────────
function SettingsView({categories,setCategories,hiddenSections,setHiddenSections,entities,projects}){
  const [cats,setCats]=useState([...categories])
  const [newCat,setNewCat]=useState('')
  const [saved,setSaved]=useState(false)
  const [showKey,setShowKey]=useState(false)
  const [newKey,setNewKey]=useState('')

  const add=()=>{if(!newCat.trim())return;setCats([...cats,newCat.trim()]);setNewCat('')}
  const remove=i=>setCats(cats.filter((_,ci)=>ci!==i))
  const saveCats=async()=>{await db.saveCategories(cats);setCategories(cats);setSaved(true);setTimeout(()=>setSaved(false),2000)}
  const saveKey_=()=>{if(newKey.trim()){localStorage.setItem('gemini_api_key',newKey.trim());setShowKey(false);setNewKey('');alert('API key actualizada.')}}
  const toggleSection=async s=>{
    const updated=hiddenSections.includes(s)?hiddenSections.filter(x=>x!==s):[...hiddenSections,s]
    setHiddenSections(updated);await db.saveHiddenSections(updated)
  }
  const sectionLabels={entities:'♡ Deudores/Acreedores',projects:'⚒ Proyectos'}

  return (
    <div style={{padding:'20px'}}>
      <h2 style={{fontWeight:'normal',fontSize:'1.1rem',marginBottom:'20px'}}>Configuración</h2>

      {/* Secciones opcionales */}
      <div style={{...S.label,marginBottom:'12px'}}>Secciones opcionales</div>
      <div style={{...S.card,marginBottom:'20px'}}>
        <p style={{fontSize:'0.75rem',color:'#555',margin:'0 0 12px',lineHeight:1.5}}>Ocultá secciones que ya no uses. Los datos no se borran. Para cerrar una persona o un proyecto puntual sin ocultar toda la sección, usá el botón "Cerrar" dentro de cada uno.</p>
        {ALL_SECTIONS.map(s=>(
          <div key={s} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1a1a1a'}}>
            <span style={{fontSize:'0.88rem',color:hiddenSections.includes(s)?'#444':'#ccc'}}>{sectionLabels[s]} {s==='entities'?`(${entities.length})`:`(${projects.length})`}</span>
            <button onClick={()=>toggleSection(s)} style={{...hiddenSections.includes(s)?S.btnGold:S.btnGray,padding:'6px 14px',fontSize:'0.7rem'}}>
              {hiddenSections.includes(s)?'Mostrar':'Ocultar'}
            </button>
          </div>
        ))}
      </div>

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
