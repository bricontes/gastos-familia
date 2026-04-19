import { supabase } from './supabase.js'

// ── Fallback to localStorage when Supabase is not configured ─────────
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

// ── TRANSACTIONS ──────────────────────────────────────────────────────
export async function getTransactions() {
  if (!isOnline()) return lsGet('transactions') || []
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  if (error) { console.error(error); return lsGet('transactions') || [] }
  return data || []
}

export async function insertTransactions(txs) {
  // Also update localStorage as cache
  const current = lsGet('transactions') || []
  lsSet('transactions', [...current, ...txs])
  if (!isOnline()) return
  const { error } = await supabase.from('transactions').insert(txs)
  if (error) console.error('insertTransactions:', error)
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
  return data || []
}

export async function insertIngreso(ing) {
  const current = lsGet('ingresos') || []
  lsSet('ingresos', [...current, ing])
  if (!isOnline()) return
  const { error } = await supabase.from('ingresos').insert([ing])
  if (error) console.error('insertIngreso:', error)
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
  return data || []
}

export async function insertUSD(mv) {
  const current = lsGet('usd_movements') || []
  lsSet('usd_movements', [...current, mv])
  if (!isOnline()) return
  const { error } = await supabase.from('usd_movements').insert([mv])
  if (error) console.error('insertUSD:', error)
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
  return data || []
}

export async function insertObra(mv) {
  const current = lsGet('obra_movements') || []
  lsSet('obra_movements', [...current, mv])
  if (!isOnline()) return
  const { error } = await supabase.from('obra_movements').insert([mv])
  if (error) console.error('insertObra:', error)
}

export async function deleteObra(id) {
  const current = lsGet('obra_movements') || []
  lsSet('obra_movements', current.filter(m => m.id !== id))
  if (!isOnline()) return
  await supabase.from('obra_movements').delete().eq('id', id)
}
