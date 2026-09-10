/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: 'rgb(var(--color-dark-950) / <alpha-value>)',
          900: 'rgb(var(--color-dark-900) / <alpha-value>)',
          850: 'rgb(var(--color-dark-850) / <alpha-value>)',
          800: 'rgb(var(--color-dark-800) / <alpha-value>)',
          750: 'rgb(var(--color-dark-750) / <alpha-value>)',
          700: 'rgb(var(--color-dark-700) / <alpha-value>)',
          650: 'rgb(var(--color-dark-650) / <alpha-value>)',
          600: 'rgb(var(--color-dark-600) / <alpha-value>)',
        },
        slate: {
          50: 'rgb(var(--color-slate-50) / <alpha-value>)',
          100: 'rgb(var(--color-slate-100) / <alpha-value>)',
          200: 'rgb(var(--color-slate-200) / <alpha-value>)',
          300: 'rgb(var(--color-slate-300) / <alpha-value>)',
          400: 'rgb(var(--color-slate-400) / <alpha-value>)',
          500: 'rgb(var(--color-slate-500) / <alpha-value>)',
          600: 'rgb(var(--color-slate-600) / <alpha-value>)',
          700: 'rgb(var(--color-slate-700) / <alpha-value>)',
          800: 'rgb(var(--color-slate-800) / <alpha-value>)',
          900: 'rgb(var(--color-slate-900) / <alpha-value>)',
          950: 'rgb(var(--color-slate-950) / <alpha-value>)',
        },
        brand: {
          500: '#3b82f6',
          600: '#2563eb',
        },
        triage: {
          pick: '#10b981',
          reject: '#ef4444',
          star: '#f59e0b',
        }
      }
    },
  },
  plugins: [],
}
