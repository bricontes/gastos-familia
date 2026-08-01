// Función programada: se ejecuta el día 1 de cada mes a las 10:00 UTC (7:00 AM Buenos Aires).
// Envía el resumen del mes anterior a Brian y en copia a Anita.
//
// Variables de entorno necesarias en Netlify:
//   VITE_SUPABASE_URL      → la URL de tu proyecto Supabase
//   VITE_SUPABASE_ANON_KEY → la anon key de Supabase
//   GMAIL_USER              → tu mail de Gmail (el que envía el reporte)
//   GMAIL_APP_PASSWORD      → contraseña de aplicación de 16 caracteres (Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones)
//   NOTIFICATION_EMAIL      → el mail de Brian (destinatario principal)

import nodemailer from 'nodemailer'

export const config = {
  schedule: '0 10 1 * *'
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const ANITA_EMAIL = 'analiadattoma@gmail.com'

async function sbGet(table, params = '') {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`
  const res = await fetch(url, {
    headers: {
      apikey: process.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    }
  })
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

export default async function handler(req) {
  try {
    const now = new Date()
    const prevM = now.getMonth() === 0 ? 11 : now.getMonth() - 1
    const prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const pad = n => String(n).padStart(2, '0')
    const start = `${prevY}-${pad(prevM + 1)}-01`
    const endDay = new Date(prevY, prevM + 1, 0).getDate()
    const end   = `${prevY}-${pad(prevM + 1)}-${endDay}`

    // Traer datos del mes anterior
    const [txs, ings, usdMovs] = await Promise.all([
      sbGet('transactions', `date=gte.${start}&date=lte.${end}&order=date.asc`),
      sbGet('ingresos',     `date=gte.${start}&date=lte.${end}&order=date.asc`),
      sbGet('usd_movements','order=date.asc'),
    ])

    const totalGastos   = txs.reduce((s, t) => s + (t.amount || 0), 0)
    const totalIngresos = ings.reduce((s, t) => s + (t.amount || 0), 0)
    const balance = totalIngresos - totalGastos
    const usdTotal = usdMovs.reduce((s, m) => s + (m.usd100 || 0) + (m.usd_cambio || 0), 0)

    const byCategory = {}
    txs.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + (t.amount || 0) })

    const html = buildHTML({ monthName: MONTHS[prevM], year: prevY, totalIngresos, totalGastos, balance, usdTotal, byCategory, ings })

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      }
    })

    await transporter.sendMail({
      from: `Gastos Familia <${process.env.GMAIL_USER}>`,
      to: process.env.NOTIFICATION_EMAIL,
      cc: ANITA_EMAIL,
      subject: `📊 Resumen ${MONTHS[prevM]} ${prevY} — Gastos Familia`,
      html,
    })

    console.log(`✓ Resumen ${MONTHS[prevM]} ${prevY} enviado.`)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })

  } catch (err) {
    console.error('monthly-report error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}

function buildHTML({ monthName, year, totalIngresos, totalGastos, balance, usdTotal, byCategory, ings }) {
  const $ = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0)
  const balColor = balance >= 0 ? '#4caf50' : '#ef5350'

  const catRows = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, val]) => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #2a2a2a;font-size:13px;color:#ddd">${cat}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #2a2a2a;text-align:right;color:#ef5350;font-size:13px">${$(val)}</td>
    </tr>`).join('')

  const ingRows = ings.map(i => `
    <tr>
      <td style="padding:7px 14px;border-bottom:1px solid #2a2a2a;font-size:12px;color:#777">${i.date}</td>
      <td style="padding:7px 14px;border-bottom:1px solid #2a2a2a;font-size:12px;color:#ccc">${i.description || '—'}</td>
      <td style="padding:7px 14px;border-bottom:1px solid #2a2a2a;text-align:right;color:#4caf50;font-size:12px">${$(i.amount)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:Georgia,'Times New Roman',serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#161616;border-radius:12px;overflow:hidden;border:1px solid #222">

      <!-- Encabezado -->
      <tr><td style="background:#0f0f0f;padding:26px 28px;border-bottom:2px solid #c8a96e">
        <div style="color:#c8a96e;font-size:20px;font-weight:bold;letter-spacing:-0.5px">Gastos Familia</div>
        <div style="color:#666;font-size:12px;margin-top:4px;letter-spacing:0.5px">Resumen mensual — ${monthName} ${year}</div>
      </td></tr>

      <!-- Tarjetas de totales -->
      <tr><td style="padding:22px 28px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          ${[
            { label: 'Ingresos',   value: $(totalIngresos), color: '#4caf50' },
            { label: 'Gastos',     value: $(totalGastos),   color: '#ef5350' },
            { label: 'Balance',    value: $(balance),       color: balColor  },
          ].map(c => `
          <td width="33%" style="padding:0 4px">
            <div style="background:#1e1e1e;border-radius:8px;padding:14px 12px;border-left:3px solid ${c.color}">
              <div style="color:#555;font-size:9px;letter-spacing:1.5px;text-transform:uppercase">${c.label}</div>
              <div style="color:${c.color};font-size:15px;font-weight:bold;margin-top:6px">${c.value}</div>
            </div>
          </td>`).join('')}
        </tr></table>

        ${usdTotal ? `<div style="background:#1e1e1e;border-radius:8px;padding:14px 12px;margin-top:10px;border-left:3px solid #c8a96e">
          <div style="color:#555;font-size:9px;letter-spacing:1.5px;text-transform:uppercase">Dólares en caja (acumulado)</div>
          <div style="color:#c8a96e;font-size:15px;font-weight:bold;margin-top:6px">USD ${usdTotal.toLocaleString('es-AR')}</div>
        </div>` : ''}
      </td></tr>

      <!-- Gastos por categoría -->
      <tr><td style="padding:0 28px 22px">
        <div style="color:#c8a96e;font-size:13px;font-weight:bold;margin-bottom:10px;letter-spacing:0.5px">GASTOS POR CATEGORÍA</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e1e;border-radius:8px;overflow:hidden">
          <tr style="background:#242424">
            <th style="padding:10px 14px;text-align:left;color:#c8a96e;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:bold">Categoría</th>
            <th style="padding:10px 14px;text-align:right;color:#c8a96e;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:bold">Importe</th>
          </tr>
          ${catRows || '<tr><td colspan="2" style="padding:18px;color:#444;text-align:center;font-size:13px">Sin gastos registrados</td></tr>'}
        </table>
      </td></tr>

      <!-- Ingresos -->
      <tr><td style="padding:0 28px 28px">
        <div style="color:#c8a96e;font-size:13px;font-weight:bold;margin-bottom:10px;letter-spacing:0.5px">INGRESOS DEL MES</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e1e;border-radius:8px;overflow:hidden">
          <tr style="background:#242424">
            <th style="padding:10px 14px;text-align:left;color:#c8a96e;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:bold">Fecha</th>
            <th style="padding:10px 14px;text-align:left;color:#c8a96e;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:bold">Descripción</th>
            <th style="padding:10px 14px;text-align:right;color:#c8a96e;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:bold">Importe</th>
          </tr>
          ${ingRows || '<tr><td colspan="3" style="padding:18px;color:#444;text-align:center;font-size:13px">Sin ingresos registrados</td></tr>'}
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0f0f0f;padding:16px 28px;text-align:center;border-top:1px solid #1e1e1e">
        <div style="color:#444;font-size:11px">Generado automáticamente el ${new Date().toLocaleDateString('es-AR')}</div>
        <div style="margin-top:6px"><a href="https://gastoscontes.netlify.app" style="color:#c8a96e;font-size:11px;text-decoration:none">gastoscontes.netlify.app</a></div>
      </td></tr>

    </table>
  </td></tr></table>
</body>
</html>`
}
