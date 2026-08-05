// ─────────────────────────────────────────────────────
// SUPABASE CONFIG
// 1. Open this file in a text editor (Notepad / TextEdit)
// 2. Replace the two placeholders below with your values
// 3. Find them at: supabase.com → your project → Project Settings → API
// ─────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://ipoxelvrqtyyuaewpqav.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_I-pQOeTo3m8GjyyO5BQxAQ_coQLQ8qo';
const BOARD_ID          = 'main'; // unique ID for this board — leave as-is
  
// ── SUPABASE HELPERS ──
async function dbSave(state) {
  try {
    // Try update first
    const check = await fetch(`${SUPABASE_URL}/rest/v1/roadmap?board_id=eq.${BOARD_ID}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const rows = await check.json();
    const method = rows.length > 0 ? 'PATCH' : 'POST';
    const url = rows.length > 0
      ? `${SUPABASE_URL}/rest/v1/roadmap?board_id=eq.${BOARD_ID}`
      : `${SUPABASE_URL}/rest/v1/roadmap`;
    await fetch(url, {
      method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ board_id: BOARD_ID, data: JSON.stringify(state), updated_at: new Date().toISOString() })
    });
    showSaveStatus('saved');
  } catch(e) { showSaveStatus('error'); }
}

async function dbLoad() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/roadmap?board_id=eq.${BOARD_ID}&select=data`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const rows = await res.json();
    if (rows.length > 0 && rows[0].data) return JSON.parse(rows[0].data);
    return null;
  } catch(e) { return null; }
}

function getState() {
  return { items, tItems, status, impact, details, rateCategories, availableTeams, dayTasks };
}

function applyState(state) {
  if (!state) return;
  items  = state.items  || [];
  tItems = state.tItems || {};
  status = state.status || {};
  impact = state.impact || {};
  details = state.details || {};
  rateCategories = state.rateCategories || rateCategories;
  availableTeams = state.availableTeams || availableTeams;
  dayTasks = state.dayTasks || [];
}

function showSaveStatus(s) {
  const el = document.getElementById('save-status');
  if (!el) return;
  if (s === 'saving') { el.textContent = 'Saving...'; el.style.color = 'var(--text-muted)'; }
  else if (s === 'saved') { el.textContent = 'All changes saved ✓'; el.style.color = '#0F6E56'; setTimeout(()=>{ el.textContent=''; },3000); }
  else if (s === 'error') { el.textContent = 'Save failed — check your Supabase config'; el.style.color = '#B03020'; }
}

// Debounced auto-save — saves 1.5s after last change
let saveTimer = null;
function triggerSave() {
  showSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => dbSave(getState()), 1500);
}
