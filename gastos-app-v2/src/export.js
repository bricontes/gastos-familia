import * as XLSX from 'xlsx-js-style'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const fmt = n => n || 0

const GOLD = 'C8A96E'
const DARK = '1A1A1A'
const WHITE = 'FFFFFF'
const GREEN = '2E7D32'
const RED = 'C62828'

const headerStyle = { font:{bold:true,color:{rgb:WHITE},sz:11}, fill:{fgColor:{rgb:DARK}}, alignment:{horizontal:'center',vertical:'center'} }
const titleStyle  = { font:{bold:true,color:{rgb:DARK},sz:13}, fill:{fgColor:{rgb:GOLD}}, alignment:{horizontal:'left',vertical:'center'} }
const totalStyle  = { font:{bold:true,color:{rgb:WHITE},sz:11}, fill:{fgColor:{rgb:'333333'}} }
const moneyStyle  = pos => ({ font:{color:{rgb:pos?GREEN:RED}}, numFmt:'#,##0' })

function styleRange(ws, r1, c1, r2, c2, style) {
  for (let r=r1; r<=r2; r++) for (let c=c1; c<=c2; c++) {
    const ref = XLSX.utils.encode_cell({ r, c })
    if (!ws[ref]) ws[ref] = { t:'s', v:'' }
    ws[ref].s = style
  }
}
function setCell(ws, r, c, v, style) {
  const ref = XLSX.utils.encode_cell({ r, c })
  ws[ref] = { t: typeof v === 'number' ? 'n' : 's', v, s: style }
}

export function exportToExcel({ transactions, ingresos, usdMovements, categories, month, year }) {
  const wb = XLSX.utils.book_new()
  const monthName = MONTHS[month]

  const monthTxs  = transactions.filter(t => { const d = new Date(t.date); return d.getMonth()===month && d.getFullYear()===year })
  const monthIngs = ingresos.filter(t    => { const d = new Date(t.date); return d.getMonth()===month && d.getFullYear()===year })

  const byCategory = categories.reduce((acc, cat) => {
    acc[cat] = monthTxs.filter(t => t.category===cat).reduce((s,t) => s+t.amount, 0)
    return acc
  }, {})

  const totalGastos   = monthTxs.reduce((s,t)=>s+t.amount,0)
  const totalIngresos = monthIngs.reduce((s,t)=>s+t.amount,0)
  const balance = totalIngresos - totalGastos

  // ── Hoja resumen mensual ──────────────────────────────────────────
  const ingRows  = monthIngs.map(i => [i.date?.substring(5) || '', i.description, i.amount])
  const egRows   = Object.entries(byCategory).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([cat,val]) => [cat, val])
  const maxR = Math.max(ingRows.length, egRows.length)

  const ws1 = {}
  setCell(ws1,0,0,`${monthName} ${year}`,titleStyle)
  styleRange(ws1,0,0,0,5,titleStyle)
  setCell(ws1,1,0,'Ingresos',headerStyle); styleRange(ws1,1,0,1,2,headerStyle)
  setCell(ws1,1,4,'Egresos',headerStyle); styleRange(ws1,1,3,1,5,headerStyle)
  for (let i=0;i<maxR;i++){
    const ing=ingRows[i]||['','','']; const eg=egRows[i]||['','']
    const r=i+2
    setCell(ws1,r,0,ing[0]||''); setCell(ws1,r,1,ing[1]||'')
    if(ing[2]) setCell(ws1,r,2,fmt(ing[2]),moneyStyle(true))
    setCell(ws1,r,4,eg[0]||'')
    if(eg[1]) setCell(ws1,r,5,fmt(eg[1]),moneyStyle(false))
  }
  const totalsRow = maxR+3
  setCell(ws1,totalsRow,0,'Total Ingresos',totalStyle); styleRange(ws1,totalsRow,0,totalsRow,2,totalStyle)
  setCell(ws1,totalsRow,2,totalIngresos,{...totalStyle,numFmt:'#,##0'})
  setCell(ws1,totalsRow,4,'Total Egresos',totalStyle); styleRange(ws1,totalsRow,4,totalsRow,5,totalStyle)
  setCell(ws1,totalsRow,5,totalGastos,{...totalStyle,numFmt:'#,##0'})
  const balRow = totalsRow+2
  const balStyle = { font:{bold:true,color:{rgb:WHITE},sz:12}, fill:{fgColor:{rgb:balance>=0?GREEN:RED}} }
  setCell(ws1,balRow,4,'Balance del mes',balStyle); styleRange(ws1,balRow,4,balRow,5,balStyle)
  setCell(ws1,balRow,5,balance,{...balStyle,numFmt:'#,##0'})
  ws1['!cols']=[{wch:12},{wch:32},{wch:15},{wch:4},{wch:28},{wch:15}]
  ws1['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:balRow,c:5}})
  XLSX.utils.book_append_sheet(wb, ws1, `${monthName} ${year}`)

  // ── Hoja transacciones ────────────────────────────────────────────
  const ws2 = {}
  ;['Fecha','Categoría','Importe','Descripción'].forEach((h,c)=>setCell(ws2,0,c,h,headerStyle))
  monthTxs.forEach((t,i)=>{
    const r=i+1
    setCell(ws2,r,0,t.date); setCell(ws2,r,1,t.category)
    setCell(ws2,r,2,t.amount,moneyStyle(false)); setCell(ws2,r,3,t.description||'')
  })
  ws2['!cols']=[{wch:12},{wch:26},{wch:15},{wch:42}]
  ws2['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:monthTxs.length,c:3}})
  XLSX.utils.book_append_sheet(wb, ws2, 'Transacciones')

  // ── Hoja USD ──────────────────────────────────────────────────────
  const ws3 = {}
  ;['Fecha','Descripción','USD Billetes','USD Cambio','Cotización','Subtotal Billetes','Subtotal Cambio','Total'].forEach((h,c)=>setCell(ws3,0,c,h,headerStyle))
  let sub100=0, subCambio=0
  usdMovements.forEach((m,i)=>{
    sub100+=m.usd100||0; subCambio+=m.usd_cambio||0
    const r=i+1
    setCell(ws3,r,0,m.date); setCell(ws3,r,1,m.description||'')
    setCell(ws3,r,2,m.usd100||0,moneyStyle((m.usd100||0)>=0))
    setCell(ws3,r,3,m.usd_cambio||0,moneyStyle((m.usd_cambio||0)>=0))
    setCell(ws3,r,4,m.exchange_rate||'')
    setCell(ws3,r,5,sub100); setCell(ws3,r,6,subCambio); setCell(ws3,r,7,sub100+subCambio)
  })
  ws3['!cols']=[{wch:12},{wch:40},{wch:14},{wch:14},{wch:12},{wch:18},{wch:18},{wch:12}]
  ws3['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:usdMovements.length,c:7}})
  XLSX.utils.book_append_sheet(wb, ws3, 'USD')

  XLSX.writeFile(wb, `Gastos_${monthName}_${year}.xlsx`)
}

// ── PDF: resumen mensual con el mismo estilo visual de la app ────────
export function exportToPDF({ transactions, ingresos, categories, month, year }) {
  const monthName = MONTHS[month]
  const monthTxs  = transactions.filter(t => { const d = new Date(t.date); return d.getMonth()===month && d.getFullYear()===year })
  const monthIngs = ingresos.filter(t    => { const d = new Date(t.date); return d.getMonth()===month && d.getFullYear()===year })
  const byCategory = categories.reduce((acc, cat) => {
    acc[cat] = monthTxs.filter(t => t.category===cat).reduce((s,t) => s+t.amount, 0)
    return acc
  }, {})
  const totalGastos   = monthTxs.reduce((s,t)=>s+t.amount,0)
  const totalIngresos = monthIngs.reduce((s,t)=>s+t.amount,0)
  const balance = totalIngresos - totalGastos
  const moneyFmt = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0)

  const doc = new jsPDF()
  const goldRGB=[200,169,110], darkRGB=[26,26,26], greenRGB=[46,125,50], redRGB=[198,40,40]

  // Encabezado
  doc.setFillColor(...darkRGB); doc.rect(0,0,210,28,'F')
  doc.setFillColor(...goldRGB); doc.rect(0,28,210,2,'F')
  doc.setTextColor(...goldRGB); doc.setFontSize(18); doc.setFont('helvetica','bold')
  doc.text('Gastos Familia', 14, 13)
  doc.setTextColor(255,255,255); doc.setFontSize(11); doc.setFont('helvetica','normal')
  doc.text(`Resumen mensual — ${monthName} ${year}`, 14, 21)

  // Tarjetas de totales
  const cardY=36, cardH=22, cardW=58, gap=4
  const cards=[
    {label:'Ingresos', value:moneyFmt(totalIngresos), color:greenRGB},
    {label:'Gastos', value:moneyFmt(totalGastos), color:redRGB},
    {label:'Balance', value:moneyFmt(balance), color: balance>=0?greenRGB:redRGB},
  ]
  cards.forEach((c,i)=>{
    const x=14+i*(cardW+gap)
    doc.setFillColor(245,245,245); doc.roundedRect(x,cardY,cardW,cardH,2,2,'F')
    doc.setDrawColor(...c.color); doc.setLineWidth(1); doc.line(x,cardY,x,cardY+cardH)
    doc.setTextColor(120,120,120); doc.setFontSize(8); doc.text(c.label.toUpperCase(), x+4, cardY+7)
    doc.setTextColor(...c.color); doc.setFontSize(13); doc.setFont('helvetica','bold')
    doc.text(c.value, x+4, cardY+16)
    doc.setFont('helvetica','normal')
  })

  // Tabla por categoría
  const catRows = Object.entries(byCategory).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).map(([cat,val])=>[cat, moneyFmt(val)])
  autoTable(doc, {
    startY: cardY+cardH+10,
    head: [['Categoría','Importe']],
    body: catRows.length?catRows:[['Sin gastos este mes','']],
    theme:'plain',
    headStyles:{ fillColor:darkRGB, textColor:255, fontStyle:'bold' },
    alternateRowStyles:{ fillColor:[250,247,240] },
    styles:{ fontSize:9, cellPadding:3 },
    columnStyles:{ 1:{halign:'right', textColor:redRGB} },
  })

  // Detalle de ingresos
  const afterCatY = doc.lastAutoTable.finalY + 10
  doc.setTextColor(...darkRGB); doc.setFontSize(11); doc.setFont('helvetica','bold')
  doc.text('Ingresos del mes', 14, afterCatY)
  autoTable(doc, {
    startY: afterCatY+4,
    head: [['Fecha','Descripción','Importe']],
    body: monthIngs.length ? monthIngs.map(i=>[i.date,i.description||'',moneyFmt(i.amount)]) : [['—','Sin ingresos registrados','']],
    theme:'plain',
    headStyles:{ fillColor:goldRGB, textColor:darkRGB, fontStyle:'bold' },
    alternateRowStyles:{ fillColor:[250,247,240] },
    styles:{ fontSize:9, cellPadding:3 },
    columnStyles:{ 2:{halign:'right', textColor:greenRGB} },
  })

  doc.setFontSize(7); doc.setTextColor(160,160,160)
  doc.text(`Generado automáticamente — ${new Date().toLocaleDateString('es-AR')}`, 14, 290)

  doc.save(`Gastos_${monthName}_${year}.pdf`)
}
