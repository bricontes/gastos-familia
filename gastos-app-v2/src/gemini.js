// Gemini Free API helper
// Model: gemini-2.0-flash (free tier: 1500 req/day)

const GEMINI_MODEL = 'gemini-2.0-flash'

function getKey() {
  return localStorage.getItem('gemini_api_key')
}

export function hasGeminiKey() {
  return !!getKey()
}

async function callGemini(prompt, systemPrompt) {
  const key = getKey()
  if (!key) throw new Error('NO_API_KEY')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
      })
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// For PDFs: send as inline base64 data
async function callGeminiWithPDF(base64, mimeType, prompt, systemPrompt) {
  const key = getKey()
  if (!key) throw new Error('NO_API_KEY')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
      })
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

function parseJSON(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    // Try to extract JSON array from text
    const match = raw.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
    return []
  }
}

export async function parseChat(text, categories) {
  const sys = `Sos un asistente que parsea mensajes de gastos e ingresos del hogar argentino.
Dado un texto, extraé TODAS las transacciones. Respondé SOLO con JSON array válido, sin markdown ni texto extra.
Cada objeto: { "type": "gasto"|"ingreso"|"usd", "amount": número, "description": string, "category": string, "usd_amount": número|null, "peso_amount": número|null, "exchange_rate": número|null }

Reglas:
- Gastos ($14.000 pizza): type=gasto, amount=monto en pesos, category según lista
- Ingresos (+ $2.000.000 sueldo): type=ingreso, amount=monto
- Cambios USD (Cambio a 1410 -usd 400 +$564.000): type=usd, usd_amount=delta usd (negativo=vendiste), peso_amount=pesos recibidos, exchange_rate=cotización
- Si la línea empieza con + es ingreso, si empieza con $ sin + es gasto

Categorías disponibles: ${categories.join(', ')}

Ejemplos de categorización:
pizza/super/verdulería/pastas/heladería/panadería → Comida
padel/natación/deporte → Deporte
sube/peaje/autopista/nafta/combustible → Auto y transporte
ARBA/municipal/patente/aysa/edenor/naturgy → Servicios e impuestos
librería/colegio/jardín/baile/instituto → Educación
volquetes/corralón/materiales → Otros
netflix/spotify/youtube/microsoft/claro/google → Servicios e impuestos
balanceado/veterinario → Mascotas
farmacia/médico/salud → Salud y belleza
ropa/zapatillas/indumentaria → Ropa`

  const raw = await callGemini(text, sys)
  return parseJSON(raw)
}

export async function parsePDF(base64, categories) {
  const sys = `Extraé TODOS los consumos de este resumen de tarjeta de crédito argentino.
Respondé SOLO JSON array válido, sin markdown ni texto extra.
Cada objeto: { "date": "YYYY-MM-DD", "description": string, "amount": number, "category": string, "installment": string|null }
Categorías: ${categories.join(', ')}
Ignorá: pagos realizados, saldos anteriores, impuestos, comisiones.
Para cuotas (ej "2 de 3") poné installment="2/3".
Usá el año corriente para las fechas.`

  const raw = await callGeminiWithPDF(base64, 'application/pdf',
    'Extraé todos los consumos de este resumen de tarjeta.', sys)
  return parseJSON(raw)
}
