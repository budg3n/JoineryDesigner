import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import BackButton from '../components/BackButton'

// All available fields from an order row
const AVAILABLE_FIELDS = [
  { key:'item',       label:'Name',        example:'Supreme Oak' },
  { key:'supplier',   label:'Supplier',    example:'Laminex' },
  { key:'panel_type', label:'Panel type',  example:'MDF' },
  { key:'thickness',  label:'Thickness',   example:'18' },
  { key:'colour',     label:'Colour',      example:'White' },
  { key:'finish',     label:'Finish',      example:'Velvet' },
  { key:'dimensions', label:'Dimensions',  example:'2440×1220' },
  { key:'sku',        label:'SKU',         example:'LX-1234' },
  { key:'qty',        label:'Qty',         example:'4' },
  { key:'unit',       label:'Unit',        example:'sheets' },
]

const SEPARATORS = [
  { value:' ',   label:'Space' },
  { value:' - ', label:'Dash ( - )' },
  { value:', ',  label:'Comma (, )' },
  { value:' | ', label:'Pipe ( | )' },
  { value:' / ', label:'Slash ( / )' },
]

function FieldToken({ field, suffix, onRemove, onSuffixChange, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [editSuffix, setEditSuffix] = useState(false)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'#fff', borderRadius:10, border:'1px solid #E8ECF0', marginBottom:6 }}>
      {/* drag handle */}
      <div style={{ color:'#C4C9D4', fontSize:14, cursor:'grab', flexShrink:0 }}>⠿</div>
      {/* field pill */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'#EEF2FF', color:'#3730A3', border:'1px solid #C4D4F8', whiteSpace:'nowrap' }}>
          {field.label}
        </span>
        {/* suffix */}
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:11, color:'#9CA3AF' }}>suffix:</span>
          {editSuffix ? (
            <input autoFocus value={suffix} onChange={e=>onSuffixChange(e.target.value)}
              onBlur={()=>setEditSuffix(false)} onKeyDown={e=>e.key==='Enter'&&setEditSuffix(false)}
              style={{ width:60, fontSize:12, border:'1px solid #DDE3EC', borderRadius:6, padding:'2px 6px', outline:'none' }} />
          ) : (
            <span onClick={()=>setEditSuffix(true)}
              style={{ fontSize:12, fontWeight:600, color: suffix?'#2A3042':'#C4C9D4', padding:'2px 8px', borderRadius:6, border:'1px dashed #DDE3EC', cursor:'text', minWidth:30, textAlign:'center' }}>
              {suffix || <span style={{color:'#D1D5DB'}}>none</span>}
            </span>
          )}
        </div>
        <span style={{ fontSize:11, color:'#9CA3AF' }}>example: <span style={{ color:'#5B8AF0', fontWeight:600' }}>{field.example}{suffix}</span></span>
      </div>
      {/* move up/down */}
      <div style={{ display:'flex', gap:2, flexShrink:0 }}>
        <button onClick={onMoveUp} disabled={isFirst}
          style={{ background:'none', border:'none', cursor:isFirst?'not-allowed':'pointer', color:isFirst?'#E8ECF0':'#9CA3AF', fontSize:14, lineHeight:1, padding:'2px 4px' }}>↑</button>
        <button onClick={onMoveDown} disabled={isLast}
          style={{ background:'none', border:'none', cursor:isLast?'not-allowed':'pointer', color:isLast?'#E8ECF0':'#9CA3AF', fontSize:14, lineHeight:1, padding:'2px 4px' }}>↓</button>
      </div>
      <button onClick={onRemove}
        style={{ background:'none', border:'none', cursor:'pointer', color:'#D1D5DB', fontSize:16, lineHeight:1, flexShrink:0 }}
        onMouseEnter={e=>e.currentTarget.style.color='#E24B4A'}
        onMouseLeave={e=>e.currentTarget.style.color='#D1D5DB'}>×</button>
    </div>
  )
}

// Build preview from token config
export function buildDescription(tokens, separator, row) {
  const parts = tokens
    .map(t => {
      const val = row[t.key]
      if (!val || !String(val).trim()) return null
      return String(val).trim() + (t.suffix || '')
    })
    .filter(Boolean)
  return parts.join(separator)
}

export default function CopyFormat() {
  const toast = useToast()
  const [tokens,    setTokens]    = useState([]) // [{key, suffix}]
  const [separator, setSeparator] = useState(' ')
  const [loading,   setLoading]   = useState(true)
  const [saved,     setSaved]     = useState(false)

  // Load saved config
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key','copy_format').maybeSingle()
      .then(({data}) => {
        if (data?.value) {
          const cfg = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
          setTokens(cfg.tokens || [])
          setSeparator(cfg.separator || ' ')
        } else {
          // Default config
          setTokens([
            { key:'thickness', suffix:'mm' },
            { key:'colour',    suffix:'' },
            { key:'finish',    suffix:'' },
          ])
        }
        setLoading(false)
      })
  }, [])

  async function saveConfig() {
    const cfg = { tokens, separator }
    await supabase.from('app_settings').upsert({ key:'copy_format', value: JSON.stringify(cfg) }, { onConflict:'key' })
    toast('Format saved ✓')
    setSaved(true)
    setTimeout(()=>setSaved(false), 2000)
  }

  function addField(key) {
    if (tokens.find(t=>t.key===key)) { toast('Already added','error'); return }
    setTokens(p=>[...p, { key, suffix:'' }])
  }
  function removeField(i) { setTokens(p=>p.filter((_,j)=>j!==i)) }
  function setSuffix(i, suffix) { setTokens(p=>p.map((t,j)=>j===i?{...t,suffix}:t)) }
  function moveUp(i)   { if(i===0) return; setTokens(p=>{ const n=[...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n }) }
  function moveDown(i) { if(i===tokens.length-1) return; setTokens(p=>{ const n=[...p]; [n[i],n[i+1]]=[n[i+1],n[i]]; return n }) }

  // Preview
  const sampleRow = Object.fromEntries(AVAILABLE_FIELDS.map(f=>[f.key,f.example]))
  const preview   = buildDescription(tokens, separator, sampleRow)

  const unusedFields = AVAILABLE_FIELDS.filter(f=>!tokens.find(t=>t.key===f.key))

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:'60px 0'}}><div className="spinner"/></div>

  return (
    <div>
      <BackButton to="/settings" label="Settings" />
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:'#2A3042',margin:'0 0 2px'}}>Copy description format</h1>
          <p style={{fontSize:13,color:'#9CA3AF',margin:0}}>Configure what gets copied when you click the copy button on an order row</p>
        </div>
        <button onClick={saveConfig}
          style={{fontSize:13,fontWeight:700,padding:'8px 18px',borderRadius:9,border:'none',background:saved?'#1D9E75':'#5B8AF0',color:'#fff',cursor:'pointer',transition:'background .2s'}}>
          {saved ? '✓ Saved' : 'Save format'}
        </button>
      </div>

      {/* live preview */}
      <div style={{background:'#1e1e2e',borderRadius:12,padding:'16px 20px',marginBottom:24}}>
        <div style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Preview</div>
        <div style={{fontSize:18,fontWeight:700,color:'#A5F3FC',fontFamily:'monospace',letterSpacing:'.02em',wordBreak:'break-all'}}>
          {preview || <span style={{color:'rgba(255,255,255,0.2)'}}>Add fields below to build the format…</span>}
        </div>
      </div>

      {/* separator */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8ECF0',padding:'14px 16px',marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:'#6B7280',marginBottom:10,textTransform:'uppercase',letterSpacing:'.05em'}}>Field separator</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {SEPARATORS.map(s=>(
            <button key={s.value} onClick={()=>setSeparator(s.value)}
              style={{fontSize:12,fontWeight:600,padding:'6px 14px',borderRadius:20,border:`1.5px solid ${separator===s.value?'#5B8AF0':'#E8ECF0'}`,background:separator===s.value?'#EEF2FF':'#fff',color:separator===s.value?'#3730A3':'#6B7280',cursor:'pointer'}}>
              {s.label}
            </button>
          ))}
          {/* custom separator */}
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:12,color:'#9CA3AF'}}>Custom:</span>
            <input value={!SEPARATORS.find(s=>s.value===separator)?separator:''} onChange={e=>setSeparator(e.target.value)}
              placeholder="e.g. •"
              style={{width:50,padding:'5px 8px',border:'1px solid #DDE3EC',borderRadius:8,fontSize:12,outline:'none',textAlign:'center'}} />
          </div>
        </div>
      </div>

      {/* field tokens */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #E8ECF0',padding:'14px 16px',marginBottom:16}}>
        <div style={{fontSize:12,fontWeight:700,color:'#6B7280',marginBottom:12,textTransform:'uppercase',letterSpacing:'.05em'}}>Fields in order</div>
        {tokens.length === 0 && (
          <div style={{textAlign:'center',padding:'16px 0',color:'#C4C9D4',fontSize:13}}>No fields added — pick from below</div>
        )}
        {tokens.map((t,i)=>{
          const field = AVAILABLE_FIELDS.find(f=>f.key===t.key)
          if (!field) return null
          return (
            <FieldToken key={t.key} field={field} suffix={t.suffix}
              isFirst={i===0} isLast={i===tokens.length-1}
              onRemove={()=>removeField(i)}
              onSuffixChange={v=>setSuffix(i,v)}
              onMoveUp={()=>moveUp(i)} onMoveDown={()=>moveDown(i)} />
          )
        })}
      </div>

      {/* add fields */}
      {unusedFields.length > 0 && (
        <div style={{background:'#F9FAFB',borderRadius:12,border:'1px solid #E8ECF0',padding:'14px 16px'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#6B7280',marginBottom:10,textTransform:'uppercase',letterSpacing:'.05em'}}>Add fields</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {unusedFields.map(f=>(
              <button key={f.key} onClick={()=>addField(f.key)}
                style={{fontSize:12,fontWeight:600,padding:'6px 14px',borderRadius:20,border:'1px solid #E8ECF0',background:'#fff',color:'#374151',cursor:'pointer',display:'flex',alignItems:'center',gap:6,transition:'all .1s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='#5B8AF0';e.currentTarget.style.color='#3730A3';e.currentTarget.style.background='#EEF2FF'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='#E8ECF0';e.currentTarget.style.color='#374151';e.currentTarget.style.background='#fff'}}>
                <span style={{fontSize:14,lineHeight:1}}>+</span> {f.label}
                <span style={{fontSize:10,color:'#9CA3AF'}}>({f.example})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
