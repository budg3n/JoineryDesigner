const MAP = {
  'In progress': { bg:'#EEF2FF', color:'#3730A3' },
  'Review':      { bg:'#FEF3C7', color:'#92400E' },
  'Complete':    { bg:'#ECFDF5', color:'#065F46' },
  'On hold':     { bg:'#F3F4F6', color:'#6B7280' },
  'Submitted for approval': { bg:'#FDF4FF', color:'#7E22CE' },
}
export default function StatusBadge({ status }) {
  const s = MAP[status] || MAP['On hold']
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {status}
    </span>
  )
}
