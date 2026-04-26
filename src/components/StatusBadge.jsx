const MAP = {
  'In progress': 'badge-active',
  'Review':      'badge-review',
  'Complete':    'badge-done',
  'On hold':     'badge-hold',
}

export default function StatusBadge({ status }) {
  return <span className={MAP[status] || 'badge-hold'}>{status}</span>
}
