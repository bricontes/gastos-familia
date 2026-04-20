import { supabase } from './supabase.js'

function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
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

// ── OBRA SETTINGS (nombre + categorías por obra) ───────────────────────
export async function getObraSettings() {
  if (!isOnline()) return lsGet('obra_settings') || { activeObra: 'Libertad', obras: { Libertad: ['Dirección de obra','Materiales','Mano de obra','Mobiliario/equipamiento','Otro'] } }
  const { data } = await supabase.from('settings').select('value').eq('key', 'obra_settings').single()
  return data?.value || { activeObra: 'Libertad', obras: { Libertad: ['Dirección de obra','Materiales','Mano de obra','Mobiliario/equipamiento','Otro'] } }
}

export async function saveObraSettings(settings) {
  lsSet('obra_settings', settings)
  if (!isOnline()) return
  await supabase.from('settings').upsert({ key: 'obra_settings', value: settings }, { onConflict: 'key' })
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

// ── OBRA MOVEMENTS ────────────────────────────────────────────────────
export async function getObraMovements() {
  if (!isOnline()) return lsGet('obra_movements') || []
  const { data, error } = await supabase
    .from('obra_movements')
    .select('*')
    .order('date', { ascending: false })
  if (error) { console.error(error); return lsGet('obra_movements') || [] }
  const result = data || []
  lsSet('obra_movements', result)
  return result
}

export async function insertObra(mv) {
  if (!isOnline()) {
    const withId = { ...mv, id: mv.id || crypto.randomUUID() }
    const current = lsGet('obra_movements') || []
    lsSet('obra_movements', [...current, withId])
    return withId
  }
  const { data, error } = await supabase.from('obra_movements').insert([mv]).select()
  if (error) { console.error('insertObra:', error); return mv }
  const result = data?.[0] || mv
  const current = lsGet('obra_movements') || []
  lsSet('obra_movements', [...current, result])
  return result
}

export async function deleteObra(id) {
  const current = lsGet('obra_movements') || []
  lsSet('obra_movements', current.filter(m => m.id !== id))
  if (!isOnline()) return
  await supabase.from('obra_movements').delete().eq('id', id)
}

// ── MAMA MOVEMENTS ────────────────────────────────────────────────────
export async function getMamaMovements() {
  if (!isOnline()) return lsGet('mama_movements') || []
  const { data, error } = await supabase
    .from('mama_movements')
    .select('*')
    .order('date', { ascending: false })
  if (error) { console.error('getMamaMovements:', error); return lsGet('mama_movements') || [] }
  const result = data || []
  lsSet('mama_movements', result)
  return result
}

export async function insertMama(mv) {
  if (!isOnline()) {
    const withId = { ...mv, id: mv.id || crypto.randomUUID() }
    const current = lsGet('mama_movements') || []
    lsSet('mama_movements', [...current, withId])
    return withId
  }
  const { data, error } = await supabase.from('mama_movements').insert([mv]).select()
  if (error) { console.error('insertMama:', error); return mv }
  const result = data?.[0] || mv
  const current = lsGet('mama_movements') || []
  lsSet('mama_movements', [...current, result])
  return result
}

export async function deleteMama(id) {
  const current = lsGet('mama_movements') || []
  lsSet('mama_movements', current.filter(m => m.id !== id))
  if (!isOnline()) return
  await supabase.from('mama_movements').delete().eq('id', id)
}
