const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash']

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
            // Las instrucciones van integradas en el turno del usuario junto con el PDF,
            // porque algunos modelos no soportan system_instruction con inline_data.
            contents: [{ parts:[
              { inline_data:{ mime_type:mimeType, data:base64 } },
              { text: systemPrompt + '\n\n' + prompt }
            ]}],
            generationConfig: {
              temperature: 0.1,
              // 2048 era insuficiente para PDFs con muchos items (el BBVA tiene ~45).
              // Subimos a 8192 para que nunca se corte el JSON a la mitad.
              maxOutputTokens: 8192
            }
          })
        }
      )
      const data = await res.json()
      if (data.error) {
        lastError = `[${model}] ${data.error.message}`
        continue
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        // Puede pasar si el modelo blockeó el contenido (finishReason != STOP)
        const reason = data.candidates?.[0]?.finishReason || 'sin respuesta'
        lastError = `[${model}] sin texto — razón: ${reason}`
        continue
      }
      return text
    } catch(e) { lastError = `[${model}] ${e.message}` }
  }
  throw new Error(lastError || 'Todos los modelos fallaron')
}

function parseJSON(raw) {
  if (!raw) return []
  const clean = raw.replace(/```json|```/g,'').trim()
  try { return JSON.parse(clean) }
  catch {
    // Intenta extraer el array aunque venga con texto antes o después
    const m = clean.match(/\[[\s\S]*\]/)
    if (m) {
      try { return JSON.parse(m[0]) }
      catch { /* sigue */ }
    }
    // Si parece que el JSON quedó truncado a la mitad, tiramos error con contexto
    if (clean.startsWith('[') && !clean.endsWith(']')) {
      throw new Error('La respuesta del modelo quedó cortada. Probablemente el PDF es demasiado grande. Intentá subir las páginas de consumos solamente, sin las páginas de legales/avisos.')
    }
    return []
  }
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
- REGLA DEL SIGNO "+": si el texto contiene "+" ANTES del signo "$" o del monto (incluso si hay palabras en el medio, ej "salidas + $50.600"), eso es SIEMPRE un INGRESO (type="ingreso"), SIN EXCEPCIÓN. Esta regla tiene prioridad ABSOLUTA sobre cualquier coincidencia con nombre de categoría. Ejemplos:
  "salidas + $50.600" → type="ingreso", amount=50600, description="salidas" ← NO importa que "Salidas" sea una categoría de gasto; el "+" manda.
  "+ $2.272.400 sueldo bri" → type="ingreso", amount=2272400, description="Sueldo Bri"
  "$14.000 pizza" (sin +) → type="gasto", category="Comida"
- El mismo criterio de signo aplica dentro de entity_movement para decidir si "amount" es positivo (entró plata) o negativo (salió plata).
- Resto de gastos sin entidad ni proyecto → type=gasto con category de la lista de categorías normales.

Categorías para gastos normales: ${categories.join(', ')}`

  const raw = await callGemini(text, sys)
  return parseJSON(raw)
}

export async function parsePDF(base64, categories) {
  const sys = `Extraé TODOS los consumos (compras, débitos automáticos, suscripciones, cuotas) de este resumen de tarjeta de crédito argentino. Puede ser de cualquier banco o billetera (BBVA, Brubank, Mercado Pago, HSBC, Santander, etc.) y cada uno usa su propio diseño — no asumas un layout fijo, adaptate al que tengas adelante.

Respondé SOLO con un JSON array válido, sin markdown ni texto extra.
Cada objeto: { "date": "YYYY-MM-DD", "description": string, "amount": number, "currency": "ARS"|"USD", "category": string, "installment": string|null }
Categorías: \${categories.join(', ')}

FECHAS — distintos formatos según el banco:
- "YYYY-MM-DD" (ej: 2026-06-10) → usá directo.
- "DD/MM" o "D/mes" sin año (ej: "26/mar", "7/abr") → inferí el año por la fecha de cierre del resumen.
- "DD-Mon-YY" con mes abreviado en español y año 2 dígitos (ej: "08-Abr-26", "05-Jun-26") → convertí a YYYY-MM-DD. Tabla de meses: Ene=01, Feb=02, Mar=03, Abr=04, May=05, Jun=06, Jul=07, Ago=08, Sep/Set=09, Oct=10, Nov=11, Dic=12. Año "26" = 2026.
Si el ciclo cruza diciembre/enero, los meses oct/nov/dic de la tabla de consumos pueden ser del año anterior al del cierre.

CÓMO ENCONTRAR LA TABLA DE CONSUMOS:
- Buscá la sección que lista las compras reales. Puede llamarse "Movimientos", "Consumos", "Detalle de movimientos", "Consumos Brian Contestabile", "Consumos Analia D Dattoma", "Con tarjeta virtual", "Con tarjeta física", etc.
- Esa sección puede tener MÚLTIPLES sub-bloques (por número de tarjeta, por titular, por tarjeta física/virtual, etc.). Recorré ABSOLUTAMENTE TODOS sin excepción — no pares en el primero.
- Columnas auxiliares a IGNORAR para el monto: "NRO. CUPÓN", "CUPÓN", "Operación", "#Ref", cualquier columna con un número de referencia numérico.
- Separador decimal argentino: coma = decimal, punto = miles. Ej: "1.234,56" = 1234.56

CUOTAS — campo installment:
- "C.03/12" o "C.01/06" → installment="3/12" (quitá el "C.")
- "3 de 12" o "Cuota 2 de 3" → installment="3/12"
- Sin info de cuota → installment=null

MONEDA:
- Valor en columna Pesos → currency="ARS"
- Valor en columna Dólares con Pesos vacío → currency="USD"
- Montos NEGATIVOS dentro de consumos (ej: -98.999,45) = reintegro/crédito del comercio. Incluílos con amount negativo — el usuario decidirá.

IGNORAR COMPLETAMENTE (no son consumos):
- Sección "Sus pagos y ajustes realizados" / "Pagos" → son pagos del resumen, no compras.
- Sección "Impuestos, cargos e intereses" / "Comisiones" → comisión cuenta, sellos, IVA del banco.
- Saldo anterior, balance, pago mínimo, límites de crédito, tasas.
- Cronograma "Total de cuotas a vencer" / "Cuotas a vencer" → son cuotas futuras, no consumos nuevos.
- Legales y avisos.

Si revisaste todas las secciones de consumos y realmente no hay ninguna fila, respondé []. No respondas [] porque el formato te resulte raro — identificá las filas por su contenido (fecha + comercio + monto) y extraelas igual.`
  const raw = await callGeminiWithPDF(base64, 'application/pdf', 'Extraé todos los consumos de este resumen de tarjeta de crédito.', sys)
  return parseJSON(raw)
}

