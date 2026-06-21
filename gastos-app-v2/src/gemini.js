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

// entities: [{ id, name, type }]   (type: 'deudor' | 'acreedor')
// projects: [{ id, name, categories }]
export async function parseChat(text, categories, entities = [], projects = []) {
  const entityNames = entities.map(e => e.name).join(', ') || '(ninguna todavía)'
  const projectNames = projects.map(p => p.name).join(', ') || '(ninguno todavía)'
  const allProjectCats = [...new Set(projects.flatMap(p => p.categories || []))]
  const singleActiveProject = projects.length === 1 ? projects[0].name : null

  const sys = `Sos un asistente que parsea mensajes de gastos e ingresos del hogar argentino.
Respondé SOLO con JSON array válido, sin markdown ni texto extra.

Entidades (deudores/acreedores) que ya existen: ${entityNames}
Proyectos activos que ya existen: ${projectNames}

IMPORTANTE: Brian (también "Bri") y Anita/Analia (también "Ani") son los DOS USUARIOS de esta app — el matrimonio que la usa, no terceros. NUNCA son una entidad de tipo deudor/acreedor, aunque su nombre aparezca junto a un monto. Si el texto los menciona junto con un ingreso (+):
  - Monto en pesos → type="ingreso", amount=monto, description incluye el nombre (ej: "honorarios bri +$300.000" → description="Honorarios Bri").
  - Monto en dólares ("usd"/"dólares") → type="usd", usd_amount=monto, peso_amount=null, description incluye el nombre (ej: "honorarios bri +usd 500" → usd_amount=500, description="Honorarios Bri").
Si aparecen en un gasto sin "+" (ej: "corte bri", "remedios ani"), es un gasto normal (type="gasto") de la categoría que corresponda, nunca entity_movement.

Tipos posibles:

1. GASTO SIMPLE: { "type": "gasto", "amount": número, "description": string, "category": string }
   - El campo "description" es el DETALLE del gasto (no la categoría). Ejemplos:
     "$10.000 salud corte bri" → category="Salud y belleza", description="corte bri"
     "$14.000 pizza" → category="Comida", description="pizza"
     "$8.300 súper" → category="Comida", description="súper"
   - Si el texto menciona "ajuste" (de cierre de mes / de caja) → category="Ajuste de cierre"

2. INGRESO PESOS: { "type": "ingreso", "amount": número, "description": string }
   - Si el texto menciona "ajuste" y es un ingreso (+) → description="Ajuste de cierre"

3. CAMBIO USD: { "type": "usd", "usd_amount": número, "peso_amount": número, "exchange_rate": número, "description": string }
   - usd_amount positivo = recibiste USD, negativo = vendiste/entregaste USD
   - Ejemplo: "Cambio a 1410 -usd 400 +$564.000" → usd_amount=-400, peso_amount=564000, exchange_rate=1410

4. MOVIMIENTO CON ENTIDAD (deudor o acreedor): { "type": "entity_movement", "entity_name": string, "amount": número, "currency": "ARS"|"USD", "description": string, "is_new": boolean }
   - Se usa SOLO cuando el texto describe una TRANSFERENCIA DIRECTA de plata entre vos y la entidad: verbos como "le presté", "le pasé", "le di", "me pagó", "cobré", "me devolvió", o la sintaxis directa "Nombre +/-monto" — EXCEPTO Brian/Bri y Anita/Ani/Analia, que nunca son una entidad (ver nota arriba).
   - NO se usa cuando el nombre de la entidad aparece solo como ETIQUETA de a quién beneficia un gasto pagado a un TERCERO (un servicio, una cuenta, un comercio), sin verbo de transferencia directa hacia la persona y sin signo "+/-" pegado al nombre. Eso es un gasto normal (type="gasto") con su categoría — frecuentemente la categoría coincide con el nombre de la entidad si existe esa categoría (ej. "Mamá"), pero la deuda de esa persona NO se toca.
     Ejemplos de esta distinción:
     "luz mama $5.000" → type="gasto", category="Mamá", description="luz" (pagaste un servicio en su nombre, no le prestaste ni le diste plata a ella directamente — NO es entity_movement)
     "cable mama $3.000" → type="gasto", category="Mamá", description="cable"
     "le presté 5000 a mama" → type="entity_movement" (verbo "le presté" = transferencia directa)
     "mama -5000" → type="entity_movement" (sintaxis directa nombre+signo)
   - "amount" es el FLUJO DE CAJA REAL, no la deuda en sí: positivo = entró plata a tu bolsillo, negativo = salió plata de tu bolsillo. No intentes calcular si la deuda sube o baja, eso lo hace la app.
   - "currency" = "USD" si el texto dice "usd"/"dólares", "ARS" si usa "$"/pesos.
   - "is_new" = true si el nombre NO está en la lista de entidades existentes (para que la app pregunte si hay que crearla y de qué tipo).
   - Ejemplos:
     "marina + usd 1000" → entity_name="Marina", amount=1000, currency="USD" (cobraste)
     "le presté 50000 a marina" → entity_name="Marina", amount=-50000, currency="ARS" (saliste de tu bolsillo)
     "$150.000 le pasé a mami" → entity_name="Mami", amount=-150000, currency="ARS"
     "+ usd 1000 alquiler chinos dani" → entity_name="Dani", amount=1000, currency="USD", description="alquiler chinos"

5. GASTO DE PROYECTO: { "type": "project_gasto", "project_name": string, "amount": número, "currency": "ARS"|"USD", "description": string, "category": string }
   - Si el monto está en pesos (currency="ARS", el caso normal): se pedirá cotización para normalizarlo a USD, y también se registra como egreso en pesos en el mes (categoría "Obra").
   - Si el texto dice explícitamente "usd" o "dólares" para el gasto del proyecto (currency="USD"): NO se pide cotización, el monto ya está en dólares directo, y sale de la caja de dólares en vez de la caja de pesos.
   - Si el texto dice "obra" genérico y hay un solo proyecto activo (${singleActiveProject || 'no hay uno solo, hay que preguntar'}), usá ese nombre. Si hay más de uno, dejá project_name="" para que la app pregunte cuál.
   - category debe ser una de las categorías del proyecto correspondiente. Categorías conocidas de proyectos: ${allProjectCats.length ? allProjectCats.join(', ') : 'Materiales, Mano de obra, Dirección de obra, Mobiliario/equipamiento, Otro'}
   - Si no se especifica categoría, dejá category="" para que la app la pregunte.
   - Ejemplos:
     "$150.000 obra flete" → project_name="${singleActiveProject||''}", description="flete", category="Materiales", currency="ARS"
     "obra 500 usd plomero" → project_name="${singleActiveProject||''}", description="plomero", amount=500, currency="USD"

Reglas generales:
- Lo primero es chequear si el texto menciona el nombre de una entidad o de un proyecto existente — esos casos van por type=entity_movement o type=project_gasto, NO como gasto/ingreso genérico.
- Sin "+" adelante del monto = egreso/salida. Con "+" adelante = ingreso/entrada. Esta misma regla de signo aplica también dentro de entity_movement para decidir si "amount" es positivo o negativo.
- Resto de gastos sin entidad ni proyecto → type=gasto con category de la lista de categorías normales.

Categorías para gastos normales: ${categories.join(', ')}`

  const raw = await callGemini(text, sys)
  return parseJSON(raw)
}

export async function parsePDF(base64, categories) {
  const sys = `Extraé TODOS los consumos (compras, débitos automáticos, suscripciones, cuotas) de este resumen de tarjeta de crédito argentino.
Respondé SOLO con un JSON array válido, sin markdown ni texto extra.

La tabla de movimientos suele tener columnas: Fecha, #Ref (ignorar), Descripción, Dólares, Pesos — y cada fila normalmente tiene el monto en SOLO UNA de esas dos columnas de moneda (la otra queda vacía/en blanco). Por cada fila:
- Si tiene monto en la columna Pesos → "amount": ese número, "currency": "ARS"
- Si tiene monto en la columna Dólares y la de Pesos está vacía → "amount": ese número, "currency": "USD"

Cada objeto: { "date": "YYYY-MM-DD", "description": string, "amount": number, "currency": "ARS"|"USD", "category": string, "installment": string|null }
Categorías: ${categories.join(', ')}

Si el resumen separa los movimientos por tarjeta (ej. "Tarjeta 2330 ... Subtotal" y más abajo otra vez "Tarjeta 3075 ... Subtotal", cada una con su propia tabla), extraé los consumos de TODAS las tarjetas listadas, no solo de la primera.

IGNORÁ (no son consumos del titular):
- Pagos realizados (sección "Pagos", "Pago en dólares", débito del resumen anterior)
- Comisiones, Intereses, Impuestos (son cargos del banco, no compras)
- Saldo anterior, balance total, límites de crédito
- "Cuotas a vencer" (es el cronograma de cuotas futuras ya facturadas más adelante, NO son consumos nuevos — las cuotas reales ya aparecen como filas individuales en la tabla de Movimientos)

Para cuotas (ej "Cuota 2 de 3") poné installment="2/3".
Si después de revisar la tabla de Movimientos de verdad no hay ninguna fila, recién ahí respondé []. No respondas [] solo porque el formato de columnas te resulte confuso — en ese caso, hacé la mejor inferencia posible de monto y moneda en vez de omitir la fila.`
  const raw = await callGeminiWithPDF(base64, 'application/pdf', 'Extraé todos los consumos de este resumen de tarjeta.', sys)
  return parseJSON(raw)
}
