/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#CB4B00',
          hover: '#B03000',
          50: '#FFF4EC',
          100: '#FFE2CC',
          200: '#FFC299',
          300: '#FF9966',
          400: '#FF7733',
          500: '#CB4B00',
          600: '#B03000',
          700: '#852400',
          800: '#5A1800',
          900: '#2F0C00',
        },
        // Web's CSS-var-based design tokens, hand-mapped to fixed colors
        // for NativeWind. Dark mode resolved per-style via the colorScheme hook.
        background: '#FFFFFF',
        foreground: '#0A0A0A',
        card: '#FFFFFF',
        'card-foreground': '#0A0A0A',
        muted: '#F4F4F5',
        'muted-foreground': '#71717A',
        border: '#E4E4E7',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
