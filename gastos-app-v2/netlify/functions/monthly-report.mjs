// Función programada: se ejecuta el día 1 de cada mes a las 10:00 UTC (7:00 AM Buenos Aires).
// Envía el resumen del mes anterior a Brian y en copia a Anita.
// Nota: Netlify NO permite invocar funciones programadas directamente por URL (devuelve 403 a propósito).
// Para probar el envío a mano, usá test-monthly-report.mjs en su lugar.
//
// Variables de entorno necesarias en Netlify:
//   VITE_SUPABASE_URL      → la URL de tu proyecto Supabase
//   VITE_SUPABASE_ANON_KEY → la anon key de Supabase
//   GMAIL_USER              → tu mail de Gmail (el que envía el reporte)
//   GMAIL_APP_PASSWORD      → contraseña de aplicación de 16 caracteres (Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones)
//   NOTIFICATION_EMAIL      → el mail de Brian (destinatario principal)

import { runMonthlyReport } from './report-core.mjs'

export const config = {
  schedule: '0 10 1 * *'
}

export default async function handler(req) {
  try {
    const { monthName, year } = await runMonthlyReport()
    console.log(`✓ Resumen ${monthName} ${year} enviado.`)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error('monthly-report error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
