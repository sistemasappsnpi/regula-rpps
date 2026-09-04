import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--color-ink-muted) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
        petrol: "rgb(var(--color-petrol) / <alpha-value>)",
        ok: "rgb(var(--color-ok) / <alpha-value>)",
        warn: "rgb(var(--color-warn) / <alpha-value>)",
        crit: "rgb(var(--color-crit) / <alpha-value>)",
        // Sidebar: paleta fixa (não muda com o tema claro/escuro do conteúdo).
        sidebar: "rgb(var(--color-sidebar) / <alpha-value>)",
        "sidebar-ink": "rgb(var(--color-sidebar-ink) / <alpha-value>)",
        "sidebar-muted": "rgb(var(--color-sidebar-ink-muted) / <alpha-value>)",
        "sidebar-border": "rgb(var(--color-sidebar-border) / <alpha-value>)",
        "sidebar-section": "rgb(var(--color-sidebar-section) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Poppins", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(27 36 48 / 0.04), 0 1px 3px 0 rgb(27 36 48 / 0.06)",
        lift: "0 4px 14px 0 rgb(27 36 48 / 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
