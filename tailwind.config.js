/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#E6F1FB',
          100: '#B5D4F4',
          400: '#378ADD',
          600: '#185FA5',
          800: '#0C447C',
        },
        teal: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          400: '#1D9E75',
          600: '#0F6E56',
          800: '#085041',
        },
        amber: {
          50:  '#FAEEDA',
          100: '#FAC775',
          400: '#EF9F27',
          600: '#854F0B',
        },
        danger: {
          50:  '#FCEBEB',
          100: '#F09595',
          400: '#E24B4A',
          600: '#A32D2D',
        },
      },
    },
  },
  plugins: [],
}
