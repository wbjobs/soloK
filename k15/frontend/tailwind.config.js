/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sonar: {
          bg: '#0a1628',
          panel: '#122240',
          border: '#1e3a5f',
          accent: '#00d4ff',
          success: '#00ff88',
          warning: '#ffaa00',
          danger: '#ff4466',
          shipwreck: '#e74c3c',
          pipeline: '#27ae60',
          reef: '#f39c12',
          fish: '#3498db',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
