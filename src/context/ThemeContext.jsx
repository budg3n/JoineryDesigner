import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} })

const STYLE_ID = 'joinery-dark-override'

// Sharesies-inspired dark palette
// Black bg, #1C1C1E cards, #2C2C2E elevated, white text
const DARK_CSS = `
  :root {
    color-scheme: dark;
  }

  html, body, #root {
    background: #000000 !important;
    color: #FFFFFF !important;
  }

  /* Layout */
  main { background: #000000 !important; }
  header { background: #0D0D0D !important; border-bottom: 1px solid #2C2C2E !important; }
  aside  { background: #0D0D0D !important; border-right: 1px solid #1C1C1E !important; }

  /* Universal element overrides — catches React inline styles */
  /* White backgrounds → card colour */
  *[style*="background: rgb(255, 255, 255)"],
  *[style*="background-color: rgb(255, 255, 255)"],
  *[style*="backgroundColor: rgb(255, 255, 255)"] {
    background-color: #1C1C1E !important;
    background: #1C1C1E !important;
  }

  /* Light grey page backgrounds */
  *[style*="background: rgb(240, 242, 245)"],
  *[style*="background: rgb(249, 250, 251)"],
  *[style*="background: rgb(243, 244, 246)"],
  *[style*="background: rgb(248, 250, 255)"],
  *[style*="background: rgb(248, 249, 255)"],
  *[style*="background: rgb(250, 250, 250)"],
  *[style*="background: rgb(245, 247, 255)"],
  *[style*="background: rgb(238, 239, 242)"],
  *[style*="background: rgb(244, 246, 249)"],
  *[style*="background: rgb(240, 244, 255)"],
  *[style*="background: rgb(250, 251, 255)"],
  *[style*="background: rgb(248, 248, 248)"] {
    background: #111111 !important;
  }

  /* Slightly elevated surfaces */
  *[style*="background: rgb(250, 250, 250)"],
  *[style*="background: rgb(248, 249, 255)"],
  *[style*="background: rgb(248, 250, 255)"] {
    background: #1C1C1E !important;
  }

  /* Dark text → white */
  *[style*="color: rgb(42, 48, 66)"],
  *[style*="color: rgb(55, 65, 81)"],
  *[style*="color: rgb(31, 41, 55)"],
  *[style*="color: rgb(17, 24, 39)"] {
    color: #FFFFFF !important;
  }

  /* Medium grey text → light grey */
  *[style*="color: rgb(107, 114, 128)"],
  *[style*="color: rgb(75, 85, 99)"],
  *[style*="color: rgb(100, 116, 139)"],
  *[style*="color: rgb(71, 85, 105)"] {
    color: #8E8E93 !important;
  }

  /* Light grey / muted text */
  *[style*="color: rgb(156, 163, 175)"],
  *[style*="color: rgb(196, 201, 212)"],
  *[style*="color: rgb(174, 183, 194)"],
  *[style*="color: rgb(148, 163, 184)"] {
    color: #636366 !important;
  }

  /* Border colours */
  *[style*="border: 1px solid rgb(232, 236, 240)"],
  *[style*="border-bottom: 1px solid rgb(232, 236, 240)"],
  *[style*="border-top: 1px solid rgb(232, 236, 240)"],
  *[style*="border-left: 1px solid rgb(232, 236, 240)"],
  *[style*="border-right: 1px solid rgb(232, 236, 240)"],
  *[style*="border: 1px solid rgb(243, 244, 246)"],
  *[style*="border-bottom: 1px solid rgb(243, 244, 246)"],
  *[style*="border: 1px solid rgb(221, 227, 236)"],
  *[style*="border-bottom: 1px solid rgb(249, 250, 251)"],
  *[style*="border-top: 1px solid rgb(249, 250, 251)"],
  *[style*="border: 1px solid rgb(196, 212, 248)"],
  *[style*="border: 1px solid rgb(209, 213, 219)"] {
    border-color: #2C2C2E !important;
  }

  /* Inputs, textareas, selects */
  input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
  textarea,
  select {
    background: #1C1C1E !important;
    border-color: #3A3A3C !important;
    color: #FFFFFF !important;
    caret-color: #7B9FFF;
  }
  input::placeholder, textarea::placeholder { color: #636366 !important; }
  select option { background: #1C1C1E !important; color: #FFFFFF !important; }

  /* Tailwind utility classes */
  .bg-white, [class*="bg-white"] { background-color: #1C1C1E !important; }
  .bg-gray-50 { background-color: #111111 !important; }
  .bg-gray-100 { background-color: #1C1C1E !important; }
  .text-gray-900, .text-gray-800 { color: #FFFFFF !important; }
  .text-gray-600, .text-gray-700 { color: #8E8E93 !important; }
  .text-gray-400, .text-gray-500 { color: #636366 !important; }
  .border-gray-200, .border-gray-100 { border-color: #2C2C2E !important; }
  .card { background: #1C1C1E !important; border-color: #2C2C2E !important; }
  .input { background: #1C1C1E !important; border-color: #3A3A3C !important; color: #fff !important; }
  .btn { background: #2C2C2E !important; border-color: #3A3A3C !important; color: #fff !important; }

  /* Shadows in dark mode */
  *[style*="box-shadow"] { box-shadow: 0 2px 12px rgba(0,0,0,0.5) !important; }

  /* Scrollbars */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #000000; }
  ::-webkit-scrollbar-thumb { background: #3A3A3C; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #48484A; }

  /* ── NEON ACCENTS — remap every accent colour used across the app ── */
  /* Blue (#5B8AF0 / primary actions) → neon electric blue */
  *[style*="rgb(91, 138, 240)" i] { color: #00D4FF !important; }
  *[style*="background: rgb(91, 138, 240)"],
  *[style*="background-color: rgb(91, 138, 240)"] { background: #00D4FF !important; color: #000 !important; }
  *[style*="border: 1px solid rgb(91, 138, 240)"],
  *[style*="border-color: rgb(91, 138, 240)"] { border-color: #00D4FF !important; }

  /* Secondary blue (#3B82F6 / #6C9EFF) → neon blue */
  *[style*="color: rgb(59, 130, 246)"],
  *[style*="color: rgb(108, 158, 255)"],
  *[style*="color: rgb(123, 159, 255)"] { color: #00D4FF !important; }
  *[style*="background: rgb(59, 130, 246)"],
  *[style*="background: rgb(108, 158, 255)"] { background: #00D4FF !important; color: #000 !important; }

  /* Green (#1D9E75 / #10B981 / success) → neon green */
  *[style*="color: rgb(29, 158, 117)"],
  *[style*="color: rgb(16, 185, 129)"],
  *[style*="color: rgb(6, 95, 70)"],
  *[style*="color: rgb(22, 101, 52)"],
  *[style*="color: rgb(52, 199, 89)"] { color: #39FF14 !important; }
  *[style*="background: rgb(29, 158, 117)"],
  *[style*="background: rgb(16, 185, 129)"] { background: #39FF14 !important; color: #000 !important; }
  *[style*="background: rgb(236, 253, 245)"],
  *[style*="background: rgb(220, 252, 231)"],
  *[style*="background: rgb(240, 253, 244)"] { background: rgba(57,255,20,0.12) !important; }

  /* Red (#E24B4A / #FF453A / danger) → neon red/pink */
  *[style*="color: rgb(226, 75, 74)"],
  *[style*="color: rgb(255, 69, 58)"],
  *[style*="color: rgb(153, 27, 27)"],
  *[style*="color: rgb(220, 38, 38)"] { color: #FF2E63 !important; }
  *[style*="background: rgb(226, 75, 74)"],
  *[style*="background: rgb(255, 69, 58)"] { background: #FF2E63 !important; color: #000 !important; }
  *[style*="background: rgb(254, 242, 242)"],
  *[style*="background: rgb(254, 226, 226)"],
  *[style*="background: rgb(255, 245, 245)"] { background: rgba(255,46,99,0.12) !important; }

  /* Orange (#F97316 / #FF9F0A / warning) → neon orange */
  *[style*="color: rgb(249, 115, 22)"],
  *[style*="color: rgb(255, 159, 10)"],
  *[style*="color: rgb(194, 65, 12)"],
  *[style*="color: rgb(133, 77, 14)"],
  *[style*="color: rgb(239, 159, 39)"] { color: #FF9100 !important; }
  *[style*="background: rgb(249, 115, 22)"],
  *[style*="background: rgb(255, 159, 10)"] { background: #FF9100 !important; color: #000 !important; }
  *[style*="background: rgb(255, 247, 237)"],
  *[style*="background: rgb(254, 249, 195)"],
  *[style*="background: rgb(253, 230, 138)"] { background: rgba(255,145,0,0.12) !important; }

  /* Purple (#8B5CF6 / #7F77DD) → neon magenta/purple */
  *[style*="color: rgb(139, 92, 246)"],
  *[style*="color: rgb(127, 119, 221)"],
  *[style*="color: rgb(55, 48, 163)"] { color: #D946EF !important; }
  *[style*="background: rgb(139, 92, 246)"],
  *[style*="background: rgb(127, 119, 221)"] { background: #D946EF !important; color: #000 !important; }
  *[style*="background: rgb(245, 243, 255)"],
  *[style*="background: rgb(238, 242, 255)"] { background: rgba(217,70,239,0.12) !important; }

  /* Pink (#EC4899) → hot neon pink */
  *[style*="color: rgb(236, 72, 153)"] { color: #FF10F0 !important; }
  *[style*="background: rgb(236, 72, 153)"] { background: #FF10F0 !important; color: #000 !important; }

  /* Yellow/amber → neon yellow */
  *[style*="color: rgb(234, 179, 8)"],
  *[style*="color: rgb(217, 119, 6)"] { color: #FFEE00 !important; }
  *[style*="background: rgb(234, 179, 8)"] { background: #FFEE00 !important; color: #000 !important; }

  /* Cyan/teal → neon cyan */
  *[style*="color: rgb(6, 182, 212)"],
  *[style*="color: rgb(20, 184, 166)"] { color: #00FFE5 !important; }
  *[style*="background: rgb(6, 182, 212)"] { background: #00FFE5 !important; color: #000 !important; }

  /* General brightness boost on any remaining saturated background accents */
  *[style*="background: rgb(91, 138, 240)"],
  *[style*="background: rgb(29, 158, 117)"],
  *[style*="background: rgb(226, 75, 74)"],
  *[style*="background: rgb(249, 115, 22)"],
  *[style*="background: rgb(139, 92, 246)"],
  *[style*="background: rgb(236, 72, 153)"] {
    filter: saturate(1.6) brightness(1.15);
  }

  /* Neon glow on buttons/badges using accent backgrounds */
  button[style*="background: rgb(91, 138, 240)"],
  button[style*="background: rgb(29, 158, 117)"],
  button[style*="background: rgb(226, 75, 74)"] {
    box-shadow: 0 0 12px currentColor, 0 0 4px rgba(255,255,255,0.3) !important;
  }
`

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('joinery_theme') || 'light' } catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('joinery_theme', theme) } catch {}

    let el = document.getElementById(STYLE_ID)
    if (theme === 'dark') {
      if (!el) {
        el = document.createElement('style')
        el.id = STYLE_ID
        document.head.appendChild(el)
      }
      el.textContent = DARK_CSS
    } else {
      if (el) el.remove()
    }
  }, [theme])

  const setTheme = t => setThemeState(t)
  const toggleTheme = () => setThemeState(t => t === 'light' ? 'dark' : 'light')

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }

