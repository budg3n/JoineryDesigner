import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Function definitions ───────────────────────────────────────────
const FUNCTIONS = {
  IF:       { params:['logical_test','value_if_true','value_if_false'], min:2, max:3 },
  AND:      { params:['logical1','logical2','...'], min:1, max:99 },
  OR:       { params:['logical1','logical2','...'], min:1, max:99 },
  NOT:      { params:['logical'], min:1, max:1 },
  IFERROR:  { params:['value','value_if_error'], min:2, max:2 },
  SUM:      { params:['number1','number2','...'], min:1, max:99 },
  ROUND:    { params:['number','num_digits'], min:2, max:2 },
  ROUNDUP:  { params:['number','num_digits'], min:2, max:2 },
  ROUNDDOWN:{ params:['number','num_digits'], min:2, max:2 },
  ABS:      { params:['number'], min:1, max:1 },
  INT:      { params:['number'], min:1, max:1 },
  MOD:      { params:['number','divisor'], min:2, max:2 },
  MAX:      { params:['number1','number2','...'], min:1, max:99 },
  MIN:      { params:['number1','number2','...'], min:1, max:99 },
  SQRT:     { params:['number'], min:1, max:1 },
  CEILING:  { params:['number','significance'], min:2, max:2 },
  FLOOR:    { params:['number','significance'], min:2, max:2 },
  AVERAGE:  { params:['number1','number2','...'], min:1, max:99 },
  COUNT:    { params:['value1','value2','...'], min:1, max:99 },
  CONCATENATE:{ params:['text1','text2','...'], min:1, max:99 },
  LEFT:     { params:['text','num_chars'], min:1, max:2 },
  RIGHT:    { params:['text','num_chars'], min:1, max:2 },
  MID:      { params:['text','start_num','num_chars'], min:3, max:3 },
  LEN:      { params:['text'], min:1, max:1 },
  TRIM:     { params:['text'], min:1, max:1 },
  UPPER:    { params:['text'], min:1, max:1 },
  LOWER:    { params:['text'], min:1, max:1 },
  TEXT:     { params:['value','format_text'], min:2, max:2 },
  VALUE:    { params:['text'], min:1, max:1 },
  SUBSTITUTE:{ params:['text','old_text','new_text','instance_num'], min:3, max:4 },
  FIND:     { params:['find_text','within_text','start_num'], min:2, max:3 },
  VLOOKUP:  { params:['lookup_value','table_array','col_index_num','range_lookup'], min:3, max:4 },
  HLOOKUP:  { params:['lookup_value','table_array','row_index_num','range_lookup'], min:3, max:4 },
  INDEX:    { params:['array','row_num','col_num'], min:2, max:3 },
  MATCH:    { params:['lookup_value','lookup_array','match_type'], min:2, max:3 },
  CHOOSE:   { params:['index_num','value1','value2','...'], min:2, max:99 },
  GETPART:  { params:['part_name','property'], min:1, max:2 },
  GETMEMBER:{ params:['member_name','property'], min:1, max:2 },
}

const BRACKET_COLORS = ['#107C41','#1D6FBF','#8B4513','#6A0DAD','#B8860B','#006400','#8B0000']

// ── Tokenize ───────────────────────────────────────────────────────
function tokenize(formula) {
  const tokens = []; let i = 0
  while (i < formula.length) {
    const ch = formula[i]
    if (ch === '"') {
      let j = i+1; while (j < formula.length && formula[j] !== '"') j++
      tokens.push({ type:'string', value:formula.slice(i,j+1), start:i, end:j+1 }); i=j+1; continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i; while (j < formula.length && /[A-Za-z0-9_.]/.test(formula[j])) j++
      const val = formula.slice(i,j)
      tokens.push({ type: FUNCTIONS[val.toUpperCase()]?'func':'ident', value:val, start:i, end:j }); i=j; continue
    }
    if (/[0-9]/.test(ch)) {
      let j = i; while (j < formula.length && /[0-9.]/.test(formula[j])) j++
      tokens.push({ type:'number', value:formula.slice(i,j), start:i, end:j }); i=j; continue
    }
    if (ch==='(') { tokens.push({ type:'open', value:'(', start:i, end:i+1 }); i++; continue }
    if (ch===')') { tokens.push({ type:'close', value:')', start:i, end:i+1 }); i++; continue }
    if (ch===',') { tokens.push({ type:'comma', value:',', start:i, end:i+1 }); i++; continue }
    if ('=<>!'.includes(ch)) {
      let j=i+1; if(j<formula.length&&'=<>'.includes(formula[j]))j++
      tokens.push({ type:'op', value:formula.slice(i,j), start:i, end:j }); i=j; continue
    }
    if ('+-*/&^%'.includes(ch)) { tokens.push({ type:'op', value:ch, start:i, end:i+1 }); i++; continue }
    tokens.push({ type:'other', value:ch, start:i, end:i+1 }); i++
  }
  return tokens
}

// ── Validate ───────────────────────────────────────────────────────
function validate(formula) {
  const errors = []
  if (!formula.trim()) return errors
  const stack = []
  for (let i=0;i<formula.length;i++) {
    if (formula[i]==='(') stack.push(i)
    else if (formula[i]===')') {
      if (!stack.length) errors.push({ msg:`Unexpected ')' at position ${i+1}`, type:'error' })
      else stack.pop()
    }
  }
  if (stack.length) errors.push({ msg:`Missing ${stack.length} closing parenthes${stack.length>1?'es':'is'}`, type:'error' })
  return errors
}

// ── Get active function context ────────────────────────────────────
function getContext(formula, cursorPos) {
  let depth = 0, argIndex = 0
  for (let i = cursorPos-1; i >= 0; i--) {
    const ch = formula[i]
    if (ch === ')') { depth++; continue }
    if (ch === '(') {
      if (depth > 0) { depth--; continue }
      let j = i-1
      while (j>=0 && /[A-Za-z0-9_]/.test(formula[j])) j--
      const funcName = formula.slice(j+1,i).toUpperCase()
      if (FUNCTIONS[funcName]) return { name:funcName, argIndex, pos:j+1 }
      return null
    }
    if (ch === ',' && depth === 0) argIndex++
  }
  return null
}

// ── Render coloured formula ────────────────────────────────────────
function renderColored(formula) {
  if (!formula) return null
  const tokens = tokenize(formula)
  let depth = 0
  return tokens.map((t, i) => {
    if (t.type === 'open') {
      const color = BRACKET_COLORS[depth % BRACKET_COLORS.length]
      depth++
      return <span key={i} style={{ color, fontWeight:700 }}>{t.value}</span>
    }
    if (t.type === 'close') {
      depth = Math.max(0, depth-1)
      const color = BRACKET_COLORS[depth % BRACKET_COLORS.length]
      return <span key={i} style={{ color, fontWeight:700 }}>{t.value}</span>
    }
    if (t.type === 'func')   return <span key={i} style={{ color:'#1D6FBF', fontWeight:600 }}>{t.value}</span>
    if (t.type === 'string') return <span key={i} style={{ color:'#107C41' }}>{t.value}</span>
    if (t.type === 'number') return <span key={i} style={{ color:'#096EBF' }}>{t.value}</span>
    if (t.type === 'op')     return <span key={i} style={{ color:'#1D1D1D', fontWeight:500 }}>{t.value}</span>
    return <span key={i} style={{ color:'#1D1D1D' }}>{t.value}</span>
  })
}

// ── Evaluate formula ───────────────────────────────────────────────
function evaluateFormula(formula, names) {
  if (!formula.trim()) return { result:null, error:null }
  let expr = formula.trim()
  if (expr.startsWith('=')) expr = expr.slice(1)

  const sortedNames = Object.keys(names).sort((a,b) => b.length - a.length)
  let substituted = expr
  for (const name of sortedNames) {
    const val = names[name]
    const isNum = val.trim() !== '' && !isNaN(val)
    const replacement = isNum ? String(val) : `"${val}"`
    substituted = substituted.replace(new RegExp('(?<![A-Za-z0-9_])' + name + '(?![A-Za-z0-9_])', 'gi'), replacement)
  }

  let normalized = substituted
    .replace(/<>/g, '!==')
    .replace(/>=/g, '>=')
    .replace(/<=/g, '<=')
    .replace(/(?<![><!=$])=(?!=)/g, '===')

  const jsExpr = normalized
    .replace(/\bIF\s*\(/gi,       '_IF(')
    .replace(/\bAND\s*\(/gi,      '_AND(')
    .replace(/\bOR\s*\(/gi,       '_OR(')
    .replace(/\bNOT\s*\(/gi,      '_NOT(')
    .replace(/\bROUNDUP\s*\(/gi,  '_ROUNDUP(')
    .replace(/\bROUNDDOWN\s*\(/gi,'_ROUNDDOWN(')
    .replace(/\bROUND\s*\(/gi,    '_ROUND(')
    .replace(/\bIFERROR\s*\(/gi,  '_IFERROR(')
    .replace(/\bCONCATENATE\s*\(/gi,'_CONCAT(')
    .replace(/\bLEFT\s*\(/gi,     '_LEFT(')
    .replace(/\bRIGHT\s*\(/gi,    '_RIGHT(')
    .replace(/\bMID\s*\(/gi,      '_MID(')
    .replace(/\bLEN\s*\(/gi,      '_LEN(')
    .replace(/\bUPPER\s*\(/gi,    '_UPPER(')
    .replace(/\bLOWER\s*\(/gi,    '_LOWER(')
    .replace(/\bTRIM\s*\(/gi,     '_TRIM(')
    .replace(/\bABS\s*\(/gi,      '_ABS(')
    .replace(/\bINT\s*\(/gi,      '_INT(')
    .replace(/\bMOD\s*\(/gi,      '_MOD(')
    .replace(/\bMAX\s*\(/gi,      '_MAX(')
    .replace(/\bMIN\s*\(/gi,      '_MIN(')
    .replace(/\bSUM\s*\(/gi,      '_SUM(')
    .replace(/\bSQRT\s*\(/gi,     '_SQRT(')
    .replace(/\bCEILING\s*\(/gi,  '_CEILING(')
    .replace(/\bFLOOR\s*\(/gi,    '_FLOOR(')
    .replace(/\bTEXT\s*\(/gi,     '_TEXT(')
    .replace(/\bVALUE\s*\(/gi,    '_VALUE(')
    .replace(/&/g, '+')

  const fns = {
    _IF:        (c,t,f) => c ? t : (f !== undefined ? f : false),
    _AND:       (...a) => a.every(Boolean),
    _OR:        (...a) => a.some(Boolean),
    _NOT:       a => !a,
    _ROUND:     (n,d) => parseFloat(Number(n).toFixed(d)),
    _ROUNDUP:   (n,d) => Math.ceil(n * 10**d) / 10**d,
    _ROUNDDOWN: (n,d) => Math.floor(n * 10**d) / 10**d,
    _IFERROR:   (v,e) => { try { return v } catch { return e } },
    _CONCAT:    (...a) => a.join(''),
    _LEFT:      (t,n) => String(t).slice(0,n),
    _RIGHT:     (t,n) => String(t).slice(-n),
    _MID:       (t,s,n) => String(t).slice(s-1,s-1+n),
    _LEN:       t => String(t).length,
    _UPPER:     t => String(t).toUpperCase(),
    _LOWER:     t => String(t).toLowerCase(),
    _TRIM:      t => String(t).trim(),
    _ABS:       n => Math.abs(n),
    _INT:       n => Math.floor(n),
    _MOD:       (n,d) => n % d,
    _MAX:       (...a) => Math.max(...a),
    _MIN:       (...a) => Math.min(...a),
    _SUM:       (...a) => a.reduce((s,x)=>s+Number(x),0),
    _SQRT:      n => Math.sqrt(n),
    _CEILING:   (n,s) => Math.ceil(n/s)*s,
    _FLOOR:     (n,s) => Math.floor(n/s)*s,
    _TEXT:      (v) => String(v),
    _VALUE:     t => Number(t),
    TRUE: true, FALSE: false,
  }

  try {
    const fn = new Function(...Object.keys(fns), `"use strict"; return (${jsExpr})`)
    const result = fn(...Object.values(fns))
    return { result: result === undefined ? '' : result, error: null }
  } catch(e) {
    return { result: null, error: e.message }
  }
}

// ── Function tooltip ───────────────────────────────────────────────
function FuncTooltip({ context }) {
  if (!context) return null
  const def = FUNCTIONS[context.name]
  if (!def) return null
  const argIdx = Math.min(context.argIndex, def.params.length - 1)
  return (
    <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, background:'#FFFDE7', border:'1px solid #C8C8C8', borderRadius:3, padding:'4px 10px', whiteSpace:'nowrap', fontSize:12, boxShadow:'0 2px 8px rgba(0,0,0,0.15)', fontFamily:'Segoe UI,system-ui,sans-serif', zIndex:20, pointerEvents:'none' }}>
      <span style={{ color:'#1D6FBF', fontWeight:600 }}>{context.name}</span>
      <span style={{ color:'#666' }}>(</span>
      {def.params.map((p,i) => (
        <span key={i}>
          {i > 0 && <span style={{ color:'#666' }}>, </span>}
          <span style={{ fontWeight:i===argIdx?700:400, color:i===argIdx?'#1D1D1D':'#888', textDecoration:i===argIdx?'underline':'none' }}>{p}</span>
        </span>
      ))}
      <span style={{ color:'#666' }}>)</span>
    </div>
  )
}

// ── Autocomplete dropdown ──────────────────────────────────────────
function AutoDropdown({ items, selected, onSelect, onHover }) {
  if (!items.length) return null
  return (
    <div style={{ position:'absolute', top:'calc(100% + 1px)', left:0, background:'#fff', border:'1px solid #C8C8C8', borderRadius:3, boxShadow:'0 4px 12px rgba(0,0,0,0.15)', minWidth:220, maxHeight:240, overflowY:'auto', zIndex:30, fontFamily:'Segoe UI,system-ui,sans-serif' }}>
      {items.map((item, i) => (
        <div key={item.name} onMouseDown={e=>{e.preventDefault();onSelect(item.name)}} onMouseEnter={()=>onHover(i)}
          style={{ padding:'5px 10px', cursor:'default', fontSize:12, background:i===selected?'#107C41':'transparent', color:i===selected?'#fff':'#1D1D1D', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:10, fontWeight:700, padding:'1px 4px', background:i===selected?'rgba(255,255,255,0.25)':'#E8F0FB', color:i===selected?'#fff':'#1D6FBF', borderRadius:2 }}>ƒ</span>
          <span style={{ fontWeight:600 }}>{item.name}</span>
          <span style={{ fontSize:11, color:i===selected?'rgba(255,255,255,0.75)':'#888', marginLeft:'auto' }}>{item.params.slice(0,2).join(', ')}{item.params.length>2?', ...':''}</span>
        </div>
      ))}
    </div>
  )
}

// ── Defined Names Panel ────────────────────────────────────────────
function DefinedNamesPanel({ names, onNamesChange, savedSets, onSave, onLoad }) {
  const [newName, setNewName]     = useState('')
  const [newVal, setNewVal]       = useState('')
  const [editId, setEditId]       = useState(null)
  const [editVal, setEditVal]     = useState('')
  const [saveTitle, setSaveTitle] = useState('')
  const [showSave, setShowSave]   = useState(false)
  const [nameError, setNameError] = useState('')

  const inp = { padding:'5px 8px', border:'1px solid #C8C8C8', borderRadius:3, fontSize:12, outline:'none', background:'#fff' }

  function addName() {
    const n = newName.trim()
    if (!n) return
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n)) { setNameError('Must start with a letter, letters/numbers/dots/underscores only'); return }
    setNameError('')
    onNamesChange(p => ({ ...p, [n]: newVal }))
    setNewName(''); setNewVal('')
  }

  function removeName(k) { onNamesChange(p => { const n={...p}; delete n[k]; return n }) }
  function startEdit(k)  { setEditId(k); setEditVal(names[k]) }
  function commitEdit(k) { onNamesChange(p => ({ ...p, [k]: editVal })); setEditId(null) }

  const entries = Object.entries(names)

  return (
    <div style={{ background:'#fff', border:'1px solid #C8C8C8', borderRadius:4, overflow:'hidden' }}>
      <div style={{ padding:'7px 12px', background:'#F0F0F0', borderBottom:'1px solid #C8C8C8', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:12, fontWeight:600, color:'#444' }}>Defined names</span>
        <div style={{ display:'flex', gap:6 }}>
          {savedSets.length > 0 && (
            <select onChange={e=>{ if(e.target.value){onLoad(e.target.value);e.target.value=''} }} style={{ ...inp, fontSize:11 }}>
              <option value=''>Load saved…</option>
              {savedSets.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          <button onClick={()=>setShowSave(s=>!s)} style={{ ...inp, cursor:'pointer', color:'#107C41', fontWeight:600, borderColor:'#A8D4B8' }}>💾 Save set</button>
        </div>
      </div>

      {showSave && (
        <div style={{ padding:'8px 12px', background:'#F8FFF8', borderBottom:'1px solid #E0E0E0', display:'flex', gap:8, alignItems:'center' }}>
          <input value={saveTitle} onChange={e=>setSaveTitle(e.target.value)} placeholder="Set name…"
            onKeyDown={e=>e.key==='Enter'&&saveTitle.trim()&&(onSave(saveTitle),setSaveTitle(''),setShowSave(false))}
            style={{ ...inp, flex:1 }} />
          <button onClick={()=>{if(saveTitle.trim()){onSave(saveTitle);setSaveTitle('');setShowSave(false)}}} style={{ ...inp, cursor:'pointer', background:'#107C41', color:'#fff', border:'none', fontWeight:600 }}>Save</button>
          <button onClick={()=>setShowSave(false)} style={{ ...inp, cursor:'pointer' }}>Cancel</button>
        </div>
      )}

      {entries.length > 0 && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', padding:'4px 12px', background:'#F8F8F8', borderBottom:'1px solid #E8E8E8' }}>
            {['Name','Value',''].map((h,i)=><div key={i} style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</div>)}
          </div>
          {entries.map(([k,v]) => (
            <div key={k} style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', padding:'4px 12px', borderBottom:'1px solid #F0F0F0', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#1D6FBF', fontFamily:'Consolas,monospace' }}>{k}</span>
              {editId === k ? (
                <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
                  onBlur={()=>commitEdit(k)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(k);if(e.key==='Escape')setEditId(null)}}
                  style={{ ...inp, width:'100%' }} />
              ) : (
                <span onClick={()=>startEdit(k)} style={{ fontSize:12, color:'#1D1D1D', fontFamily:'Consolas,monospace', cursor:'text', padding:'4px', borderRadius:2, border:'1px solid transparent' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#C8C8C8'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='transparent'}>
                  {v || <span style={{ color:'#C0C0C0' }}>empty</span>}
                </span>
              )}
              <button onClick={()=>removeName(k)} style={{ fontSize:13, background:'none', border:'none', cursor:'pointer', color:'#C0C0C0', lineHeight:1, padding:'0 4px' }}
                onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
                onMouseLeave={e=>e.currentTarget.style.color='#C0C0C0'}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding:'8px 12px', background:'#FAFAFA', borderTop:entries.length?'1px solid #F0F0F0':'none' }}>
        {nameError && <div style={{ fontSize:11, color:'#C00', marginBottom:6 }}>{nameError}</div>}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input value={newName} onChange={e=>{setNewName(e.target.value);setNameError('')}}
            placeholder="name" onKeyDown={e=>e.key==='Enter'&&newVal&&addName()}
            style={{ ...inp, width:120, fontFamily:'Consolas,monospace', fontWeight:600, color:'#1D6FBF' }} />
          <span style={{ color:'#888', fontSize:13 }}>=</span>
          <input value={newVal} onChange={e=>setNewVal(e.target.value)} placeholder="value or text"
            onKeyDown={e=>e.key==='Enter'&&newName.trim()&&addName()}
            style={{ ...inp, flex:1, fontFamily:'Consolas,monospace' }} />
          <button onClick={addName} style={{ ...inp, cursor:'pointer', background:'#1D6FBF', color:'#fff', border:'none', fontWeight:600, padding:'5px 12px' }}>Add</button>
        </div>
        <div style={{ fontSize:10, color:'#A0A0A0', marginTop:4 }}>Click a value to edit it inline</div>
      </div>
    </div>
  )
}

// ── Result display ─────────────────────────────────────────────────
function ResultDisplay({ formula, names }) {
  const { result, error } = evaluateFormula(formula, names)
  if (!formula.trim()) return null
  return (
    <div style={{ background:'#fff', border:'1px solid #C8C8C8', borderRadius:4, overflow:'hidden', marginBottom:12 }}>
      <div style={{ padding:'7px 12px', background:'#F0F0F0', borderBottom:'1px solid #C8C8C8', fontSize:12, fontWeight:600, color:'#444' }}>Result preview</div>
      <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:16 }}>
        {error ? (
          <div style={{ fontSize:13, color:'#C00', fontFamily:'Consolas,monospace' }}><span style={{ fontWeight:700 }}>Error: </span>{error}</div>
        ) : result === null ? (
          <div style={{ fontSize:12, color:'#888' }}>Unable to evaluate — check undefined names</div>
        ) : (
          <>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Output</div>
              <div style={{ fontSize:22, fontWeight:700, color:'#107C41', fontFamily:'Consolas,monospace' }}>
                {typeof result === 'boolean' ? result.toString().toUpperCase() : String(result)}
              </div>
              <div style={{ fontSize:11, color:'#888', marginTop:2 }}>
                Type: {typeof result === 'boolean' ? 'Boolean' : isNaN(result)||typeof result==='string' ? 'Text' : 'Number'}
              </div>
            </div>
            {Object.keys(names).length > 0 && (
              <div style={{ fontSize:11, color:'#888', borderLeft:'1px solid #E8E8E8', paddingLeft:16 }}>
                <div style={{ fontWeight:600, marginBottom:4 }}>With values:</div>
                {Object.entries(names).map(([k,v]) => (
                  <div key={k} style={{ fontFamily:'Consolas,monospace' }}>
                    <span style={{ color:'#1D6FBF', fontWeight:600 }}>{k}</span>
                    <span style={{ color:'#888' }}> = </span>
                    <span style={{ color:'#107C41' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────
function FormulaDashboard({ sets, loading, onNew, onOpen, onDelete }) {
  function fmtDate(dt) {
    const parts = new Intl.DateTimeFormat('en-US',{ timeZone:'Pacific/Auckland', day:'numeric', month:'short', year:'numeric' }).formatToParts(new Date(dt))
    const g = t => parts.find(p=>p.type===t)?.value||''
    return `${g('day')} ${g('month')} ${g('year')}`
  }
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:'#1D1D1D', margin:'0 0 2px', fontFamily:'Segoe UI,system-ui,sans-serif' }}>Formula Writer</h1>
          <p style={{ fontSize:12, color:'#888', margin:0, fontFamily:'Segoe UI,system-ui,sans-serif' }}>Click a formula to open it, or create a new one</p>
        </div>
        <button onClick={onNew} style={{ fontSize:13, fontWeight:600, padding:'8px 18px', borderRadius:4, border:'none', background:'#107C41', color:'#fff', cursor:'pointer', fontFamily:'Segoe UI,system-ui,sans-serif' }}>+ New formula</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#888', fontSize:13 }}>Loading…</div>
      ) : sets.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>ƒx</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#444', marginBottom:6 }}>No formulas yet</div>
          <div style={{ fontSize:13, color:'#888', marginBottom:20 }}>Create your first formula to get started</div>
          <button onClick={onNew} style={{ fontSize:13, fontWeight:600, padding:'8px 20px', borderRadius:4, border:'none', background:'#107C41', color:'#fff', cursor:'pointer' }}>+ New formula</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
          {sets.map(s => {
            const names = s.names ? (typeof s.names==='string' ? JSON.parse(s.names) : s.names) : {}
            const nameCount = Object.keys(names).length
            return (
              <div key={s.id} onClick={()=>onOpen(s)}
                style={{ background:'#fff', borderRadius:6, border:'1px solid #C8C8C8', padding:'16px 18px', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', transition:'all .12s', position:'relative' }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)';e.currentTarget.style.borderColor='#1D6FBF'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.06)';e.currentTarget.style.borderColor='#C8C8C8'}}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'#107C41', borderRadius:'6px 6px 0 0' }} />
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, marginTop:4 }}>
                  <span style={{ fontSize:11, color:'#888' }}>{fmtDate(s.created_at)}</span>
                  <button onClick={e=>{e.stopPropagation();onDelete(s.id)}}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#C8C8C8', fontSize:16, lineHeight:1, padding:'0 2px' }}
                    onMouseEnter={e=>{e.stopPropagation();e.currentTarget.style.color='#C00'}}
                    onMouseLeave={e=>e.currentTarget.style.color='#C8C8C8'}>×</button>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:'#1D1D1D', marginBottom:8 }}>{s.title}</div>
                {s.formula && (
                  <div style={{ fontSize:11, fontFamily:'Consolas,monospace', color:'#1D6FBF', background:'#F0F4FF', padding:'4px 8px', borderRadius:3, marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.formula}</div>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  {nameCount > 0 && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'#F0FAF4', color:'#107C41', border:'1px solid #A8D4B8' }}>{nameCount} name{nameCount!==1?'s':''}</span>}
                  {!s.formula && <span style={{ fontSize:11, color:'#C0C0C0' }}>No formula yet</span>}
                </div>
              </div>
            )
          })}
          <div onClick={onNew}
            style={{ background:'transparent', borderRadius:6, border:'2px dashed #C8C8C8', padding:'16px 18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', minHeight:120, transition:'all .12s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#107C41';e.currentTarget.style.color='#107C41'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='#C8C8C8';e.currentTarget.style.color='#888'}}>
            <div style={{ textAlign:'center', color:'inherit' }}>
              <div style={{ fontSize:24, marginBottom:4 }}>+</div>
              <div style={{ fontSize:13, fontWeight:600 }}>New formula</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────
export default function FormulaWriter() {
  const [view, setView]           = useState('dashboard')
  const [activeSet, setActiveSet] = useState(null)
  const [formula, setFormula]     = useState('')
  const [cursor, setCursor]       = useState(0)
  const [sugs, setSugs]           = useState([])
  const [selSug, setSelSug]       = useState(0)
  const [copied, setCopied]       = useState(false)
  const [names, setNames]         = useState({})
  const [savedSets, setSavedSets] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal]   = useState('Untitled')
  const inputRef  = useRef()
  const mirrorRef = useRef()

  useEffect(() => {
    supabase.from('formula_name_sets').select('*').order('created_at',{ascending:false})
      .then(({data}) => { setSavedSets(data||[]); setLoadingList(false) })
  }, [])

  useEffect(() => { setTitleVal(activeSet?.title || 'Untitled') }, [activeSet])

  // ── DB operations ──────────────────────────────────────────────
  async function saveSet(title) {
    const payload = { title: title || 'Untitled', names: JSON.stringify(names), formula }
    if (activeSet?.id) {
      const { data } = await supabase.from('formula_name_sets').update(payload).eq('id',activeSet.id).select().single()
      if (data) { setSavedSets(p=>p.map(s=>s.id===data.id?data:s)); setActiveSet(data) }
    } else {
      const { data } = await supabase.from('formula_name_sets').insert(payload).select().single()
      if (data) { setSavedSets(p=>[data,...p]); setActiveSet(data) }
    }
  }

  function loadSet(id) {
    const s = savedSets.find(x=>x.id===id)
    if (!s) return
    try { setNames(typeof s.names==='string' ? JSON.parse(s.names) : (s.names||{})) } catch { setNames({}) }
    if (s.formula) setFormula(s.formula)
  }

  async function deleteSet(id) {
    if (!confirm('Delete this formula set?')) return
    await supabase.from('formula_name_sets').delete().eq('id',id)
    setSavedSets(p=>p.filter(s=>s.id!==id))
    if (activeSet?.id === id) { setView('dashboard'); setActiveSet(null) }
  }

  // ── Navigation ─────────────────────────────────────────────────
  function openNew() {
    setActiveSet(null); setFormula(''); setNames({}); setTitleVal('Untitled')
    setView('editor')
    setTimeout(()=>inputRef.current?.focus(), 100)
  }

  function openSet(s) {
    setActiveSet(s)
    setFormula(s.formula || '')
    setTitleVal(s.title || 'Untitled')
    try { setNames(typeof s.names==='string' ? JSON.parse(s.names) : (s.names||{})) } catch { setNames({}) }
    setView('editor')
    setTimeout(()=>inputRef.current?.focus(), 100)
  }

  async function backToDashboard() {
    if (formula.trim() || Object.keys(names).length > 0) await saveSet(titleVal)
    setView('dashboard')
  }

  // ── Editor functions ───────────────────────────────────────────
  function copy() { navigator.clipboard?.writeText(formula); setCopied(true); setTimeout(()=>setCopied(false),1500) }

  function updateSugs(val, pos) {
    const before = val.slice(0,pos)
    const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/)
    if (!m || m[1].length < 1) { setSugs([]); return }
    const q = m[1].toUpperCase()
    setSugs(Object.entries(FUNCTIONS).filter(([k])=>k.startsWith(q)&&k!==q).slice(0,12).map(([k,v])=>({name:k,params:v.params})))
    setSelSug(0)
  }

  function handleChange(e) {
    const val = e.target.value, pos = e.target.selectionStart
    setFormula(val); setCursor(pos); updateSugs(val, pos)
    if (mirrorRef.current && inputRef.current) mirrorRef.current.scrollTop = inputRef.current.scrollTop
  }

  function handleSelect(e) { const pos=e.target.selectionStart; setCursor(pos); updateSugs(formula,pos) }

  function applySug(name) {
    const pos = inputRef.current?.selectionStart ?? cursor
    const before = formula.slice(0,pos), after = formula.slice(pos)
    const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)$/)
    if (!m) return
    const nb = before.slice(0,before.length-m[1].length)+name+'('
    const nf = nb+')'+after
    setFormula(nf); setSugs([])
    const nc = nb.length
    setTimeout(()=>{ inputRef.current?.focus(); inputRef.current?.setSelectionRange(nc,nc); setCursor(nc) },10)
  }

  function handleKey(e) {
    if (sugs.length) {
      if (e.key==='ArrowDown'){e.preventDefault();setSelSug(s=>Math.min(s+1,sugs.length-1));return}
      if (e.key==='ArrowUp'){e.preventDefault();setSelSug(s=>Math.max(s-1,0));return}
      if ((e.key==='Tab'||e.key==='Enter')&&sugs.length){e.preventDefault();applySug(sugs[selSug].name);return}
      if (e.key==='Escape'){setSugs([]);return}
    }
    if (e.key==='(') {
      e.preventDefault()
      const pos = inputRef.current.selectionStart
      const nf = formula.slice(0,pos)+'()'+formula.slice(pos)
      setFormula(nf); setSugs([])
      setTimeout(()=>{ inputRef.current.setSelectionRange(pos+1,pos+1); setCursor(pos+1) },0)
    }
  }

  // ── Dashboard view ─────────────────────────────────────────────
  if (view === 'dashboard') {
    return <FormulaDashboard sets={savedSets} loading={loadingList} onNew={openNew} onOpen={openSet} onDelete={deleteSet} />
  }

  // ── Editor view ────────────────────────────────────────────────
  const errors  = validate(formula)
  const context = formula ? getContext(formula, cursor) : null
  const isOk    = formula.trim() && !errors.length
  const mono    = { fontFamily:"'Consolas','Courier New',monospace", fontSize:14, lineHeight:'22px' }

  return (
    <div style={{ maxWidth:860, margin:'0 auto', fontFamily:'Segoe UI,system-ui,sans-serif' }}>
      {/* Back + title */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <button onClick={backToDashboard} style={{ fontSize:12, color:'#888', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, padding:'4px 0' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Formulas
        </button>
        <span style={{ color:'#C8C8C8' }}>›</span>
        {editingTitle ? (
          <input autoFocus value={titleVal} onChange={e=>setTitleVal(e.target.value)}
            onBlur={async()=>{setEditingTitle(false);await saveSet(titleVal)}}
            onKeyDown={e=>{if(e.key==='Enter'){setEditingTitle(false);saveSet(titleVal)}if(e.key==='Escape')setEditingTitle(false)}}
            style={{ fontSize:16, fontWeight:700, color:'#1D1D1D', border:'none', borderBottom:'2px solid #1D6FBF', outline:'none', background:'transparent', padding:'0 2px', minWidth:200 }} />
        ) : (
          <span onClick={()=>setEditingTitle(true)} title="Click to rename"
            style={{ fontSize:16, fontWeight:700, color:'#1D1D1D', cursor:'text' }}>{titleVal}</span>
        )}
        <div style={{ marginLeft:'auto' }}>
          <button onClick={()=>saveSet(titleVal)} style={{ fontSize:12, fontWeight:600, padding:'5px 14px', borderRadius:4, border:'1px solid #107C41', background:'#F0FAF4', color:'#107C41', cursor:'pointer' }}>💾 Save</button>
        </div>
      </div>

      {/* Formula bar */}
      <div style={{ background:'#fff', border:'1px solid #C8C8C8', borderRadius:4, marginBottom:12, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid #E8E8E8', padding:'0 10px', height:32, gap:10 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#888', minWidth:20 }}>ƒx</div>
          <div style={{ width:1, height:18, background:'#E0E0E0' }} />
          <div style={{ flex:1, fontSize:12, color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', ...mono }}>{formula || <span style={{ color:'#C0C0C0' }}>Enter formula…</span>}</div>
          <div style={{ display:'flex', gap:6 }}>
            {formula && <>
              <button onClick={copy} style={{ fontSize:11, padding:'3px 9px', border:'1px solid #C8C8C8', borderRadius:3, background:'#F5F5F5', cursor:'pointer', color:'#444' }}>{copied?'✓ Copied':'Copy'}</button>
              <button onClick={()=>{setFormula('');setSugs([])}} style={{ fontSize:11, padding:'3px 9px', border:'1px solid #C8C8C8', borderRadius:3, background:'#F5F5F5', cursor:'pointer', color:'#444' }}>Clear</button>
            </>}
          </div>
        </div>

        <div style={{ position:'relative', padding:'2px 0' }}>
          {/* colour mirror */}
          <div ref={mirrorRef} aria-hidden style={{ ...mono, position:'absolute', inset:0, padding:'8px 42px 8px 12px', whiteSpace:'pre-wrap', wordBreak:'break-all', pointerEvents:'none', userSelect:'none', overflow:'hidden' }}>
            {renderColored(formula)}{'\u200b'}
          </div>
          {/* textarea */}
          <textarea ref={inputRef} value={formula} onChange={handleChange} onKeyDown={handleKey} onSelect={handleSelect} onClick={handleSelect}
            rows={Math.max(2, formula.split('\n').length+1)} placeholder='=IF(Width=200,500,0)' spellCheck={false}
            style={{ ...mono, width:'100%', boxSizing:'border-box', padding:'8px 42px 8px 12px', minHeight:44, resize:'vertical', border:'none', outline:'none', background:'transparent', color:'transparent', caretColor:'#1D1D1D', position:'relative', zIndex:2 }} />
          {/* status icon */}
          <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', zIndex:3 }}>
            {formula.trim() && (errors.length
              ? <div title={errors[0].msg} style={{ width:18, height:18, borderRadius:'50%', background:'#E24B4A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#fff', fontWeight:700, cursor:'help' }}>!</div>
              : <div style={{ width:18, height:18, borderRadius:'50%', background:'#107C41', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#fff', fontWeight:700 }}>✓</div>
            )}
          </div>
          <FuncTooltip context={context} />
          <AutoDropdown items={sugs} selected={selSug} onSelect={applySug} onHover={setSelSug} />
        </div>

        {errors.length > 0 && (
          <div style={{ borderTop:'1px solid #FCDCDC', background:'#FEF2F2', padding:'5px 12px', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'#C00', fontWeight:600 }}>✗</span>
            <span style={{ fontSize:12, color:'#C00' }}>{errors[0].msg}</span>
          </div>
        )}
        {errors.length === 0 && formula.trim() && (
          <div style={{ borderTop:'1px solid #E0F0E8', background:'#F0FAF4', padding:'4px 12px' }}>
            <span style={{ fontSize:11, color:'#107C41', fontWeight:500 }}>✓ Formula syntax is valid</span>
          </div>
        )}
      </div>

      {/* Result */}
      {formula.trim() && <ResultDisplay formula={formula} names={names} />}

      {/* Defined names */}
      <div style={{ marginBottom:12 }}>
        <DefinedNamesPanel names={names} onNamesChange={setNames} savedSets={savedSets} onSave={saveSet} onLoad={loadSet} />
      </div>

      {/* Function reference */}
      <div style={{ background:'#fff', border:'1px solid #C8C8C8', borderRadius:4, overflow:'hidden', marginBottom:12 }}>
        <div style={{ padding:'7px 12px', background:'#F0F0F0', borderBottom:'1px solid #C8C8C8', fontSize:12, fontWeight:600, color:'#444' }}>Function reference — click to insert</div>
        {[
          { cat:'Logical',     fns:['IF','AND','OR','NOT','IFERROR'] },
          { cat:'Math',        fns:['SUM','ROUND','ROUNDUP','ROUNDDOWN','ABS','INT','MAX','MIN','CEILING','FLOOR','SQRT','MOD'] },
          { cat:'Text',        fns:['CONCATENATE','LEFT','RIGHT','MID','LEN','TRIM','UPPER','LOWER','TEXT','VALUE'] },
          { cat:'Lookup',      fns:['VLOOKUP','HLOOKUP','INDEX','MATCH','CHOOSE'] },
          { cat:'Microvellum', fns:['GETPART','GETMEMBER'] },
        ].map(({ cat, fns }) => (
          <div key={cat} style={{ display:'flex', alignItems:'baseline', borderBottom:'1px solid #F0F0F0', padding:'4px 0' }}>
            <div style={{ width:100, padding:'3px 12px', fontSize:11, fontWeight:600, color:'#888', flexShrink:0 }}>{cat}</div>
            <div style={{ flex:1, display:'flex', flexWrap:'wrap', gap:3, padding:'3px 6px' }}>
              {fns.map(fn => (
                <button key={fn} title={FUNCTIONS[fn]?.params.join(', ')}
                  onClick={() => {
                    const pos = inputRef.current?.selectionStart ?? formula.length
                    const nf  = formula.slice(0,pos)+fn+'()'+formula.slice(pos)
                    setFormula(nf); setSugs([])
                    const nc = pos+fn.length+1
                    setTimeout(()=>{ inputRef.current?.focus(); inputRef.current?.setSelectionRange(nc,nc); setCursor(nc) },10)
                  }}
                  style={{ fontSize:11, padding:'2px 7px', border:'1px solid #D0D0D0', borderRadius:3, background:'#FAFAFA', color:'#1D6FBF', cursor:'pointer', fontFamily:'Consolas,monospace', fontWeight:600 }}
                  onMouseEnter={e=>{e.currentTarget.style.background='#E8F0FB';e.currentTarget.style.borderColor='#1D6FBF'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#FAFAFA';e.currentTarget.style.borderColor='#D0D0D0'}}>
                  {fn}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bracket guide */}
      <div style={{ background:'#fff', border:'1px solid #C8C8C8', borderRadius:4, padding:'8px 12px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:600, color:'#888' }}>Bracket colours:</span>
        {BRACKET_COLORS.slice(0,5).map((c,i) => (
          <span key={i} style={{ fontSize:12, fontFamily:'Consolas,monospace', color:c, fontWeight:700 }}>( ) level {i+1}</span>
        ))}
      </div>
    </div>
  )
}
