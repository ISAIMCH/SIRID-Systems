import colors from 'tailwindcss/colors'

// GymGo design tokens, shared with the mobile app: zinc neutrals and the GymGo green (#10FF85).
// `slate` points at zinc so every page keeps one neutral scale.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: colors.zinc,
        ink: '#09090B',
        canvas: '#F4F4F5',
        brand: {
          DEFAULT: '#10FF85',
          hover: '#4DFFA4',
          press: '#0BE070',
          // Text on the green fill, and green text on white (5.6:1).
          ink: '#052E1A',
          text: '#047A44',
          soft: '#E8FFF2',
        },
        // Fixed categorical order for charts (checked for color-vision deficiency).
        series: {
          1: '#0E9F6E',
          2: '#2A78D6',
          3: '#EB6834',
          4: '#8B5CF6',
          5: '#E0A100',
        },
      },
      fontFamily: {
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Barlow', 'ui-sans-serif', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(9, 9, 11, 0.04), 0 8px 24px -16px rgba(9, 9, 11, 0.18)',
        lift: '0 2px 4px rgba(9, 9, 11, 0.05), 0 16px 32px -16px rgba(9, 9, 11, 0.28)',
        glow: '0 8px 24px -10px rgba(16, 255, 133, 0.55)',
      },
      keyframes: {
        // Opacity only: a transform on the page wrapper would re-anchor the pages' fixed modals while it runs.
        'page-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        grow: {
          from: { transform: 'scaleY(0)' },
          to: { transform: 'scaleY(1)' },
        },
        'grow-x': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        fade: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'page-in': 'page-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'pop-in': 'pop-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        grow: 'grow 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'grow-x': 'grow-x 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        fade: 'fade 400ms ease-out both',
      },
    },
  },
  plugins: [],
}
