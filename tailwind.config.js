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
          900: '#0d0f12',
          800: '#14181f',
          700: '#1e2430',
          600: '#2b3344',
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
