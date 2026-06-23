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
  const sys = `Extraé TODOS los consumos (compras, débitos automáticos, suscripciones, cuotas) de este resumen de tarjeta de crédito argentino. Puede ser de cualquier banco o billetera (Brubank, Mercado Pago, Visa, etc.) y cada uno arma la tabla con su propio diseño — no asumas un layout fijo, adaptate al que tengas adelante.

Respondé SOLO con un JSON array válido, sin markdown ni texto extra.
Cada objeto: { "date": "YYYY-MM-DD", "description": string, "amount": number, "currency": "ARS"|"USD", "category": string, "installment": string|null }
Categorías: ${categories.join(', ')}

CÓMO ENCONTRAR LA TABLA DE CONSUMOS:
- Buscá la sección que lista las compras/operaciones reales, sin importar cómo se llame: puede decir "Movimientos", "Consumos", "Detalle de movimientos", etc.
- Esa sección puede estar dividida en sub-bloques (por tarjeta física/virtual, por número de tarjeta, por titular/adicional, etc.), cada uno con su propio subtotal. Recorré TODOS los sub-bloques de consumos, no solo el primero que encuentres.
- Cada fila tiene como mínimo una fecha, una descripción/comercio, y un monto. Puede tener columnas extra en el medio (cuota, número de operación/referencia) — ignoralas para el monto, pero si hay una columna de cuota (ej "3 de 12", "2 de 3") usala para el campo installment (formato "2/3").
- El monto puede estar en una sola columna, o repartido en dos columnas separadas (una de pesos y otra de dólares) sin un orden fijo — fijate cuál de las dos tiene el valor en cada fila:
  - Si el valor está en la columna de pesos → "amount": ese número, "currency": "ARS"
  - Si el valor está en la columna de dólares y la de pesos está vacía → "amount": ese número, "currency": "USD"
- Las fechas a veces vienen sin año (ej: "26/mar", "7/abr"). Inferí el año usando como referencia la fecha de cierre/vencimiento del resumen (normalmente todas las fechas del período son del mismo año; si el ciclo cruza fin de año, los meses oct/nov/dic pueden corresponder al año anterior al del cierre).

IGNORÁ (no son consumos nuevos del titular):
- Pagos realizados, pagos anticipados, débitos del resumen anterior (cualquier fila que diga "pago", incluso dentro de una sub-tabla de "saldo anterior")
- Comisiones, intereses, impuestos (son cargos del banco, no compras)
- Saldo del período/periodo anterior y su composición, balance total, límites de crédito disponible
- Ajustes y reembolsos (a menos que digan explícitamente que son un cargo nuevo)
- Cronogramas de "cuotas a vencer" / "próximas cuotas" (son las cuotas YA facturadas en meses futuros, no consumos nuevos — esas cuotas reales ya están como filas individuales en la tabla de consumos del período actual)

Si después de revisar bien la sección de consumos de verdad no hay ninguna fila, recién ahí respondé []. No respondas [] solo porque el formato de columnas o el nombre de las secciones no coincida con un ejemplo que conozcas — en ese caso, identificá la tabla de consumos por su contenido (fechas + comercios + montos) y extraela igual.`
  const raw = await callGeminiWithPDF(base64, 'application/pdf', 'Extraé todos los consumos de este resumen de tarjeta.', sys)
  return parseJSON(raw)
}
