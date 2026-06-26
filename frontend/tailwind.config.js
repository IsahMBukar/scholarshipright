/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#f5b942',
        'primary-light': '#f5d9a2',
        'primary-readable': '#d4972e', /* WCAG AA on white — use for text */
        'bg-soft': '#e0c48b',
        'text-primary': '#1a1a1a',
        'text-secondary': '#4a4a4a',
        'text-inverse': '#ffffff',
      },
      borderRadius: {
        card: '24px',
        chip: '12px',
        btn: '9999px',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
