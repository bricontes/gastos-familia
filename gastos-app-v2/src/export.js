import * as XLSX from 'xlsx'

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const fmt = n => n || 0

export function exportToExcel({ transactions, ingresos, usdMovements, obraMovements, categories, month, year }) {
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

  const rows = [['Ingresos', '', '', '', 'Egresos', 'Importe']]
  for (let i=0; i<maxR; i++) {
    const ing = ingRows[i] || ['','','']
    const eg  = egRows[i]  || ['','']
    rows.push([ing[0], ing[1], fmt(ing[2]), '', eg[0], fmt(eg[1])])
  }
  rows.push([])
  rows.push(['Total Ingresos', '', totalIngresos, '', 'Total Egresos', totalGastos])
  rows.push([])
  rows.push(['', '', '', '', 'Balance', balance])

  const ws1 = XLSX.utils.aoa_to_sheet(rows)
  ws1['!cols'] = [{wch:12},{wch:32},{wch:15},{wch:4},{wch:28},{wch:15}]
  XLSX.utils.book_append_sheet(wb, ws1, `${monthName} ${year}`)

  // ── Hoja transacciones ────────────────────────────────────────────
  const txRows = [['Fecha','Categoría','Importe','Descripción']]
  monthTxs.forEach(t => txRows.push([t.date, t.category, t.amount, t.description||'']))
  const ws2 = XLSX.utils.aoa_to_sheet(txRows)
  ws2['!cols'] = [{wch:12},{wch:26},{wch:15},{wch:42}]
  XLSX.utils.book_append_sheet(wb, ws2, 'Transacciones')

  // ── Hoja USD ──────────────────────────────────────────────────────
  const usdRows = [['Fecha','Descripción','USD Billetes','USD Cambio','Cotización','Subtotal Billetes','Subtotal Cambio','Total']]
  let sub100=0, subCambio=0
  usdMovements.forEach(m => {
    sub100    += m.usd100    || 0
    subCambio += m.usd_cambio || 0
    usdRows.push([m.date, m.description, m.usd100||0, m.usd_cambio||0, m.exchange_rate||'', sub100, subCambio, sub100+subCambio])
  })
  const ws3 = XLSX.utils.aoa_to_sheet(usdRows)
  ws3['!cols'] = [{wch:12},{wch:40},{wch:14},{wch:14},{wch:12},{wch:18},{wch:18},{wch:12}]
  XLSX.utils.book_append_sheet(wb, ws3, 'USD')

  // ── Hoja Obra Libertad ────────────────────────────────────────────
  const obraRows = [['Fecha','Categoría','Descripción','Forma de pago','Monto pesos','Monto USD']]
  obraMovements.forEach(m => obraRows.push([m.date, m.category, m.description, m.pay_method, m.pesos||0, m.usd||0]))
  const ws4 = XLSX.utils.aoa_to_sheet(obraRows)
  ws4['!cols'] = [{wch:12},{wch:26},{wch:42},{wch:16},{wch:15},{wch:12}]
  XLSX.utils.book_append_sheet(wb, ws4, 'Obra Libertad')

  XLSX.writeFile(wb, `Gastos_${monthName}_${year}.xlsx`)
}
