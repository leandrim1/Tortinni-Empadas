/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Massa dourada / forno
        gold: {
          50: '#fffaeb',
          100: '#fff2c6',
          200: '#ffe388',
          300: '#ffd04a',
          400: '#ffbc20',
          500: '#f9a106',
          600: '#dd7a02',
          700: '#b75506',
          800: '#94420c',
          900: '#7a370d',
        },
        // Verde da marca
        brand: {
          50: '#edfbf3',
          100: '#d3f5e1',
          200: '#aae9c7',
          300: '#73d7a6',
          400: '#3cbc81',
          500: '#19a167',
          600: '#0c8152',
          700: '#0a6744',
          800: '#0a5238',
          900: '#093f2d',
          950: '#04241a',
        },
        // Base escura (quase preta esverdeada)
        night: {
          800: '#15201b',
          900: '#0d1612',
          950: '#070d0a',
        },
        cream: '#fdf8ee',
        crust: '#c2410c',
      },
      fontFamily: {
        display: ['"Baloo 2"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem' },
      height: { 13: '3.25rem' },
      boxShadow: {
        card: '0 2px 10px -2px rgb(7 13 10 / 0.10), 0 8px 24px -12px rgb(7 13 10 / 0.18)',
        lift: '0 10px 30px -10px rgb(7 13 10 / 0.35)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(.96)' }, '100%': { opacity: '1', transform: 'none' } },
        'slide-left': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'scale-in': 'scale-in .18s ease-out both',
        'slide-left': 'slide-left .25s ease-out both',
      },
    },
  },
  plugins: [],
};
