// NZ Time formatter - v10
export function fmtNZTime(dt) {
  const d = new Date(dt)
  // May(4)-Sep(8) = NZST UTC+12, rest = NZDT UTC+13
  const off = (d.getUTCMonth() >= 4 && d.getUTCMonth() <= 8) ? 12 : 13
  const nz = new Date(d.getTime() + off * 3600000)
  const H = nz.getUTCHours()
  return nz.getUTCDate() + ' ' +
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][nz.getUTCMonth()] +
    ', ' + (H % 12 || 12) + ':' + String(nz.getUTCMinutes()).padStart(2,'0') +
    ' ' + (H < 12 ? 'am' : 'pm')
}
