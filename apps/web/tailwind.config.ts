import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ERP brand palette — neutral, professional, dark-mode-first
        brand: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
          950: '#2b3ea0',
        },
        surface: {
          0: '#ffffff',
          1: '#f8f9fa',
          2: '#f1f3f5',
          3: '#e9ecef',
          // Dark mode surfaces
          d0: '#0a0a0b',
          d1: '#111113',
          d2: '#18181b',
          d3: '#1e1e22',
          d4: '#27272a',
        },
        text: {
          primary: '#09090b',
          secondary: '#52525b',
          muted: '#a1a1aa',
          // Dark mode text
          'dark-primary': '#fafafa',
          'dark-secondary': '#a1a1aa',
          'dark-muted': '#52525b',
        },
        border: {
          DEFAULT: '#e4e4e7',
          dark: '#27272a',
        },
        status: {
          success: '#16a34a',
          warning: '#d97706',
          error: '#dc2626',
          info: '#2563eb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // Slightly tighter for ERP data density
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.625rem' }],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08)',
        'card-dark': '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};

export default config;
