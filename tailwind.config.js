export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#5B8AF0', dark: '#4A79DF', light: '#EEF2FF' },
        navy:  { DEFAULT: '#2A3042', light: '#353C52', lighter: '#424A60' },
        surface: '#F0F2F5',
      },
    },
  },
  plugins: [],
}
