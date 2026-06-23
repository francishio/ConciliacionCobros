import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: { DEFAULT: '#0f766e', oscuro: '#0b5650' }, // teal sobrio
      },
    },
  },
  plugins: [],
}

export default config
