import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
        // PulsePilot Exact Design System Palette
        primary: {
          DEFAULT: "#7565F5",
          light: "#F0EDFF",
          dark: "#5E4EE0",
          hover: "#6654EB",
        },
        background: "#F8F9FC",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#FAFBFE",
          muted: "#F3F4F8",
        },
        foreground: "#171923",
        text: {
          DEFAULT: "#171923",
          secondary: "#777D8D",
          muted: "#9FA4B2",
        },
        border: {
          DEFAULT: "#E8EAF0",
          subtle: "#F1F2F6",
          focus: "#7565F5",
        },
        success: {
          DEFAULT: "#16A36A",
          light: "#E8F8F0",
          text: "#0F764E",
        },
        warning: {
          DEFAULT: "#E9A23B",
          light: "#FEF7EC",
          text: "#B27118",
        },
        danger: {
          DEFAULT: "#E05252",
          light: "#FDF2F2",
          text: "#B83232",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
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
          "monospace",
        ],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(16, 24, 40, 0.05)",
        sm: "0 1px 3px 0 rgba(16, 24, 40, 0.06), 0 1px 2px 0 rgba(16, 24, 40, 0.04)",
        md: "0 4px 8px -2px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.04)",
        lg: "0 12px 16px -4px rgba(16, 24, 40, 0.08), 0 4px 6px -2px rgba(16, 24, 40, 0.03)",
        focus: "0 0 0 3px rgba(117, 101, 245, 0.2)",
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;

