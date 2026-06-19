import { useState, useEffect, useRef } from 'react'
import { parseChat, parsePDF, hasGeminiKey } from './gemini.js'
import { exportToExcel } from './export.js'
import * as db from './db.js'
import { entityBalance } from './db.js'

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DEFAULT_CATEGORIES = ["Comida","Delivery","Salidas","Auto y transporte","Servicios e impuestos","Salud y belleza","Casa y art. del hogar","Ropa","Educación","Mascotas","Deporte","Regalos","Ahorro e inversión","Asesorías","Mamá","Obra","Otros","Azul","Ajuste de cierre"]
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

export default function App() {
  const [ready,setReady]=useState(false)
  const [view,setView]=useState('home')
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
  const netByCurrency = activeEntities.reduce((acc,e)=>{
    const b = entityBalance(e, entityMovements)
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
  const [messages,setMessages]=useState([{role:'assistant',text:'Hola! Escribí los gastos como en el WhatsApp:\n\n• $14.000 pizza\n• $10.000 salud corte bri  ← categoría + detalle\n• Cambio a 1410 -usd 400 +$564.000\n• + $2.272.400 cancelación sueldo\n• marina + usd 1000  ← cobraste, resta deuda de Marina\n• le presté 50.000 a dani  ← sale de tu bolsillo\n• $150.000 obra flete  ← gasto de proyecto en pesos, pide cotización\n• ajuste -$3.500  ← ajuste de cierre de caja\n\nPodés pegar varias líneas o subir un PDF con 📄'}])
  const [loading,setLoading]=useState(false)
  const [pending,setPending]=useState([])
  // waitingFor: null | 'confirm' | 'entity_type' | 'project_choice' | 'project_category' | 'project_cotiz'
  const [waitingFor,setWaitingFor]=useState(null)
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
        gastos.push({date:dateStr,amount:t.amount||0,category:t.category,description:t.description||''})
      }
      else if(t.type==='ingreso'){
        ings.push({date:dateStr,amount:t.amount||0,description:t.description||''})
      }
      else if(t.type==='usd'){
        usds.push({date:dateStr,usd100:t.usd_amount||0,usd_cambio:0,description:t.description||'Cambio',exchange_rate:t.exchange_rate||null,peso_amount:t.peso_amount||null})
      }
      else if(t.type==='entity_movement'){
        let entity=matchByName(activeEntities,t.entity_name)
        if(!entity && newEntityTypesRef.current[t.entity_name]){
          entity=await db.saveEntity({name:t.entity_name,type:newEntityTypesRef.current[t.entity_name]})
          setEntities(p=>[...p,entity])
        }
        if(!entity) continue // por seguridad, si no se pudo resolver no se guarda huérfano
        entMovs.push({entity_id:entity.id,date:dateStr,amount:t.amount||0,currency:t.currency||'ARS',description:t.description||''})
      }
      else if(t.type==='project_gasto'){
        const project=matchByName(activeProjects,t.project_name)
        if(!project) continue
        const monto=t.amount||0
        const rate=t.exchange_rate||1
        gastos.push({date:dateStr,amount:monto,category:'Obra',description:t.description||''})
        projMovs.push({project_id:project.id,date:dateStr,category:t.category||'Otro',description:t.description||'',amount:parseFloat((monto/rate).toFixed(2)),currency:'USD',exchange_rate:rate})
      }
    }
    if(gastos.length){const saved=await db.insertTransactions(gastos);setTransactions(p=>[...p,...(saved||gastos)])}
    for(const u of usds){const s=await db.insertUSD(u);setUSDMov(p=>[...p,s||u])}
    for(const i of ings){const s=await db.insertIngreso(i);setIngresos(p=>[...p,s||i])}
    for(const m of entMovs){const s=await db.insertEntityMovement(m);setEntityMov(p=>[...p,s||m])}
    for(const m of projMovs){const s=await db.insertProjectMovement(m);setProjectMov(p=>[...p,s||m])}

    setPending([]);setWaitingFor(null)
    entityQueueRef.current=[];newEntityTypesRef.current={};projectQueueRef.current=[];projectQueueIdxRef.current=0;pendingRef.current=[]
    addMsg('assistant','✓ Guardado correctamente.')
  }

  const summarize=(parsed)=>parsed.map(t=>{
    if(t.type==='usd')return `💱 Cambio: ${t.usd_amount>0?'+':''}${t.usd_amount} USD @ $${t.exchange_rate} → ${fmt(t.peso_amount)}`
    if(t.type==='ingreso')return `💰 Ingreso: ${fmt(t.amount)} — ${t.description}`
    if(t.type==='entity_movement')return `${t.amount>=0?'💵':'➖'} ${t.entity_name}: ${t.amount>=0?'+':''}${t.amount} ${t.currency}${t.description?' — '+t.description:''}`
    if(t.type==='project_gasto')return `⚒ ${t.project_name||'Proyecto'} (pesos→USD): ${fmt(t.amount)} — ${t.description}${t.category?' ['+t.category+']':''}`
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
      addMsg('assistant',`Gasto de "${project?.name||item.project_name}" (${fmt(item.amount)})\n¿A qué categoría pertenece?\n${cats.join(', ')}`)
      setWaitingFor('project_category')
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

  const handlePDF=async(e)=>{
    const file=e.target.files?.[0];if(!file)return
    setLoading(true);addMsg('user',`📄 ${file.name}`)
    try{
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})
      const parsed=await parsePDF(base64,categories)
      if(!parsed.length){addMsg('assistant','No encontré consumos en el PDF.');setLoading(false);return}
      const withType=parsed.map(t=>({...t,type:'gasto'}))
      pendingRef.current=withType
      setPending(withType)
      setWaitingFor('confirm')
      addMsg('assistant',
        `Encontré ${parsed.length} consumos:\n\n${parsed.slice(0,8).map((t,i)=>`${i+1}. ${t.description}${t.installment?' ('+t.installment+')':''}: ${fmt(t.amount)} → ${t.category}`).join('\n')}${parsed.length>8?`\n...y ${parsed.length-8} más`:''}\n\nPara cambiar una categoría escribí el número y la nueva categoría, ej: "3 Salidas"\nO escribí "guardar" para confirmar.`,
        {txs:withType,isPDF:true}
      )
    }catch(err){addMsg('assistant',`Error al leer el PDF: ${err.message}`)}
    setLoading(false);e.target.value=''
  }

  const handleSendPDF=async()=>{
    if(!input.trim()||loading)return
    const text=input.trim().toLowerCase()
    if(text==='guardar'||text==='si'||text==='sí'||text==='ok'){
      setInput('')
      await handleConfirm()
      return
    }
    const match=input.trim().match(/^(\d+)\s+(.+)$/)
    if(match&&pendingRef.current.length){
      const idx=parseInt(match[1])-1
      const newCat=match[2]
      if(idx>=0&&idx<pendingRef.current.length){
        pendingRef.current[idx]={...pendingRef.current[idx],category:newCat}
        setInput('')
        addMsg('user',input.trim())
        addMsg('assistant',`Categoría ${idx+1} cambiada a "${newCat}".\n\nEscribí otro número para seguir editando o "guardar" para confirmar.`)
        return
      }
    }
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
            {m.txs&&m.role==='assistant'&&(
              <button onClick={handleConfirm} style={{...S.btnGold,marginTop:'8px'}}>{m.isPDF?'✓ Guardar todos':'✓ Confirmar y guardar'}</button>
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
            waitingFor==='entity_type'?'deudor o acreedor...':
            waitingFor==='project_choice'?'Nombre del proyecto...':
            waitingFor==='project_category'?'Categoría del proyecto...':
            waitingFor==='project_cotiz'?'Cotización dólar blue (ej: 1400)...':
            isPDFMode?'Nro + categoría para editar, o "guardar"...':
            '$14.000 pizza  o pegá varias líneas...'
          }
          rows={1} style={{flex:1,
            background:waitingFor&&waitingFor!=='confirm'?'#1a1810':'#1a1a1a',
            border:`1px solid ${waitingFor&&waitingFor!=='confirm'?'#3a3020':'#222'}`,
            color:'#e8dcc8',padding:'10px 12px',borderRadius:'8px',fontSize:'0.88rem',resize:'none',minHeight:'42px',maxHeight:'120px',fontFamily:'Georgia,serif',outline:'none'}}/>
        <button onClick={isPDFMode?handleSendPDF:handleSend} disabled={loading}
          style={{...S.btnGold,flexShrink:0,opacity:loading?0.4:1,padding:'10px 18px',fontSize:'1.1rem'}}>›</button>
      </div>
    </div>
  )
}

// ── MONTHLY ───────────────────────────────────────────────────────────
function MonthlyView({transactions,setTransactions,ingresos,setIngresos,usdMovements,categories,selectedMonth,setSelectedMonth}){
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
  const handleExport=()=>exportToExcel({transactions,ingresos,usdMovements,categories,month,year})
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

// ── DEUDORES / ACREEDORES ───────────────────────────────────────────────
function EntitiesView({entities,setEntities,entityMovements,setEntityMov}){
  const [selectedId,setSelectedId]=useState(null)
  const [showNew,setShowNew]=useState(false)
  const [newEnt,setNewEnt]=useState({name:'',type:'deudor'})
  const [form,setForm]=useState({date:'',amount:'',currency:'ARS',description:'',direction:'recibo'})
  const [showForm,setShowForm]=useState(false)

  const selected=entities.find(e=>e.id===selectedId)

  const createEntity=async()=>{
    if(!newEnt.name.trim())return
    const saved=await db.saveEntity({name:newEnt.name.trim(),type:newEnt.type})
    setEntities(p=>[...p,saved])
    setSelectedId(saved.id);setNewEnt({name:'',type:'deudor'});setShowNew(false)
  }

  const addMovement=async()=>{
    if(!selected||!form.amount)return
    const signedAmount=form.direction==='recibo'?Math.abs(parseFloat(form.amount)):-Math.abs(parseFloat(form.amount))
    const mv={entity_id:selected.id,date:form.date||new Date().toISOString().split('T')[0],amount:signedAmount,currency:form.currency,description:form.description}
    const saved=await db.insertEntityMovement(mv)
    setEntityMov(p=>[...p,saved||mv])
    setForm({date:'',amount:'',currency:'ARS',description:'',direction:'recibo'});setShowForm(false)
  }
  const delMovement=async m=>{await db.deleteEntityMovement(m.id);setEntityMov(p=>p.filter(x=>x.id!==m.id))}
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
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
        <h2 style={{fontWeight:'normal',fontSize:'1.1rem',margin:0,flex:1}}>{selected.name}</h2>
        <button onClick={()=>toggleStatus(selected)} style={{...S.btnGray,padding:'5px 10px',fontSize:'0.66rem'}}>{selected.status==='cerrado'?'Reactivar':'Cerrar'}</button>
      </div>
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
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={addMovement} style={{...S.btnGold,flex:1}}>Guardar</button>
            <button onClick={()=>setShowForm(false)} style={{...S.btnGray,flex:1}}>Cancelar</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setShowForm(true)} style={{...S.btnGray,width:'100%',marginBottom:'14px'}}>+ Agregar movimiento</button>
      )}
      <div style={{maxHeight:'42vh',overflowY:'auto'}}>
        {[...myMovs].reverse().map((m,i)=>(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'0.7rem',color:'#555'}}>{m.date}</div><div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description||'—'}</div></div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'0.88rem',color:m.amount>=0?'#6e9e6e':'#c87070'}}>{m.amount>=0?'+':''}{m.amount.toLocaleString('es-AR')} {m.currency}</span>
              <button onClick={()=>delMovement(m)} style={{background:'none',border:'none',color:'#444',cursor:'pointer',padding:'4px'}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PROYECTOS ────────────────────────────────────────────────────────
function ProjectsView({projects,setProjects,projectMovements,setProjectMov}){
  const [selectedId,setSelectedId]=useState(null)
  const [showNew,setShowNew]=useState(false)
  const [newName,setNewName]=useState('')
  const [form,setForm]=useState({date:'',category:'',currency:'USD',amount:'',description:''})
  const [showForm,setShowForm]=useState(false)
  const [newCat,setNewCat]=useState('')

  const selected=projects.find(p=>p.id===selectedId)

  const createProject=async()=>{
    if(!newName.trim())return
    const saved=await db.saveProject({name:newName.trim(),categories:DEFAULT_PROJECT_CATS})
    setProjects(p=>[...p,saved])
    setSelectedId(saved.id);setNewName('');setShowNew(false)
  }
  const toggleStatus=async pr=>{const updated=await db.setProjectStatus(pr.id,pr.status==='cerrado'?'activo':'cerrado');setProjects(p=>p.map(x=>x.id===pr.id?{...x,...updated}:x))}
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
  const delMovement=async m=>{await db.deleteProjectMovement(m.id);setProjectMov(p=>p.filter(x=>x.id!==m.id))}

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
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
        <h2 style={{fontWeight:'normal',fontSize:'1.1rem',margin:0,flex:1}}>{selected.name}</h2>
        <button onClick={()=>toggleStatus(selected)} style={{...S.btnGray,padding:'5px 10px',fontSize:'0.66rem'}}>{selected.status==='cerrado'?'Reactivar':'Cerrar'}</button>
      </div>
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
        {[...mine].reverse().map((m,i)=>(
          <div key={m.id||i} style={{...S.card,marginBottom:'8px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'0.7rem',color:'#555'}}>{m.date} · {m.category}</div>
              <div style={{fontSize:'0.85rem',color:'#ddd',marginTop:'2px'}}>{m.description||'—'}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'0.85rem',color:'#c8a96e'}}>{m.currency==='USD'?fmtUsd(m.amount):fmt(m.amount)}</span>
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
