/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/renderer/**/*.{js,ts,jsx,tsx}", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        background: '#0f0f1a',
        surface: '#1a1a2e',
        'surface-light': '#252542',
        'surface-hover': '#2d2d4a',
        primary: '#00d9ff',
        'primary-dark': '#00a8cc',
        secondary: '#9d4edd',
        'secondary-dark': '#7b2cbf',
        accent: '#ff6b9d',
        success: '#00ff88',
        warning: '#ffcc00',
        error: '#ff4757',
        text: '#e8e8f0',
        'text-muted': '#a0a0b8',
        border: '#3a3a5a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(0, 217, 255, 0.3)',
        'glow-secondary': '0 0 20px rgba(157, 78, 221, 0.3)',
        'glow-success': '0 0 20px rgba(0, 255, 136, 0.3)',
        'glow-error': '0 0 20px rgba(255, 71, 87, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'breathing': 'breathing 2s ease-in-out infinite',
        'wave': 'wave 1.5s ease-in-out infinite',
      },
      keyframes: {
        breathing: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 20px rgba(0, 217, 255, 0.3)' },
          '50%': { opacity: '0.7', boxShadow: '0 0 40px rgba(0, 217, 255, 0.6)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
};
