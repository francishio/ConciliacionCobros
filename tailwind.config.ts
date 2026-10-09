import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Naranja de marca HIOPOS (look & feel HIOPOS Analytics).
        hio: {
          DEFAULT: '#ef7d18',
          50: '#fef5ea',
          100: '#fde8cf',
          200: '#fbcd99',
          300: '#f8b26a',
          400: '#f59544',
          500: '#ef7d18',
          600: '#d96c0c',
          700: '#b3560b',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
