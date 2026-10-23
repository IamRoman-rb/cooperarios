// Tokens del sistema de diseño de Stitch ("Cooperarios Quilmes Oeste").
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#f8f9ff', 'surface-dim': '#d1dbec', 'surface-bright': '#f8f9ff',
        'surface-container-lowest': '#ffffff', 'surface-container-low': '#eef4ff', 'surface-container': '#e5eeff',
        'surface-container-high': '#dfe9fa', 'surface-container-highest': '#d9e3f4',
        'on-surface': '#121c28', 'on-surface-variant': '#5b403d', 'inverse-surface': '#27313e', 'inverse-on-surface': '#eaf1ff',
        outline: '#8f6f6c', 'outline-variant': '#e4beb9', 'surface-tint': '#b91c1c',
        primary: '#93000b', 'on-primary': '#ffffff', 'primary-container': '#b91c1c', 'on-primary-container': '#ffcdc7', 'inverse-primary': '#ffb4ab',
        secondary: '#555f6f', 'on-secondary': '#ffffff', 'secondary-container': '#d6e0f3', 'on-secondary-container': '#596373',
        tertiary: '#444749', 'on-tertiary': '#ffffff', 'tertiary-container': '#5c5f61', 'on-tertiary-container': '#d7d9db',
        error: '#ba1a1a', 'on-error': '#ffffff', 'error-container': '#ffdad6', 'on-error-container': '#93000a',
        'primary-fixed': '#ffdad6', 'primary-fixed-dim': '#ffb4ab', 'on-primary-fixed': '#410002', 'on-primary-fixed-variant': '#93000b',
        'secondary-fixed': '#d9e3f6', 'secondary-fixed-dim': '#bdc7d9', 'on-secondary-fixed': '#121c2a', 'on-secondary-fixed-variant': '#3d4756',
        background: '#f8f9ff', 'on-background': '#121c28', 'surface-variant': '#d9e3f4',
        graphite: '#1f2937',
        exito: { DEFAULT: '#15803d', suave: '#dcfce7' },
        alerta: { DEFAULT: '#b45309', suave: '#fef3c7' },
        critico: { DEFAULT: '#b91c1c', suave: '#fee2e2' },
      },
      borderRadius: { DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem', full: '9999px' },
      spacing: {
        'space-xs': '0.25rem', 'space-sm': '0.5rem', 'space-md': '1rem', 'space-lg': '1.5rem', 'space-xl': '2.5rem',
        gutter: '1.5rem', 'gutter-sm': '1rem', margin: '2rem', 'margin-sm': '1rem',
      },
      // Stitch nombra la familia igual que cada escala tipográfica (font-label-md + text-label-md).
      fontFamily: Object.fromEntries(['sans', 'headline-xl', 'headline-xl-mobile', 'headline-lg', 'headline-lg-mobile', 'headline-md', 'headline-sm',
        'body-lg', 'body-md', 'body-sm', 'label-lg', 'label-md', 'label-sm'].map((k) => [k, ['Inter', 'system-ui', 'sans-serif']])),
      fontSize: {
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-xl-mobile': ['32px', { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-lg': ['30px', { lineHeight: '36px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-lg-mobile': ['24px', { lineHeight: '30px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-md': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-sm': ['18px', { lineHeight: '24px', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.03em', fontWeight: '600' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.05em', fontWeight: '700' }],
      },
      boxShadow: {
        n1: '0 1px 3px rgba(31,41,55,0.05), 0 1px 2px rgba(31,41,55,0.03)',
        n2: '0 10px 15px -3px rgba(31,41,55,0.08), 0 4px 6px -2px rgba(31,41,55,0.04)',
      },
      maxWidth: { contenido: '1280px' },
    },
  },
  plugins: [],
};
