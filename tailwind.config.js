/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: 'var(--ground)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        rule: 'var(--rule)',
        'rule-2': 'var(--rule-2)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        crit: 'var(--crit)',
        'crit-soft': 'var(--crit-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        ok: 'var(--ok)',
        'ok-soft': 'var(--ok-soft)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"IBM Plex Sans"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '5px', card: '5px' },
      boxShadow: { card: 'var(--shadow)' },
    },
  },
  plugins: [],
}
