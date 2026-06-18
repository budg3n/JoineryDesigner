import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} })

const DARK_STYLE_ID = 'joinery-dark-mode'

const DARK_CSS = `
  body, #root { background: #000000 !important; color: #ffffff !important; }
  main { background: #000000 !important; }
  header { background: #0D0D0D !important; border-color: #2A2A2A !important; }
  aside, nav { background: #0A0A0A !important; border-color: #2A2A2A !important; }

  /* All divs/sections that use white or light grey inline backgrounds */
  div[style*="background: rgb(255, 255, 255)"],
  div[style*="background: white"],
  div[style*="background: #fff"],
  div[style*="background: #ffffff"],
  div[style*="background: #FFFFFF"],
  div[style*="background: rgb(249, 250, 251)"],
  div[style*="background: rgb(243, 244, 246)"],
  div[style*="background: rgb(240, 242, 245)"],
  div[style*="background: rgb(248, 250, 255)"],
  div[style*="background: rgb(248, 249, 255)"],
  div[style*="background: rgb(250, 250, 250)"],
  div[style*="background: rgb(245, 247, 255)"],
  div[style*="background: rgb(238, 239, 242)"],
  div[style*="background: rgb(244, 246, 249)"],
  section[style*="background: rgb(255, 255, 255)"],
  section[style*="background: white"],
  li[style*="background: rgb(255, 255, 255)"],
  td[style*="background: rgb(255, 255, 255)"],
  tr[style*="background: rgb(255, 255, 255)"],
  tr[style*="background: rgb(249, 250, 251)"],
  tr[style*="background: rgb(248, 250, 255)"] { background: #1A1A1A !important; }

  div[style*="background: rgb(249, 250, 251)"],
  div[style*="background: rgb(243, 244, 246)"],
  div[style*="background: rgb(240, 242, 245)"],
  div[style*="background: rgb(248, 250, 255)"],
  div[style*="background: rgb(248, 249, 255)"],
  div[style*="background: rgb(238, 239, 242)"] { background: #111111 !important; }

  /* Borders */
  div[style*="border: 1px solid rgb(232, 236, 240)"],
  div[style*="border-bottom: 1px solid rgb(232, 236, 240)"],
  div[style*="border-bottom: 1px solid rgb(243, 244, 246)"],
  div[style*="border-bottom: 1px solid rgb(249, 250, 251)"],
  div[style*="border-top: 1px solid rgb(232, 236, 240)"] { border-color: #2A2A2A !important; }

  /* Text colours */
  div[style*="color: rgb(42, 48, 66)"],
  span[style*="color: rgb(42, 48, 66)"],
  div[style*="color: rgb(55, 65, 81)"],
  span[style*="color: rgb(55, 65, 81)"] { color: #FFFFFF !important; }

  div[style*="color: rgb(107, 114, 128)"],
  span[style*="color: rgb(107, 114, 128)"] { color: #A0A0A0 !important; }

  div[style*="color: rgb(156, 163, 175)"],
  span[style*="color: rgb(156, 163, 175)"] { color: #606060 !important; }

  /* Inputs */
  input, textarea, select {
    background: #222222 !important;
    border-color: #333333 !important;
    color: #ffffff !important;
  }
  input::placeholder, textarea::placeholder { color: #606060 !important; }
  select option { background: #222222 !important; color: #ffffff !important; }

  /* Tailwind classes */
  .bg-white { background-color: #1A1A1A !important; }
  .card { background: #1A1A1A !important; border-color: #2A2A2A !important; }
  .input { background: #222222 !important; border-color: #333333 !important; color: #fff !important; }
  .btn { background: #222222 !important; border-color: #333333 !important; color: #fff !important; }
  .border-[#E8ECF0] { border-color: #2A2A2A !important; }

  /* Scrollbars */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: #000000; }
  ::-webkit-scrollbar-thumb { background: #333333; border-radius: 3px; }
`

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('joinery_theme') || 'light' } catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('joinery_theme', theme) } catch {}

    // Inject/remove aggressive dark mode style tag
    let el = document.getElementById(DARK_STYLE_ID)
    if (theme === 'dark') {
      if (!el) {
        el = document.createElement('style')
        el.id = DARK_STYLE_ID
        document.head.appendChild(el)
      }
      el.textContent = DARK_CSS
    } else {
      if (el) el.remove()
    }
  }, [theme])

  function setTheme(t) { setThemeState(t) }
  function toggleTheme() { setThemeState(t => t === 'light' ? 'dark' : 'light') }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }
