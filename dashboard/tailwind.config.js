/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // Tencent Cloud sky-blue scale, anchored at brand.500 = #00A4FF.
        brand: {
          50:  "#E6F6FF",
          100: "#BCE4FF",
          200: "#80CFFF",
          300: "#4DB9FF",
          400: "#1AA8FF",
          500: "#00A4FF",
          600: "#0086D3",
          700: "#0069A6",
          800: "#004E7A",
          900: "#00334F",
        },
        // Light-theme surfaces tuned for long-session dashboard reading.
        canvas: "#F5F7FA",        // page background
        surface: "#FFFFFF",       // cards / tables
        "surface-2": "#FAFBFC",   // subtle alt (zebra, hover)
        "surface-3": "#F0F3F7",   // pressed / nested
        line: "#E4E7EB",          // default border
        "line-strong": "#CBD2D9", // emphasized border
        ink: {
          DEFAULT: "#1F2933",     // primary text
          muted:   "#52606D",     // secondary text
          subtle:  "#7B8794",     // tertiary text
          faint:   "#9AA5B1",     // hint / placeholder
        },
        ok:    "#0E9F6E",
        warn:  "#F59E0B",
        bad:   "#E5484D",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(16, 24, 40, 0.04), 0 1px 3px 0 rgba(16, 24, 40, 0.06)",
        "card-hover": "0 4px 8px -2px rgba(16, 24, 40, 0.06), 0 2px 4px -2px rgba(16, 24, 40, 0.06)",
        focus: "0 0 0 3px rgba(0, 164, 255, 0.25)",
      },
      borderRadius: {
        DEFAULT: "0.375rem",
      },
    },
  },
  plugins: [],
};
