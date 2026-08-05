// ── STATE ──
let items  = [];   // {id, text, topic, who, col}
let tItems = {};   // id → 'pool'|'q1'|'q2'|'q3'|'q4'
let status = {};   // id → 'planned'|'progress'|'blocked'|'done'
let impact = {};   // id → {stakeholders:[{name,before,after,rateId,freq}], notes}
let details = {};  // id → {deliverables:[{text,done}], tags:[], notes, addedAt, updatedAt}
let rateCategories = [
  { id:'r1', name:'Agent / frontline', rate:30 },
  { id:'r2', name:'Analyst', rate:45 },
  { id:'r3', name:'My team', rate:50 },
];
let availableTeams = ['CX','Ops','Sales','Finance','Leadership','Data','Tech'];
let dragId = null, dragSrc = null, currentWho = 'you';
let activeDetailId = null;
let filterWho = new Set(), filterTopic = new Set();
let holGroupBy = 'topic';

const whoLabels   = {ba:'Jiarui', crm:'Ben Holser', jm:'Jingmin', you:'Yuna'};
const topicLabels = {cx:'CX', ap:'AP', ps:'PS', logistics:'Logistics', fc:'FC', other:'Other'};
const colLabels   = {now:'Keep & prioritise', later:'Backlog', rethink:'Rethink', drop:'Abandon'};
const qLabels     = {q1:'Q1 (Apr–Jun)', q2:'Q2 (Jul–Sep)', q3:'Q3 (Oct–Dec)', q4:'Q4 (Jan–Mar)'};
const MONTHS      = [
  {key:'apr',label:'Apr',q:'q1'},{key:'may',label:'May',q:'q1'},{key:'jun',label:'Jun',q:'q1'},
  {key:'jul',label:'Jul',q:'q2'},{key:'aug',label:'Aug',q:'q2'},{key:'sep',label:'Sep',q:'q2'},
  {key:'oct',label:'Oct',q:'q3'},{key:'nov',label:'Nov',q:'q3'},{key:'dec',label:'Dec',q:'q3'},
  {key:'jan',label:'Jan',q:'q4'},{key:'feb',label:'Feb',q:'q4'},{key:'mar',label:'Mar',q:'q4'},
];
const TOPICS = ['cx','ap','ps','logistics','fc','other'];
const Q_LABELS = {q1:'Q1 — Apr · May · Jun',q2:'Q2 — Jul · Aug · Sep',q3:'Q3 — Oct · Nov · Dec',q4:'Q4 — Jan · Feb · Mar'};

// ── TAB ──
function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+tab).classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
  if (tab==='view')   renderHolistic();
  if (tab==='impact') renderImpact();
}

// ── WHO ──
function setWho(btn) {
  currentWho = btn.dataset.who;
  document.querySelectorAll('.who-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── ADD ──
function addItem() {
  const inp = document.getElementById('item-input');
  const topic = document.getElementById('topic-sel').value;
  const text = inp.value.trim();
  if (!text) { inp.focus(); return; }
  const id = 'i'+Date.now()+Math.floor(Math.random()*9999);
  const now = new Date().toISOString();
  const who = whoLabels[currentWho] ? currentWho : 'you';
  items.push({id, text, topic, who, col:'now'});
  tItems[id] = 'pool';
  status[id] = 'planned';
  details[id] = { deliverables:[], tags:[], notes:'', addedAt: now, updatedAt: now };
  inp.value=''; inp.focus();
  render();
  triggerSave();
}
document.getElementById('item-input').addEventListener('keydown', e => { if(e.key==='Enter') addItem(); });

function delItem(id) {
  const idx = items.findIndex(i=>i.id===id);
  if (idx===-1) return;
  const snapshot = { item: items[idx], idx, tItem: tItems[id], status: status[id], impact: impact[id], details: details[id] };
  items = items.filter(i=>i.id!==id);
  delete tItems[id]; delete status[id]; delete impact[id]; delete details[id];
  render();
  triggerSave();
  const label = snapshot.item.text.length>28 ? snapshot.item.text.slice(0,28)+'…' : snapshot.item.text;
  showToast(`Deleted "${label}"`, 'Undo', () => undoDelete(snapshot));
}

function undoDelete(snap) {
  items.splice(Math.min(snap.idx, items.length), 0, snap.item);
  if (snap.tItem   !== undefined) tItems[snap.item.id]  = snap.tItem;
  if (snap.status  !== undefined) status[snap.item.id]  = snap.status;
  if (snap.impact  !== undefined) impact[snap.item.id]  = snap.impact;
  if (snap.details !== undefined) details[snap.item.id] = snap.details;
  render();
  triggerSave();
  showToast('Restored');
}

function delTItem(id) { delete tItems[id]; status[id]='planned'; render(); triggerSave(); }

// ── STATUS CYCLE ──
function cycleStatus(id, newStatus) {
  status[id] = newStatus;
  if (newStatus==='done' && !impact[id]) impact[id]={hrs:'',cost:'',teams:'',notes:''};
  render();
  updateTabBadges();
  triggerSave();
}

// ── DRAG ──
function allowDrop(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dragLeave(e) { if(!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over'); }
function clearDO() {
  document.querySelectorAll('.col,.quarter,.pool-cards').forEach(el=>el.classList.remove('drag-over'));
  document.querySelectorAll('.card').forEach(el=>el.classList.remove('drop-above','drop-below'));
}

function kDragStart(e,id) {
  dragId=id; dragSrc='kanban'; e.dataTransfer.effectAllowed='move';
  setTimeout(()=>{ const c=document.querySelector('.card[data-id="'+id+'"]'); if(c) c.classList.add('dragging'); },0);
}
function kDragEnd(id) {
  dragId=null; dragSrc=null; clearDO();
  const c=document.querySelector('.card[data-id="'+id+'"]'); if(c) c.classList.remove('dragging');
}
function dropKanban(e,col) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if(!dragId||dragSrc!=='kanban') return;
  const item=items.find(i=>i.id===dragId);
  if(!item) return;
  item.col=col;
  if(col==='now'&&!tItems[dragId]) tItems[dragId]='pool';
  if(col!=='now') { delete tItems[dragId]; status[dragId]='planned'; }
  dragId=null; dragSrc=null; render(); triggerSave();
}

// Within/across-column reordering: dropping directly on a card inserts
// before/after it (based on cursor position) instead of appending at the end.
function cardDragOver(e, targetId) {
  if (!dragId || dragSrc!=='kanban' || dragId===targetId) return;
  e.preventDefault(); e.stopPropagation();
  const rect = e.currentTarget.getBoundingClientRect();
  const before = (e.clientY - rect.top) < rect.height/2;
  e.currentTarget.classList.toggle('drop-above', before);
  e.currentTarget.classList.toggle('drop-below', !before);
}
function cardDragLeave(e) {
  e.stopPropagation();
  e.currentTarget.classList.remove('drop-above','drop-below');
}
function cardDrop(e, targetId) {
  e.preventDefault(); e.stopPropagation();
  const before = e.currentTarget.classList.contains('drop-above');
  e.currentTarget.classList.remove('drop-above','drop-below');
  if (!dragId || dragSrc!=='kanban' || dragId===targetId) return;
  const targetItem = items.find(i=>i.id===targetId);
  const draggedIdx = items.findIndex(i=>i.id===dragId);
  if (!targetItem || draggedIdx===-1) return;
  const dragged = items[draggedIdx];
  items.splice(draggedIdx,1);
  const targetIdx = items.findIndex(i=>i.id===targetId);
  items.splice(before?targetIdx:targetIdx+1, 0, dragged);
  dragged.col = targetItem.col;
  if (dragged.col==='now' && !tItems[dragged.id]) tItems[dragged.id]='pool';
  if (dragged.col!=='now') { delete tItems[dragged.id]; status[dragged.id]='planned'; }
  dragId=null; dragSrc=null;
  render(); triggerSave();
}
function tDragStart(e,id) {
  dragId=id; dragSrc='timeline'; e.dataTransfer.effectAllowed='move';
  setTimeout(()=>{ const c=document.querySelector('[data-tid="'+id+'"]'); if(c) c.classList.add('dragging'); },0);
}
function tDragEnd(id) {
  dragId=null; dragSrc=null; clearDO();
  const c=document.querySelector('[data-tid="'+id+'"]'); if(c) c.classList.remove('dragging');
}
function dropTimeline(e,dest) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if(!dragId) return;
  if(dragSrc==='kanban') {
    // Card dragged from kanban — move to Keep & prioritise first, then schedule
    const item=items.find(i=>i.id===dragId);
    if(!item) return;
    item.col='now';
    tItems[dragId]=dest;
    if(!status[dragId]) status[dragId]='planned';
  } else if(dragSrc==='timeline') {
    tItems[dragId]=dest;
  } else return;
  dragId=null; dragSrc=null; render(); triggerSave();
}

function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── BUILD KANBAN CARD ──
function makeCard(item) {
  const d=document.createElement('div');
  d.className='card'; d.draggable=true; d.dataset.id=item.id;
  d.addEventListener('dragstart',e=>kDragStart(e,item.id));
  d.addEventListener('dragend',()=>kDragEnd(item.id));
  d.addEventListener('dragover',e=>cardDragOver(e,item.id));
  d.addEventListener('dragleave',e=>cardDragLeave(e));
  d.addEventListener('drop',e=>cardDrop(e,item.id));
  d.addEventListener('click',e=>{ if(e.target.closest('.card-del')) return; openDetailModal(item.id); });
  const hasDetail = details[item.id] && ((details[item.id].deliverables&&details[item.id].deliverables.length) || (details[item.id].tags&&details[item.id].tags.length));
  d.innerHTML=`<div class="card-top"><span class="card-text">${esc(item.text)}</span><button class="card-del" onclick="delItem('${item.id}')" title="Remove">✕</button></div><div class="card-meta"><span class="badge badge-who-${item.who}">${whoLabels[item.who]}</span><span class="badge badge-topic-${item.topic}">${topicLabels[item.topic]}</span></div>${hasDetail?'<div class="card-expand-hint">Has details — click to view</div>':'<div class="card-expand-hint">Click to add details</div>'}`;
  return d;
}

// ── BUILD TIMELINE CARD (with status toggle) ──
function makeTCard(item) {
  const st = status[item.id]||'planned';
  const d=document.createElement('div');
  d.className='t-card status-'+st; d.draggable=true; d.dataset.tid=item.id;
  d.addEventListener('dragstart',e=>tDragStart(e,item.id));
  d.addEventListener('dragend',()=>tDragEnd(item.id));
  d.addEventListener('click',e=>{ if(e.target.closest('.t-card-del')||e.target.closest('.status-toggle')) return; openDetailModal(item.id); });
  d.innerHTML=`
    <div class="t-card-top">
      <span class="t-card-text">${esc(item.text)}</span>
      <button class="t-card-del" onclick="delTItem('${item.id}')" title="Remove from timeline">✕</button>
    </div>
    <div class="t-card-footer">
      <div class="t-card-meta">
        <span class="badge badge-topic-${item.topic}">${topicLabels[item.topic]}</span>
        <span class="badge badge-who-${item.who}">${whoLabels[item.who]}</span>
      </div>
      <div class="status-toggle">
        <button class="status-btn ${st==='planned'?'active-planned':''}" onclick="cycleStatus('${item.id}','planned')">Planned</button>
        <button class="status-btn ${st==='progress'?'active-progress':''}" onclick="cycleStatus('${item.id}','progress')">In progress</button>
        <button class="status-btn ${st==='blocked'?'active-blocked':''}" onclick="cycleStatus('${item.id}','blocked')">Blocked</button>
        <button class="status-btn ${st==='done'?'active-done':''}" onclick="cycleStatus('${item.id}','done')">Done ✓</button>
      </div>
    </div>`;
  return d;
}

function makePoolChip(item) {
  const d=document.createElement('div');
  d.className='pool-card'; d.draggable=true; d.dataset.tid=item.id;
  d.addEventListener('dragstart',e=>tDragStart(e,item.id));
  d.addEventListener('dragend',()=>tDragEnd(item.id));
  d.addEventListener('click',e=>openDetailModal(item.id));
  d.innerHTML=`<span style="font-size:12px;color:var(--text-primary)">${esc(item.text)}</span><span class="badge badge-topic-${item.topic}">${topicLabels[item.topic]}</span>`;
  return d;
}

// ── FILTER BAR (shared across Build + Holistic tabs — view-only, does not affect stats or saved data) ──
function renderFilterBar() {
  const ownerHTML = Object.keys(whoLabels).map(w=>`<button class="filter-chip" data-dim="who" data-val="${w}" onclick="toggleFilterChip(this)">${esc(whoLabels[w])}</button>`).join('');
  const topicHTML = TOPICS.map(t=>`<button class="filter-chip" data-dim="topic" data-val="${t}" onclick="toggleFilterChip(this)">${esc(topicLabels[t])}</button>`).join('');
  ['filter-owner-chips','filter-owner-chips-view'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=ownerHTML; });
  ['filter-topic-chips','filter-topic-chips-view'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=topicHTML; });
}

function toggleFilterChip(btn) {
  const set = btn.dataset.dim==='who' ? filterWho : filterTopic;
  const val = btn.dataset.val;
  if (set.has(val)) set.delete(val); else set.add(val);
  render();
  renderHolistic();
  syncFilterUI();
}

function clearFilters() {
  filterWho.clear(); filterTopic.clear();
  render();
  renderHolistic();
  syncFilterUI();
}

function itemPassesFilter(item) {
  const okWho   = filterWho.size===0   || filterWho.has(item.who);
  const okTopic = filterTopic.size===0 || filterTopic.has(item.topic);
  return okWho && okTopic;
}

// Keeps chip active-states + "Showing X of Y" text in sync across both tabs' copies of the filter bar.
function syncFilterUI() {
  document.querySelectorAll('.filter-chip').forEach(btn=>{
    const set = btn.dataset.dim==='who' ? filterWho : filterTopic;
    btn.classList.toggle('active', set.has(btn.dataset.val));
  });
  const filterActive = filterWho.size>0 || filterTopic.size>0;
  const totalVisible = items.filter(itemPassesFilter).length;
  const statusText = filterActive ? `Showing ${totalVisible} of ${items.length}` : '';
  ['filter-status-text','filter-status-text-view'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=statusText; });
  ['filter-clear-btn','filter-clear-btn-view'].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display=filterActive?'inline':'none'; });
}

// ── RENDER (build tab) ──
function render() {
  ['now','later','rethink','drop'].forEach(col=>{
    const el=document.getElementById('col-'+col);
    el.querySelectorAll('.card').forEach(c=>c.remove());
    // Bug 1 fix: hide done items from kanban if they're already scheduled in a quarter
    const colItemsAll=items.filter(i=>i.col===col && !(status[i.id]==='done' && tItems[i.id] && tItems[i.id]!=='pool'));
    const totalInCol=items.filter(i=>i.col===col).length;
    const doneHidden=totalInCol-colItemsAll.length;
    const colItems=colItemsAll.filter(itemPassesFilter);
    const countEl=document.getElementById('cnt-'+col);
    countEl.textContent=colItems.length;
    if(doneHidden>0){
      countEl.title=`${doneHidden} done item${doneHidden>1?'s':''} hidden — see Impact tracker`;
      countEl.style.opacity='.7';
    } else {
      countEl.title='';
      countEl.style.opacity='1';
    }
    document.getElementById('hint-'+col).style.display=colItems.length?'none':'block';
    colItems.forEach(item=>el.appendChild(makeCard(item)));
  });

  const keepItems=items.filter(i=>i.col==='now');
  const keepItemsView=keepItems.filter(itemPassesFilter);
  const poolItems=keepItemsView.filter(i=>tItems[i.id]==='pool');
  const poolEl=document.getElementById('pool-cards');
  poolEl.querySelectorAll('.pool-card').forEach(c=>c.remove());
  document.getElementById('pool-empty').style.display=poolItems.length?'none':'block';
  document.getElementById('pool-hint-txt').textContent=
    poolItems.length ? poolItems.length+' unscheduled' : (keepItemsView.length?'all scheduled!':'add & prioritise items first');
  poolItems.forEach(item=>poolEl.appendChild(makePoolChip(item)));

  ['q1','q2','q3','q4'].forEach(q=>{
    const el=document.getElementById('q-'+q);
    el.querySelectorAll('.t-card').forEach(c=>c.remove());
    const qItems=keepItemsView.filter(i=>tItems[i.id]===q);
    document.getElementById('qe-'+q).style.display=qItems.length?'none':'block';
    qItems.forEach(item=>el.appendChild(makeTCard(item)));
  });

  const scheduled=Object.values(tItems).filter(v=>v!=='pool').length;
  const doneCount=Object.entries(status).filter(([id,s])=>s==='done'&&tItems[id]&&tItems[id]!=='pool').length;
  document.getElementById('st-total').textContent=items.length;
  document.getElementById('st-keep').textContent=keepItems.length;
  document.getElementById('st-sched').textContent=scheduled;
  document.getElementById('st-done').textContent=doneCount;
  updateTabBadges();
  syncFilterUI();
}

function updateTabBadges() {
  const total=items.length;
  const scheduled=Object.values(tItems).filter(v=>v!=='pool').length;
  const doneCount=Object.entries(status).filter(([id,s])=>s==='done'&&tItems[id]&&tItems[id]!=='pool').length;
  document.getElementById('tb-count').textContent=total+' item'+(total!==1?'s':'');
  const sbadge=document.getElementById('tb-sched');
  sbadge.textContent=scheduled+' scheduled';
  sbadge.className='tab-badge'+(scheduled>0?' lit-green':'');
  const dbadge=document.getElementById('tb-done');
  dbadge.textContent=doneCount+' done';
  dbadge.className='tab-badge'+(doneCount>0?' lit-purple':'');
}

// ── RENDER HOLISTIC ──
function setHolGroupBy(btn) {
  holGroupBy = btn.dataset.group;
  document.querySelectorAll('#hol-groupby-toggle .groupby-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderHolistic();
}

function toggleCellOverflow(btn) {
  const cell = btn.closest('.data-cell');
  const hidden = cell.querySelectorAll('.m-chip-overflow');
  const willExpand = hidden.length>0 && hidden[0].style.display!=='block';
  hidden.forEach(c=>c.style.display = willExpand ? 'block' : '');
  btn.textContent = willExpand ? 'Show less' : `+${hidden.length} more`;
}

function renderHolistic() {
  const keepItems=items.filter(i=>i.col==='now');
  const scheduledAll=keepItems.filter(i=>tItems[i.id]&&tItems[i.id]!=='pool');
  const scheduled=scheduledAll.filter(itemPassesFilter);
  const doneCount=scheduledAll.filter(i=>status[i.id]==='done').length;
  document.getElementById('hol-total').textContent=items.length;
  document.getElementById('hol-sched').textContent=scheduledAll.length;
  document.getElementById('hol-done').textContent=doneCount;
  document.getElementById('hol-drop').textContent=items.filter(i=>i.col==='drop').length;
  const d=new Date();
  document.getElementById('hol-meta-txt').textContent='Live — updated '+d.toLocaleDateString('en-CA',{month:'long',day:'numeric',year:'numeric'});

  const trueEmpty=scheduledAll.length===0;
  const filteredEmpty=!trueEmpty && scheduled.length===0;
  const empty=trueEmpty||filteredEmpty;
  document.getElementById('hol-empty').style.display=empty?'block':'none';
  document.getElementById('hol-matrix-wrap').style.display=empty?'none':'block';
  document.getElementById('hol-legend').style.display=empty?'none':'flex';
  document.getElementById('hol-empty-title').textContent = filteredEmpty ? 'No items match this filter' : 'Nothing scheduled yet';
  document.getElementById('hol-empty-sub').textContent = filteredEmpty
    ? 'Try a different owner or topic, or clear the filter to see everything scheduled.'
    : 'Go back to the building session, sort initiatives into "Keep & prioritise" then drag them into quarters.';
  document.getElementById('hol-empty-build-btn').style.display = filteredEmpty ? 'none' : 'inline-flex';
  document.getElementById('hol-empty-clear-btn').style.display = filteredEmpty ? 'inline-flex' : 'none';
  if(empty) return;

  const groupKeys = holGroupBy==='owner'
    ? Object.keys(whoLabels).filter(w=>scheduled.some(i=>i.who===w))
    : TOPICS.filter(t=>scheduled.some(i=>i.topic===t));
  const groupLabel = k => holGroupBy==='owner' ? whoLabels[k] : topicLabels[k];
  const inGroup = (i,k) => holGroupBy==='owner' ? i.who===k : i.topic===k;

  const QUARTERS=['q1','q2','q3','q4'];
  const tbl=document.getElementById('hol-matrix');
  tbl.innerHTML='';

  // Quarter header row
  let qHeadHTML='<tr><th style="width:68px;background:var(--bg);border-bottom:0.5px solid var(--border);border-right:1px solid var(--border-strong)"></th>';
  QUARTERS.forEach(q=>{
    qHeadHTML+=`<td colspan="3" style="text-align:center;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);font-weight:500;padding:5px 6px;background:var(--bg);border-bottom:0.5px solid var(--border);border-left:1px solid var(--border-strong)">${Q_LABELS[q]}</td>`;
  });
  qHeadHTML+='</tr>';

  // Month sub-header row
  let mHeadHTML=`<tr><td style="font-size:10px;color:var(--text-muted);padding:5px 10px;background:var(--surface-hover);border-bottom:1px solid var(--border);border-right:1px solid var(--border-strong);font-family:'DM Mono',monospace;letter-spacing:.06em;text-transform:uppercase;width:68px">${holGroupBy==='owner'?'Owner':'Topic'}</td>`;
  MONTHS.forEach(m=>{
    const isFirst=MONTHS.find(x=>x.q===m.q)===m;
    mHeadHTML+=`<td style="text-align:center;font-size:11px;font-weight:500;color:var(--text-secondary);padding:5px 6px;background:var(--surface-hover);border-bottom:1px solid var(--border);border-right:0.5px solid var(--border);${isFirst?'border-left:1px solid var(--border-strong)':''}">${m.label}</td>`;
  });
  mHeadHTML+='</tr>';

  // Group rows — chips span full quarter using colspan=3 (placement is quarter-level, not month-level)
  let rowsHTML='';
  const MAX_VISIBLE=4;
  groupKeys.forEach(key=>{
    rowsHTML+=`<tr><td class="row-cat">${esc(groupLabel(key))}</td>`;
    QUARTERS.forEach(q=>{
      const qItems=scheduled.filter(i=>inGroup(i,key)&&tItems[i.id]===q);
      let cellHTML=`<td colspan="3" class="data-cell" style="border-left:1px solid var(--border-strong);min-width:180px">`;
      qItems.forEach((i,idx)=>{
        const st=status[i.id]||'planned';
        const stLabel=st==='progress'?'In progress':st==='blocked'?'Blocked':st==='done'?'Done':'Planned';
        const owner=whoLabels[i.who]||i.who;
        const overflowClass = idx>=MAX_VISIBLE ? ' m-chip-overflow' : '';
        cellHTML+=`<div class="m-chip st-${st}${overflowClass}" onclick="openDetailModal('${i.id}')">
          <span class="m-chip-text">${esc(i.text)}</span>
          <span class="m-chip-topic">${topicLabels[i.topic]}</span>
          <div class="m-chip-tt">${esc(i.text)} · ${esc(owner)} · ${stLabel}</div>
        </div>`;
      });
      if (qItems.length>MAX_VISIBLE) {
        cellHTML+=`<button class="m-chip-more" onclick="toggleCellOverflow(this)">+${qItems.length-MAX_VISIBLE} more</button>`;
      }
      cellHTML+='</td>';
      rowsHTML+=cellHTML;
    });
    rowsHTML+='</tr>';
  });

  tbl.innerHTML=qHeadHTML+mHeadHTML+rowsHTML;

  // Wire hover tooltips
  tbl.querySelectorAll('.m-chip').forEach(chip=>{
    chip.addEventListener('mouseenter',()=>{ const tt=chip.querySelector('.m-chip-tt'); if(tt) tt.style.opacity='1'; });
    chip.addEventListener('mouseleave',()=>{ const tt=chip.querySelector('.m-chip-tt'); if(tt) tt.style.opacity='0'; });
  });
}
const MANAGER_PASSWORD = 'yuna91';
let managerUnlocked = sessionStorage.getItem('manager_unlocked') === 'true';

function toggleRatePanel() {
  const panel = document.getElementById('rate-panel');
  if (panel.classList.contains('visible')) {
    panel.classList.remove('visible');
    return;
  }
  if (!managerUnlocked) {
    const pw = prompt('Enter manager password to access rate settings:');
    if (pw === null) return;
    if (pw !== MANAGER_PASSWORD) {
      showToast('Incorrect password');
      return;
    }
    managerUnlocked = true;
    sessionStorage.setItem('manager_unlocked', 'true');
  }
  panel.classList.add('visible');
  renderRateCategories();
}

function renderRateCategories() {
  const el = document.getElementById('rate-cat-rows');
  el.innerHTML = '';
  rateCategories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'rate-cat-row';
    row.innerHTML = `
      <input type="text" class="rate-cat-name" value="${esc(cat.name)}" onchange="updateRateCategory('${cat.id}','name',this.value)" />
      <div class="rate-cat-rate">
        <span style="font-size:12px;color:var(--text-muted)">$</span>
        <input type="number" min="0" value="${cat.rate}" onchange="updateRateCategory('${cat.id}','rate',this.value)" />
        <span style="font-size:11px;color:var(--text-muted)">/hr</span>
        <button class="rate-cat-del" onclick="deleteRateCategory('${cat.id}')" title="Remove">✕</button>
      </div>`;
    el.appendChild(row);
  });
}

function addRateCategory() {
  const id = 'r'+Date.now();
  rateCategories.push({ id, name:'New category', rate:0 });
  renderRateCategories();
  triggerSave();
}

function updateRateCategory(id, field, val) {
  const cat = rateCategories.find(c=>c.id===id);
  if (!cat) return;
  cat[field] = field==='rate' ? (parseFloat(val)||0) : val;
  triggerSave();
  renderImpact();
}

function deleteRateCategory(id) {
  rateCategories = rateCategories.filter(c=>c.id!==id);
  renderRateCategories();
  triggerSave();
  renderImpact();
}

function rateName(id) {
  const cat = rateCategories.find(c=>c.id===id);
  return cat ? cat.name : 'Unknown';
}
function rateValue(id) {
  const cat = rateCategories.find(c=>c.id===id);
  return cat ? cat.rate : 0;
}

// ── STAKEHOLDER ROW CALCULATIONS ──
function calcStakeholderRow(row) {
  const before = parseFloat(row.before)||0;
  const after = parseFloat(row.after)||0;
  const freq = parseFloat(row.freq)||1;
  const hrsSaved = Math.max(before-after, 0);
  const weeklyHrs = freq===52 ? hrsSaved : (freq===12 ? hrsSaved*12/52 : (freq===4 ? hrsSaved*4/52 : hrsSaved/52));
  const annualHrs = hrsSaved * freq;
  const rate = rateValue(row.rateId);
  const annualCost = annualHrs * rate;
  return { hrsSaved, weeklyHrs, annualHrs, annualCost };
}

function calcInitiativeTotals(id) {
  const imp = impact[id];
  if (!imp || !imp.stakeholders || !imp.stakeholders.length) return { weeklyHrs:0, annualHrs:0, annualCost:0, teams:[] };
  let weeklyHrs=0, annualHrs=0, annualCost=0;
  const teams=[];
  imp.stakeholders.forEach(row=>{
    const c = calcStakeholderRow(row);
    weeklyHrs += c.weeklyHrs; annualHrs += c.annualHrs; annualCost += c.annualCost;
    if (row.name) teams.push(row.name);
  });
  return { weeklyHrs, annualHrs, annualCost, teams };
}

// ── IMPACT LOG — CARD PER INITIATIVE ──
function renderImpact() {
  const keepItems=items.filter(i=>i.col==='now');
  const doneItems=keepItems.filter(i=>tItems[i.id]&&tItems[i.id]!=='pool'&&status[i.id]==='done');

  doneItems.forEach(i=>{ if(!impact[i.id]) impact[i.id]={stakeholders:[],notes:''}; });

  const wrapEl = document.getElementById('impact-log-cards');
  const emptyEl = document.getElementById('log-empty');
  wrapEl.innerHTML = '';

  if (doneItems.length===0) {
    emptyEl.style.display='block';
    renderImpactDash([]);
    return;
  }
  emptyEl.style.display='none';

  doneItems.forEach(item => {
    const imp = impact[item.id];
    const card = document.createElement('div');
    card.className = 'log-wrap';
    card.style.marginBottom = '14px';
    card.style.padding = '1.1rem 1.25rem';

    const stakeholderRowsHtml = (imp.stakeholders||[]).map((row,idx) => {
      const calc = calcStakeholderRow(row);
      return `<div class="stakeholder-row">
        <div class="sr-header">
          <input type="text" class="sr-name-input" placeholder="Team or role affected (e.g. Sales, CX)" value="${esc(row.name||'')}" onchange="updateStakeholderField('${item.id}',${idx},'name',this.value)" />
          <button class="sr-del" onclick="removeStakeholderRow('${item.id}',${idx})" title="Remove">✕</button>
        </div>
        <div class="sr-grid">
          <div class="sr-field"><label>Before (hrs)</label><input type="number" min="0" step="0.5" value="${row.before||''}" onchange="updateStakeholderField('${item.id}',${idx},'before',this.value)" /></div>
          <div class="sr-field"><label>After (hrs)</label><input type="number" min="0" step="0.5" value="${row.after||''}" onchange="updateStakeholderField('${item.id}',${idx},'after',this.value)" /></div>
          <div class="sr-field"><label>Rate category</label><select onchange="updateStakeholderField('${item.id}',${idx},'rateId',this.value)">${rateCategories.map(c=>`<option value="${c.id}" ${row.rateId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="sr-field"><label>Frequency</label><select onchange="updateStakeholderField('${item.id}',${idx},'freq',this.value)">
            <option value="1" ${row.freq=='1'?'selected':''}>One-time</option>
            <option value="52" ${row.freq=='52'||!row.freq?'selected':''}>Weekly</option>
            <option value="12" ${row.freq=='12'?'selected':''}>Monthly</option>
            <option value="4" ${row.freq=='4'?'selected':''}>Quarterly</option>
          </select></div>
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text-muted)">${calc.hrsSaved.toFixed(1)} hrs saved per occurrence · ${calc.weeklyHrs.toFixed(1)} hrs/wk equiv</div>
      </div>`;
    }).join('');

    const totals = calcInitiativeTotals(item.id);

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.85rem">
        <div>
          <div class="log-name" style="font-size:14px">${esc(item.text)}</div>
          <div class="log-sub">${topicLabels[item.topic]} · ${whoLabels[item.who]} · ${qLabels[tItems[item.id]]||''}</div>
        </div>
      </div>
      ${stakeholderRowsHtml}
      <button class="add-stakeholder-btn" onclick="addStakeholderRow('${item.id}')">+ Add stakeholder team affected</button>
      <div class="impact-total-bar">
        <span class="itb-hrs">${totals.weeklyHrs>0?totals.weeklyHrs.toFixed(1)+' hrs/wk saved across '+(imp.stakeholders||[]).length+' team(s)':'No hours logged yet'}</span>
        <span class="itb-cost">${totals.annualCost>0?'$'+Math.round(totals.annualCost).toLocaleString()+'/year':''}</span>
      </div>
      <label style="font-size:11px;font-weight:500;color:var(--text-secondary);display:block;margin:10px 0 4px">Other impact <span style="font-weight:400;color:var(--text-muted)">(optional — qualitative wins)</span></label>
      <textarea class="other-impact-textarea" placeholder="e.g. improved visibility, leadership now references this, fewer errors..." onchange="updateOtherImpact('${item.id}',this.value)">${esc(imp.notes||'')}</textarea>
    `;
    wrapEl.appendChild(card);
  });

  renderImpactDash(doneItems);
}

function addStakeholderRow(id) {
  if (!impact[id]) impact[id] = { stakeholders:[], notes:'' };
  if (!impact[id].stakeholders) impact[id].stakeholders = [];
  impact[id].stakeholders.push({ name:'', before:'', after:'', rateId: rateCategories[0]?.id||'', freq:'52' });
  triggerSave();
  renderImpact();
}

function removeStakeholderRow(id, idx) {
  if (!impact[id] || !impact[id].stakeholders) return;
  impact[id].stakeholders.splice(idx,1);
  triggerSave();
  renderImpact();
}

function updateStakeholderField(id, idx, field, val) {
  if (!impact[id] || !impact[id].stakeholders || !impact[id].stakeholders[idx]) return;
  impact[id].stakeholders[idx][field] = val;
  triggerSave();
  renderImpact();
}

function updateOtherImpact(id, val) {
  if (!impact[id]) impact[id] = { stakeholders:[], notes:'' };
  impact[id].notes = val;
  triggerSave();
}

function renderImpactDash(doneItems) {
  let totalWeeklyHrs=0, totalAnnualCost=0;
  const allTeams=new Set();
  doneItems.forEach(i=>{
    const t = calcInitiativeTotals(i.id);
    totalWeeklyHrs += t.weeklyHrs;
    totalAnnualCost += t.annualCost;
    t.teams.forEach(team=>allTeams.add(team));
  });

  const keepItems=items.filter(i=>i.col==='now');
  const schedCount=keepItems.filter(i=>tItems[i.id]&&tItems[i.id]!=='pool').length;

  document.getElementById('imp-hrs').textContent = totalWeeklyHrs>0 ? totalWeeklyHrs.toFixed(1) : '0';
  document.getElementById('imp-hrs-ann').textContent = totalWeeklyHrs>0 ? '≈ '+Math.round(totalWeeklyHrs*52)+' hrs/year' : '—';
  document.getElementById('imp-cost').textContent = totalAnnualCost>0 ? '$'+Math.round(totalAnnualCost).toLocaleString() : '$0';
  document.getElementById('imp-cost-ann').textContent = totalAnnualCost>0 ? 'annualised estimate' : '—';
  document.getElementById('imp-teams').textContent = allTeams.size||0;
  document.getElementById('imp-teams-list').textContent = allTeams.size?[...allTeams].slice(0,3).join(', ')+(allTeams.size>3?' +more':''):'—';
  document.getElementById('imp-count').textContent = doneItems.length;
  document.getElementById('imp-of').textContent = 'of '+schedCount+' planned';

  const barsEl=document.getElementById('imp-bars');
  const itemsWithHrs = doneItems.map(i=>({ item:i, hrs: calcInitiativeTotals(i.id).weeklyHrs })).filter(x=>x.hrs>0);
  const maxHrs = Math.max(...itemsWithHrs.map(x=>x.hrs), 1);
  if (itemsWithHrs.length===0) {
    barsEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);font-style:italic">Log hours saved to see chart</div>';
  } else {
    barsEl.innerHTML = itemsWithHrs.map(x=>{
      const pct = Math.round((x.hrs/maxHrs)*100);
      return `<div class="bar-row"><div class="bar-label" title="${esc(x.item.text)}">${esc(x.item.text)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-val">${x.hrs.toFixed(1)} h</div></div>`;
    }).join('');
  }

  const teamsEl=document.getElementById('imp-teams-breakdown');
  const teamMap={};
  doneItems.forEach(i=>{ calcInitiativeTotals(i.id).teams.forEach(t=>{ teamMap[t]=(teamMap[t]||0)+1; }); });
  const teamEntries=Object.entries(teamMap).sort((a,b)=>b[1]-a[1]);
  if (teamEntries.length===0) {
    teamsEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted);font-style:italic">Add stakeholder teams to see breakdown</div>';
  } else {
    teamsEl.innerHTML = teamEntries.map(([name,count])=>`<div class="team-row"><span class="team-name">${esc(name)}</span><span class="team-count">${count} initiative${count!==1?'s':''}</span></div>`).join('');
  }
}

// ── CARD DETAIL MODAL ──
function openDetailModal(id) {
  activeDetailId = id;
  const item = items.find(i=>i.id===id);
  if (!item) return;
  if (!details[id]) details[id] = { deliverables:[], tags:[], notes:'', addedAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  const d = details[id];
  if (!status[id]) status[id] = 'planned';
  if (!d.ownerHistory) d.ownerHistory = [];

  document.getElementById('dm-title').value = item.text;
  document.getElementById('dm-added').textContent = formatDate(d.addedAt);
  document.getElementById('dm-updated').textContent = formatDate(d.updatedAt);
  document.getElementById('dm-owner').value = item.who;
  document.getElementById('dm-status').value = status[id];
  document.getElementById('dm-notes').value = d.notes||'';
  renderOwnerHistory();
  renderTeamDropdown();
  renderTeamChips();
  renderDeliverables();
  document.getElementById('detail-modal').classList.add('open');
}

function renameItemFromModal() {
  if (!activeDetailId) return;
  const item = items.find(i=>i.id===activeDetailId);
  if (!item) return;
  const input = document.getElementById('dm-title');
  const val = input.value.trim();
  if (!val) { input.value = item.text; return; }
  if (val === item.text) return;
  item.text = val;
  saveDetailModal();
}

function renderOwnerHistory() {
  const el = document.getElementById('dm-owner-history');
  const hist = details[activeDetailId]?.ownerHistory || [];
  if (!hist.length) { el.textContent = ''; return; }
  const last = hist[hist.length-1];
  el.textContent = `Reassigned from ${whoLabels[last.from]} on ${formatDate(last.at)}`;
}

function changeOwnerFromModal() {
  if (!activeDetailId) return;
  const item = items.find(i=>i.id===activeDetailId);
  if (!item) return;
  const newWho = document.getElementById('dm-owner').value;
  if (newWho === item.who) return;
  const d = details[activeDetailId];
  if (!d.ownerHistory) d.ownerHistory = [];
  d.ownerHistory.push({ from: item.who, to: newWho, at: new Date().toISOString() });
  item.who = newWho;
  renderOwnerHistory();
  saveDetailModal();
  showToast(`Reassigned to ${whoLabels[newWho]}`);
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// ── STATUS DROPDOWN IN MODAL ──
function changeStatusFromModal() {
  if (!activeDetailId) return;
  const val = document.getElementById('dm-status').value;
  status[activeDetailId] = val;
  if (val==='done' && !impact[activeDetailId]) impact[activeDetailId] = { stakeholders:[], notes:'' };
  triggerSave();
  updateTabBadges();
}

// ── TEAMS MULTISELECT ──
function renderTeamDropdown() {
  const sel = document.getElementById('dm-team-add');
  const current = details[activeDetailId]?.tags || [];
  sel.innerHTML = '<option value="">+ Add team...</option>' +
    availableTeams.filter(t=>!current.includes(t)).map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
}

function addTeamFromSelect() {
  const sel = document.getElementById('dm-team-add');
  const val = sel.value;
  if (!val) return;
  if (!details[activeDetailId].tags) details[activeDetailId].tags = [];
  if (!details[activeDetailId].tags.includes(val)) details[activeDetailId].tags.push(val);
  sel.value = '';
  renderTeamDropdown();
  renderTeamChips();
  saveDetailModal();
}

function createNewTeam() {
  const input = document.getElementById('dm-new-team-input');
  const val = input.value.trim();
  if (!val) return;
  if (!availableTeams.includes(val)) availableTeams.push(val);
  if (!details[activeDetailId].tags) details[activeDetailId].tags = [];
  if (!details[activeDetailId].tags.includes(val)) details[activeDetailId].tags.push(val);
  input.value = '';
  renderTeamDropdown();
  renderTeamChips();
  saveDetailModal();
}

function renderTeamChips() {
  const wrap = document.getElementById('dm-tags-wrap');
  const select = document.getElementById('dm-team-add');
  wrap.querySelectorAll('.dm-tag').forEach(t=>t.remove());
  const tags = details[activeDetailId]?.tags || [];
  tags.forEach((tag,idx) => {
    const span = document.createElement('span');
    span.className = 'dm-tag';
    span.innerHTML = `${esc(tag)} <button onclick="removeTeamTag(${idx})">✕</button>`;
    wrap.insertBefore(span, select);
  });
}

function removeTeamTag(idx) {
  details[activeDetailId].tags.splice(idx,1);
  renderTeamDropdown();
  renderTeamChips();
  saveDetailModal();
}

// ── DELIVERABLES CHECKLIST ──
function renderDeliverables() {
  const list = document.getElementById('dm-deliv-list');
  const items_ = details[activeDetailId]?.deliverables || [];
  if (items_.length === 0) {
    list.innerHTML = '<div class="dm-deliv-empty">No deliverables yet — add one below</div>';
    return;
  }
  list.innerHTML = items_.map((dl, idx) => `
    <div class="dm-deliv-row">
      <div class="dm-deliv-check${dl.done?' checked':''}" onclick="toggleDeliverable(${idx})">${dl.done?'✓':''}</div>
      <span class="dm-deliv-text${dl.done?' checked':''}">${esc(dl.text)}</span>
      <button class="dm-deliv-del" onclick="removeDeliverable(${idx})" title="Remove">✕</button>
    </div>`).join('');
}

function handleDelivInput(e) {
  if (e.key==='Enter') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (val) {
      if (!details[activeDetailId].deliverables) details[activeDetailId].deliverables = [];
      details[activeDetailId].deliverables.push({ text: val, done: false });
      e.target.value = '';
      renderDeliverables();
      saveDetailModal();
    }
  }
}

function toggleDeliverable(idx) {
  const dl = details[activeDetailId].deliverables[idx];
  dl.done = !dl.done;
  renderDeliverables();
  saveDetailModal();
}

function removeDeliverable(idx) {
  details[activeDetailId].deliverables.splice(idx,1);
  renderDeliverables();
  saveDetailModal();
}

function saveDetailModal() {
  if (!activeDetailId) return;
  const d = details[activeDetailId];
  d.notes = document.getElementById('dm-notes').value;
  d.updatedAt = new Date().toISOString();
  document.getElementById('dm-updated').textContent = formatDate(d.updatedAt);
  triggerSave();
}

function closeDetailModal() {
  saveDetailModal();
  document.getElementById('detail-modal').classList.remove('open');
  activeDetailId = null;
  render();
}

document.getElementById('detail-modal').addEventListener('click', e=>{ if(e.target===e.currentTarget) closeDetailModal(); });

// ── EXPORT ──
function openExport() {

  let out='TEAM ROADMAP — Full summary\n'+'='.repeat(40)+'\n\n';
  ['now','later','rethink','drop'].forEach(col=>{
    const colItems=items.filter(i=>i.col===col);
    if(colItems.length){ out+=`\n${colLabels[col].toUpperCase()}\n`; colItems.forEach(i=>{
      out+=`  · ${i.text}  [${whoLabels[i.who]} · ${topicLabels[i.topic]}]\n`;
      const d=details[i.id];
      if(d&&d.deliverables&&d.deliverables.length) out+=`      Deliverables: ${d.deliverables.map(x=>(x.done?'[x] ':'[ ] ')+x.text).join('; ')}\n`;
      if(d&&d.tags&&d.tags.length) out+=`      Teams affected: ${d.tags.join(', ')}\n`;
    }); }
  });
  out+='\n\nFISCAL YEAR SCHEDULE\n'+'-'.repeat(30)+'\n';
  const keepItems=items.filter(i=>i.col==='now');
  ['q1','q2','q3','q4'].forEach(q=>{
    const qItems=keepItems.filter(i=>tItems[i.id]===q);
    if(qItems.length){ out+=`\n${qLabels[q]}\n`; qItems.forEach(i=>out+=`  · [${(status[i.id]||'planned').toUpperCase()}] ${i.text}\n`); }
  });
  const doneItems=keepItems.filter(i=>tItems[i.id]&&tItems[i.id]!=='pool'&&status[i.id]==='done');
  if(doneItems.length){
    out+='\n\nIMPACT LOG\n'+'-'.repeat(30)+'\n';
    doneItems.forEach(i=>{
      const imp=impact[i.id]||{};
      const totals=calcInitiativeTotals(i.id);
      out+=`\n· ${i.text}\n`;
      if(totals.weeklyHrs>0) out+=`  Hours saved/wk: ${totals.weeklyHrs.toFixed(1)}\n`;
      if(totals.annualCost>0) out+=`  Cost saved (annualised): $${Math.round(totals.annualCost).toLocaleString()}\n`;
      if(totals.teams.length) out+=`  Teams: ${totals.teams.join(', ')}\n`;
      if(imp.notes) out+=`  Other impact: ${imp.notes}\n`;
    });
  }
  out+='\n'+'='.repeat(40)+'\n';
  document.getElementById('export-text').value=out;
  document.getElementById('modal').classList.add('open');
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function copyExport(){ navigator.clipboard.writeText(document.getElementById('export-text').value).then(()=>showToast('Copied!')); }
document.getElementById('modal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal(); });
let toastTimer = null;
function showToast(msg, actionLabel, actionFn) {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  if (actionLabel && actionFn) {
    t.innerHTML = `<span>${esc(msg)}</span><button class="toast-action" id="toast-action-btn">${esc(actionLabel)}</button>`;
    document.getElementById('toast-action-btn').onclick = () => { t.classList.remove('show'); actionFn(); };
    t.classList.add('show');
    toastTimer = setTimeout(()=>t.classList.remove('show'), 5000);
  } else {
    t.textContent = msg;
    t.classList.add('show');
    toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
  }
}

// ── STARTUP: load from Supabase ──
async function init() {
  showSaveStatus('saving');
  document.getElementById('save-status').textContent = 'Loading board...';
  const saved = await dbLoad();
  if (saved) {
    applyState(saved);
    document.getElementById('save-status').textContent = 'Board loaded ✓';
    setTimeout(()=>{ document.getElementById('save-status').textContent=''; }, 2000);
  } else {
    document.getElementById('save-status').textContent = '';
  }
  render();
}

// ── PASSWORD GATE ──
const GATE_PASSWORD = 'citjune26';
const GATE_SESSION_KEY = 'roadmap_unlocked';

function checkPassword() {
  const val = document.getElementById('gate-input').value;
  if (val === GATE_PASSWORD) {
    sessionStorage.setItem(GATE_SESSION_KEY, 'true');
    unlockApp();
  } else {
    document.getElementById('gate-error').classList.add('show');
    document.getElementById('gate-input').value = '';
    document.getElementById('gate-input').focus();
  }
}

function unlockApp() {
  document.getElementById('gate-screen').style.display = 'none';
  document.getElementById('app-content').classList.add('unlocked');
  startApp();
}

function startApp() {
  renderFilterBar();
  // Only init with Supabase if config is filled in
  if (SUPABASE_URL !== 'PASTE_YOUR_SUPABASE_URL_HERE') {
    init();
  } else {
    render();
    console.warn('Supabase not configured — running without persistence. Fill in SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
  renderRateCategories();
}

// Check if already unlocked this session (remembers for the browser tab/session)
if (sessionStorage.getItem(GATE_SESSION_KEY) === 'true') {
  unlockApp();
} else {
  document.getElementById('gate-input').focus();
}
