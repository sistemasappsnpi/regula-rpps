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
        "on-petrol": "rgb(var(--color-on-petrol) / <alpha-value>)",
        ok: "rgb(var(--color-ok) / <alpha-value>)",
        warn: "rgb(var(--color-warn) / <alpha-value>)",
        crit: "rgb(var(--color-crit) / <alpha-value>)",
        // Menu lateral acompanha o tema (claro/escuro) do conteúdo.
        sidebar: "rgb(var(--color-sidebar) / <alpha-value>)",
        "sidebar-ink": "rgb(var(--color-sidebar-ink) / <alpha-value>)",
        "sidebar-muted": "rgb(var(--color-sidebar-ink-muted) / <alpha-value>)",
        "sidebar-border": "rgb(var(--color-sidebar-border) / <alpha-value>)",
        "sidebar-section": "rgb(var(--color-sidebar-section) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-sans)"],
        sans: ["var(--font-sans)"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.04)",
        lift: "0 8px 24px -6px rgb(15 23 42 / 0.12), 0 2px 6px 0 rgb(15 23 42 / 0.05)",
      },
      keyframes: {
        "page-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "modal-in": { from: { opacity: "0", transform: "translateY(8px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
      },
      animation: {
        "page-in": "page-in 0.28s ease-out both",
        "modal-in": "modal-in 0.2s ease-out both",
        "fade-in": "fade-in 0.2s ease-out both",
        "slide-in": "slide-in 0.22s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
