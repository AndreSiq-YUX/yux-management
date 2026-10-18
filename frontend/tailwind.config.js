/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        brand: {
          blue: { 400: '#5c8bff', 500: '#2e6bff', 600: '#1f57e8' },
          violet: { 400: '#9a83ff', 500: '#7b5cff' },
          magenta: { 400: '#dc6ad6', 500: '#c93cc0' },
          signal: { 500: '#2ee6a8' },
          alert: { 500: '#ff9f45' },
        },
        ink: {
          600: '#232a45',
          700: '#1a1f36',
          750: '#131729',
          800: '#0e1120',
          850: '#0a0c17',
          900: '#070811',
          950: '#04050a',
        },
        // Legacy scale, now an alias of the brand blue (decision D1)
        yux: {
          50: '#eef3ff',
          100: '#dfe8ff',
          200: '#c2d3ff',
          300: '#9ab6ff',
          400: '#5c8bff',
          500: '#2e6bff',
          600: '#1f57e8',
          700: '#1946bd',
          800: '#173b98',
          900: '#16347a',
        },
        // Semantic tokens driven by CSS variables (light/dark)
        yx: {
          bg: 'var(--yx-bg)',
          surface: 'var(--yx-surface)',
          'surface-2': 'var(--yx-surface-2)',
          line: 'var(--yx-line)',
          'line-strong': 'var(--yx-line-strong)',
          fg: 'var(--yx-fg)',
          'fg-2': 'var(--yx-fg-2)',
          'fg-3': 'var(--yx-fg-3)',
          blue: 'var(--yx-blue)',
          'blue-ink': 'var(--yx-blue-ink)',
          'blue-soft': 'var(--yx-blue-soft)',
          ok: 'var(--yx-ok)',
          'ok-soft': 'var(--yx-ok-soft)',
          'ok-line': 'var(--yx-ok-line)',
          warn: 'var(--yx-warn)',
          'warn-soft': 'var(--yx-warn-soft)',
          'warn-line': 'var(--yx-warn-line)',
          crit: 'var(--yx-crit)',
          'crit-soft': 'var(--yx-crit-soft)',
          'crit-line': 'var(--yx-crit-line)',
          'bar-track': 'var(--yx-bar-track)',
          side: {
            bg: 'var(--yx-side-bg)',
            'bg-2': 'var(--yx-side-bg-2)',
            fg: 'var(--yx-side-fg)',
            'fg-strong': 'var(--yx-side-fg-strong)',
            muted: 'var(--yx-side-muted)',
            line: 'var(--yx-side-line)',
            hover: 'var(--yx-side-hover)',
            active: 'var(--yx-side-active)',
          },
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        accent: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(100deg, #2e6bff 0%, #7b5cff 52%, #c93cc0 100%)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}