const GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash']

function getKey() { return localStorage.getItem('gemini_api_key') }
export function hasGeminiKey() { return !!getKey() }

async function callGemini(prompt, systemPrompt) {
  const key = getKey()
  if (!key) throw new Error('NO_API_KEY')
  let lastError = null
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            system_instruction: { parts:[{ text: systemPrompt }] },
            contents: [{ parts:[{ text: prompt }] }],
            generationConfig: { temperature:0.1, maxOutputTokens:2048 }
          })
        }
      )
      const data = await res.json()
      if (data.error) { lastError = data.error.message; continue }
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } catch(e) { lastError = e.message }
  }
  throw new Error(lastError || 'Todos los modelos fallaron')
}

async function callGeminiWithPDF(base64, mimeType, prompt, systemPrompt) {
  const key = getKey()
  if (!key) throw new Error('NO_API_KEY')
  let lastError = null
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            system_instruction: { parts:[{ text: systemPrompt }] },
            contents: [{ parts:[{ inline_data:{ mime_type:mimeType, data:base64 } }, { text:prompt }] }],
            generationConfig: { temperature:0.1, maxOutputTokens:2048 }
          })
        }
      )
      const data = await res.json()
      if (data.error) { lastError = data.error.message; continue }
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } catch(e) { lastError = e.message }
  }
  throw new Error(lastError || 'Todos los modelos fallaron')
}

function parseJSON(raw) {
  try { return JSON.parse(raw.replace(/```json|```/g,'').trim()) }
  catch { const m = raw.match(/\[[\s\S]*\]/); if (m) return JSON.parse(m[0]); return [] }
}

export async function parseChat(text, categories, obraCats = []) {
  const sys = `Sos un asistente que parsea mensajes de gastos e ingresos del hogar argentino.
Respondé SOLO con JSON array válido, sin markdown ni texto extra.

Tipos posibles:

1. GASTO SIMPLE: { "type": "gasto", "amount": número, "description": string, "category": string }
   - El campo "description" es el DETALLE del gasto (no la categoría). Ejemplos:
     "$10.000 salud corte bri" → category="Salud y belleza", description="corte bri"
     "$1500 obra flete" → category="Obra", description="flete"
     "$14.000 pizza" → category="Comida", description="pizza"
     "$8.300 súper" → category="Comida", description="súper"
   - Si el texto menciona "obra" como categoría → type="obra_pesos" (ver abajo)

2. GASTO OBRA EN PESOS: { "type": "obra_pesos", "amount": número, "description": string, "obra_category": string }
   - Cuando el gasto es para la obra y está en pesos
   - Se pedirá cotización para convertir a USD y registrar en la sección Obra
   - También se registra como egreso en pesos en el mes
   - obra_category debe ser una de: ${obraCats.length ? obraCats.join(', ') : 'Materiales, Mano de obra, Dirección de obra, Mobiliario/equipamiento, Otro'}
   - Si el usuario no especifica categoría de obra, dejá obra_category="" para que el bot la pregunte
   - Ejemplos: "$150.000 obra flete" → type=obra_pesos, description="flete", obra_category="Materiales"
               "$50.000 obra albañil" → type=obra_pesos, description="albañil", obra_category="Mano de obra"

3. GASTO POR MAMÁ EN PESOS: { "type": "gasto_mama_pesos", "amount": número, "description": string }
   - Cuando gastás pesos propios por ella: transferencias, pagos, compras para ella
   - La deuda de mamá es en USD, así que se pedirá la cotización al usuario
   - Ejemplos: "le pasé $150.000 a mami", "$50.000 farmacia mamá", "pagué $80.000 municipal mamá"

4. INGRESO PESOS: { "type": "ingreso", "amount": número, "description": string }

5. CAMBIO USD: { "type": "usd", "usd_amount": número, "peso_amount": número, "exchange_rate": número, "description": string }
   - usd_amount positivo = recibiste USD, negativo = vendiste USD

6. PAGO DEUDA MAMÁ EN USD: { "type": "mama_pago_usd", "usd_amount": número, "description": string }
   - Mamá te paga su deuda en USD → resta de su deuda Y suma a caja USD

Reglas:
- "+ usd X ... mama" → type=mama_pago_usd
- "+ usd X ..." sin mama → type=usd con usd_amount positivo
- "Cambio a XXXX -usd N +$M" → type=usd
- Cualquier gasto en pesos mencionando mamá/mami → type=gasto_mama_pesos
- Gasto mencionando "obra" como destino → type=obra_pesos
- Resto de gastos → type=gasto con category de la lista

Categorías para gastos normales: ${categories.join(', ')}`

  const raw = await callGemini(text, sys)
  return parseJSON(raw)
}

export async function parsePDF(base64, categories) {
  const sys = `Extraé TODOS los consumos de este resumen de tarjeta de crédito argentino.
Respondé SOLO JSON array válido, sin markdown ni texto extra.
Cada objeto: { "date": "YYYY-MM-DD", "description": string, "amount": number, "category": string, "installment": string|null }
Categorías: ${categories.join(', ')}
Ignorá: pagos realizados, saldos anteriores, impuestos, comisiones.
Para cuotas (ej "2 de 3") poné installment="2/3".`
  const raw = await callGeminiWithPDF(base64, 'application/pdf', 'Extraé todos los consumos de este resumen de tarjeta.', sys)
  return parseJSON(raw)
}
