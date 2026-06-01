/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg:      'hsl(var(--brand-bg) / <alpha-value>)',
          surface: 'hsl(var(--brand-surface) / <alpha-value>)',
          card:    'hsl(var(--brand-card) / <alpha-value>)',
          border:  'hsl(var(--brand-border) / <alpha-value>)',
          accent:  'hsl(var(--brand-accent) / <alpha-value>)',
          hover:   'hsl(var(--brand-hover) / <alpha-value>)',
          text:    'hsl(var(--brand-text) / <alpha-value>)',
          muted:   'hsl(var(--brand-muted) / <alpha-value>)',
          green:   'hsl(var(--brand-green) / <alpha-value>)',
          red:     'hsl(var(--brand-red) / <alpha-value>)',
          gold:    'hsl(var(--brand-gold) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
