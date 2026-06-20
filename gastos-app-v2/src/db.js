import { supabase } from './supabase.js'

function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

const LS_KEY_BY_TABLE = {
  transactions: 'transactions',
  ingresos: 'ingresos',
  usd_movements: 'usd_movements',
  entity_movements: 'entity_movements',
  project_movements: 'project_movements',
}

// Borra una fila de cualquiera de las tablas de movimientos por su nombre.
// La usa deleteLinked() en App.jsx para borrar también la operación vinculada.
export async function deleteRow(table, id) {
  const key = LS_KEY_BY_TABLE[table]
  if (key) lsSet(key, (lsGet(key) || []).filter(r => r.id !== id))
  if (!isOnline()) return
  await supabase.from(table).delete().eq('id', id)
}

const isOnline = () => !!supabase

// ── CATEGORIES ────────────────────────────────────────────────────────
export async function getCategories(defaults) {
  if (!isOnline()) return lsGet('categories') || defaults
  const { data } = await supabase.from('settings').select('value').eq('key', 'categories').single()
  return data?.value || defaults
}

export async function saveCategories(cats) {
  lsSet('categories', cats)
  if (!isOnline()) return
  await supabase.from('settings').upsert({ key: 'categories', value: cats }, { onConflict: 'key' })
}

// ── HIDDEN SECTIONS ───────────────────────────────────────────────────
export async function getHiddenSections() {
  if (!isOnline()) return lsGet('hidden_sections') || []
  const { data } = await supabase.from('settings').select('value').eq('key', 'hidden_sections').single()
  return data?.value || []
}

export async function saveHiddenSections(sections) {
  lsSet('hidden_sections', sections)
  if (!isOnline()) return
  await supabase.from('settings').upsert({ key: 'hidden_sections', value: sections }, { onConflict: 'key' })
}

// ── TRANSACTIONS ──────────────────────────────────────────────────────
export async function getTransactions() {
  if (!isOnline()) return lsGet('transactions') || []
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  if (error) { console.error(error); return lsGet('transactions') || [] }
  const result = data || []
  lsSet('transactions', result)
  return result
}

export async function insertTransactions(txs) {
  if (!isOnline()) {
    const current = lsGet('transactions') || []
    const withIds = txs.map(t => ({ ...t, id: t.id || crypto.randomUUID() }))
    lsSet('transactions', [...current, ...withIds])
    return withIds
  }
  const { data, error } = await supabase.from('transactions').insert(txs).select()
  if (error) { console.error('insertTransactions:', error); return txs }
  const result = data || txs
  const current = lsGet('transactions') || []
  lsSet('transactions', [...current, ...result])
  return result
}

export async function deleteTransaction(id) {
  const current = lsGet('transactions') || []
  lsSet('transactions', current.filter(t => t.id !== id))
  if (!isOnline()) return
  await supabase.from('transactions').delete().eq('id', id)
}

// ── INGRESOS ──────────────────────────────────────────────────────────
export async function getIngresos() {
  if (!isOnline()) return lsGet('ingresos') || []
  const { data, error } = await supabase
    .from('ingresos')
    .select('*')
    .order('date', { ascending: false })
  if (error) { console.error(error); return lsGet('ingresos') || [] }
  const result = data || []
  lsSet('ingresos', result)
  return result
}

export async function insertIngreso(ing) {
  if (!isOnline()) {
    const withId = { ...ing, id: ing.id || crypto.randomUUID() }
    const current = lsGet('ingresos') || []
    lsSet('ingresos', [...current, withId])
    return withId
  }
  const { data, error } = await supabase.from('ingresos').insert([ing]).select()
  if (error) { console.error('insertIngreso:', error); return ing }
  const result = data?.[0] || ing
  const current = lsGet('ingresos') || []
  lsSet('ingresos', [...current, result])
  return result
}

export async function deleteIngreso(id) {
  const current = lsGet('ingresos') || []
  lsSet('ingresos', current.filter(i => i.id !== id))
  if (!isOnline()) return
  await supabase.from('ingresos').delete().eq('id', id)
}

// ── USD MOVEMENTS ─────────────────────────────────────────────────────
export async function getUSDMovements() {
  if (!isOnline()) return lsGet('usd_movements') || []
  const { data, error } = await supabase
    .from('usd_movements')
    .select('*')
    .order('date', { ascending: true })
  if (error) { console.error(error); return lsGet('usd_movements') || [] }
  const result = data || []
  lsSet('usd_movements', result)
  return result
}

export async function insertUSD(mv) {
  if (!isOnline()) {
    const withId = { ...mv, id: mv.id || crypto.randomUUID() }
    const current = lsGet('usd_movements') || []
    lsSet('usd_movements', [...current, withId])
    return withId
  }
  const { data, error } = await supabase.from('usd_movements').insert([mv]).select()
  if (error) { console.error('insertUSD:', error); return mv }
  const result = data?.[0] || mv
  const current = lsGet('usd_movements') || []
  lsSet('usd_movements', [...current, result])
  return result
}

export async function deleteUSD(id) {
  const current = lsGet('usd_movements') || []
  lsSet('usd_movements', current.filter(m => m.id !== id))
  if (!isOnline()) return
  await supabase.from('usd_movements').delete().eq('id', id)
}

// ── ENTIDADES (deudores / acreedores) ───────────────────────────────────
// Reemplaza al viejo "mama_movements". Genérico: cualquier cantidad
// de personas, cada una marcada como 'deudor' o 'acreedor'.

export async function getEntities() {
  if (!isOnline()) return lsGet('entities') || []
  const { data, error } = await supabase.from('entities').select('*').order('created_at', { ascending: true })
  if (error) { console.error('getEntities:', error); return lsGet('entities') || [] }
  const result = data || []
  lsSet('entities', result)
  return result
}

// Crea o actualiza una entidad. Si pasás un objeto con "id", actualiza.
export async function saveEntity(entity) {
  if (!isOnline()) {
    const current = lsGet('entities') || []
    if (entity.id) {
      const updated = current.map(e => e.id === entity.id ? { ...e, ...entity } : e)
      lsSet('entities', updated)
      return entity
    }
    const withId = { ...entity, id: crypto.randomUUID(), status: entity.status || 'activo' }
    lsSet('entities', [...current, withId])
    return withId
  }
  const payload = { name: entity.name, type: entity.type, status: entity.status || 'activo' }
  if (entity.id) payload.id = entity.id
  const { data, error } = await supabase.from('entities').upsert([payload]).select()
  if (error) { console.error('saveEntity:', error); return entity }
  const result = data?.[0] || entity
  const current = lsGet('entities') || []
  const updated = entity.id ? current.map(e => e.id === result.id ? result : e) : [...current, result]
  lsSet('entities', updated)
  return result
}

export async function setEntityStatus(id, status) {
  return saveEntity({ id, status })
}

export async function getEntityMovements() {
  if (!isOnline()) return lsGet('entity_movements') || []
  const { data, error } = await supabase
    .from('entity_movements')
    .select('*')
    .order('date', { ascending: false })
  if (error) { console.error('getEntityMovements:', error); return lsGet('entity_movements') || [] }
  const result = data || []
  lsSet('entity_movements', result)
  return result
}

// mv = { entity_id, date, amount, currency, description }
// "amount" es siempre el flujo de caja real: positivo = entró plata,
// negativo = salió plata. El saldo de deuda se calcula con entityBalance().
export async function insertEntityMovement(mv) {
  if (!isOnline()) {
    const withId = { ...mv, id: mv.id || crypto.randomUUID() }
    const current = lsGet('entity_movements') || []
    lsSet('entity_movements', [...current, withId])
    return withId
  }
  const { data, error } = await supabase.from('entity_movements').insert([mv]).select()
  if (error) { console.error('insertEntityMovement:', error); return mv }
  const result = data?.[0] || mv
  const current = lsGet('entity_movements') || []
  lsSet('entity_movements', [...current, result])
  return result
}

export async function deleteEntityMovement(id) {
  const current = lsGet('entity_movements') || []
  lsSet('entity_movements', current.filter(m => m.id !== id))
  if (!isOnline()) return
  await supabase.from('entity_movements').delete().eq('id', id)
}

// Calcula el saldo de una entidad por moneda, a partir del flujo de caja
// crudo y su tipo (deudor/acreedor). Esta es la ÚNICA función que debe
// usarse para mostrar saldos — así la lógica de signo vive en un solo lugar.
//   deudor:   saldo += -amount   (cobrar reduce lo que te debe)
//   acreedor: saldo += +amount   (que te entre plata de él = te prestó más)
export function entityBalance(entity, movements) {
  const sign = entity.type === 'deudor' ? -1 : 1
  const mine = movements.filter(m => m.entity_id === entity.id)
  return {
    ARS: mine.filter(m => m.currency === 'ARS').reduce((s, m) => s + sign * (m.amount || 0), 0),
    USD: mine.filter(m => m.currency === 'USD').reduce((s, m) => s + sign * (m.amount || 0), 0),
  }
}

// Igual que entityBalance, pero expresado como "efecto neto a tu favor":
// positivo = a tu favor (te deben más, o debés menos), negativo = en contra.
// Sirve para sumar entidades de distinto tipo en un solo número (ej. Inicio).
export function entityNetEffect(entity, movements) {
  const bal = entityBalance(entity, movements)
  return entity.type === 'deudor' ? bal : { ARS: -bal.ARS, USD: -bal.USD }
}

// ── PROYECTOS ────────────────────────────────────────────────────────
// Reemplaza al viejo "obra_movements" + "obra_settings".

export async function getProjects() {
  if (!isOnline()) return lsGet('projects') || []
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: true })
  if (error) { console.error('getProjects:', error); return lsGet('projects') || [] }
  const result = data || []
  lsSet('projects', result)
  return result
}

// Crea o actualiza un proyecto (incluye editar su lista de categorías).
export async function saveProject(project) {
  if (!isOnline()) {
    const current = lsGet('projects') || []
    if (project.id) {
      const updated = current.map(p => p.id === project.id ? { ...p, ...project } : p)
      lsSet('projects', updated)
      return project
    }
    const withId = { ...project, id: crypto.randomUUID(), status: project.status || 'activo' }
    lsSet('projects', [...current, withId])
    return withId
  }
  const payload = { name: project.name, status: project.status || 'activo', categories: project.categories }
  if (project.id) payload.id = project.id
  const { data, error } = await supabase.from('projects').upsert([payload]).select()
  if (error) { console.error('saveProject:', error); return project }
  const result = data?.[0] || project
  const current = lsGet('projects') || []
  const updated = project.id ? current.map(p => p.id === result.id ? result : p) : [...current, result]
  lsSet('projects', updated)
  return result
}

export async function setProjectStatus(id, status) {
  return saveProject({ id, status })
}

// Borra un proyecto Y todos sus movimientos (cascade en la base).
// Se usa con un cartel de confirmación del lado de la interfaz.
export async function deleteProject(id) {
  if (!isOnline()) {
    lsSet('projects', (lsGet('projects')||[]).filter(p=>p.id!==id))
    lsSet('project_movements', (lsGet('project_movements')||[]).filter(m=>m.project_id!==id))
    return
  }
  await supabase.from('projects').delete().eq('id', id)
  lsSet('projects', (lsGet('projects')||[]).filter(p=>p.id!==id))
  lsSet('project_movements', (lsGet('project_movements')||[]).filter(m=>m.project_id!==id))
}

export async function getProjectMovements() {
  if (!isOnline()) return lsGet('project_movements') || []
  const { data, error } = await supabase
    .from('project_movements')
    .select('*')
    .order('date', { ascending: false })
  if (error) { console.error('getProjectMovements:', error); return lsGet('project_movements') || [] }
  const result = data || []
  lsSet('project_movements', result)
  return result
}

// mv = { project_id, date, category, description, amount, currency, exchange_rate }
export async function insertProjectMovement(mv) {
  if (!isOnline()) {
    const withId = { ...mv, id: mv.id || crypto.randomUUID() }
    const current = lsGet('project_movements') || []
    lsSet('project_movements', [...current, withId])
    return withId
  }
  const { data, error } = await supabase.from('project_movements').insert([mv]).select()
  if (error) { console.error('insertProjectMovement:', error); return mv }
  const result = data?.[0] || mv
  const current = lsGet('project_movements') || []
  lsSet('project_movements', [...current, result])
  return result
}

export async function deleteProjectMovement(id) {
  const current = lsGet('project_movements') || []
  lsSet('project_movements', current.filter(m => m.id !== id))
  if (!isOnline()) return
  await supabase.from('project_movements').delete().eq('id', id)
}

// ── BORRADO VINCULADO ───────────────────────────────────────────────
// Varias operaciones (entidad ↔ caja, cambio USD ↔ pesos, obra en USD
// ↔ caja USD) se crean en pareja y comparten un "link_id". Esta función
// borra TODAS las filas con ese link_id, en cualquiera de las 5 tablas,
// para que nunca quede una mitad de la operación huérfana.
const LINKED_TABLES = ['transactions','ingresos','usd_movements','entity_movements','project_movements']

export async function deleteLinked(linkId) {
  if (!linkId) return
  if (!isOnline()) {
    LINKED_TABLES.forEach(key => lsSet(key, (lsGet(key) || []).filter(r => r.link_id !== linkId)))
    return
  }
  await Promise.all(LINKED_TABLES.map(table => supabase.from(table).delete().eq('link_id', linkId)))
  LINKED_TABLES.forEach(key => lsSet(key, (lsGet(key) || []).filter(r => r.link_id !== linkId)))
}
