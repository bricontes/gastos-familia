// Función SOLO para testing manual: abrí esta URL en el navegador y dispara el mismo envío
// que hace monthly-report.mjs el día 1 de cada mes, pero al instante.
// https://gastoscontes.netlify.app/.netlify/functions/test-monthly-report
//
// A diferencia de monthly-report.mjs, esta NO tiene "schedule", así que Netlify sí permite
// invocarla directo por URL. Usa las mismas variables de entorno (GMAIL_USER, GMAIL_APP_PASSWORD,
// NOTIFICATION_EMAIL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).

import { runMonthlyReport } from './report-core.mjs'

export default async function handler(req) {
  try {
    const { monthName, year } = await runMonthlyReport()
    return new Response(
      JSON.stringify({ ok: true, mensaje: `Resumen de ${monthName} ${year} enviado. Revisá tu bandeja (y la de Anita).` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('test-monthly-report error:', err.message)
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
