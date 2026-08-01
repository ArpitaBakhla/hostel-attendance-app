---
name: Luminous Depth
colors:
  surface: '#141218'
  surface-dim: '#141218'
  surface-bright: '#3b383e'
  surface-container-lowest: '#0f0d13'
  surface-container-low: '#1d1b20'
  surface-container: '#211f24'
  surface-container-high: '#2b292f'
  surface-container-highest: '#36343a'
  on-surface: '#e6e0e9'
  on-surface-variant: '#cbc4d2'
  inverse-surface: '#e6e0e9'
  inverse-on-surface: '#322f35'
  outline: '#948e9c'
  outline-variant: '#494551'
  surface-tint: '#cfbcff'
  primary: '#cfbcff'
  on-primary: '#381e72'
  primary-container: '#6750a4'
  on-primary-container: '#e0d2ff'
  inverse-primary: '#6750a4'
  secondary: '#cdc0e9'
  on-secondary: '#342b4b'
  secondary-container: '#4d4465'
  on-secondary-container: '#bfb2da'
  tertiary: '#e7c365'
  on-tertiary: '#3e2e00'
  tertiary-container: '#c9a74d'
  on-tertiary-container: '#503d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#cfbcff'
  on-primary-fixed: '#22005d'
  on-primary-fixed-variant: '#4f378a'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#cdc0e9'
  on-secondary-fixed: '#1f1635'
  on-secondary-fixed-variant: '#4b4263'
  tertiary-fixed: '#ffdf93'
  tertiary-fixed-dim: '#e7c365'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#594400'
  background: '#141218'
  on-background: '#e6e0e9'
  surface-variant: '#36343a'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-margin-desktop: 40px
  container-margin-mobile: 20px
  gutter: 24px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is engineered for a premium fintech experience, evoking feelings of security, precision, and high-end craftsmanship. The aesthetic leans heavily into **Glassmorphism** and **Tactile Layering**, creating a digital environment that feels physically tangible and sophisticated.

The brand personality is authoritative yet innovative. It utilizes deep, immersive backgrounds to allow "glowing" financial data and emerald accents to pop with high contrast. Surfaces should feel like machined glass panels floating over a dark, infinite void, utilizing 3D embossed effects to signify interactivity.

## Colors
The palette is centered on a "Deep Night" spectrum. 
- **Primary Background:** A rich navy-to-charcoal gradient (#0F172A to #1E293B).
- **Primary Accent:** Emerald Green (#10B981), used exclusively for high-priority actions, success states, and critical financial indicators. This color should be treated as a light source, often accompanied by a subtle outer glow.
- **Surface Strategy:** Layers are built using semi-transparent variations of the secondary background with a `backdrop-filter: blur(12px)`. 
- **Neutral/Text:** High-legibility whites and muted slate grays ensure hierarchy without competing with the emerald accents.

## Typography
The system uses a pairing of **Manrope** for headlines to provide a modern, refined character, and **Inter** for functional body text and data display to ensure maximum clarity. 

- Use **Manrope** for large currency displays and page titles.
- Use **Inter** for all forms, data tables, and micro-copy.
- Tabular figures (monospaced numbers) should be enabled for all financial balances to prevent layout jitter during value updates.

## Layout & Spacing
The layout follows a **Fluid Grid** model with strict adherence to an 8px spacing rhythm. 
- **Desktop:** 12-column grid with 24px gutters. Content is typically housed in "Glass Panels" that span 4, 6, or 8 columns.
- **Mobile:** 4-column grid with 16px gutters.
- **Layering Logic:** Use generous padding (stack-lg) within glass containers to emphasize the "airy" feel of the frosted panels. Elements should never feel cramped against the glass edges.

## Elevation & Depth
Depth is the core differentiator of this design system. It is achieved through a three-tier system:
1.  **Base (Level 0):** The deep navy-to-charcoal background.
2.  **Floating Panels (Level 1):** Semi-transparent glass (`rgba(30, 41, 59, 0.7)`) with a 1px inner border at the top and left to simulate a light source catching the edge (highlight). A soft, 15% opacity black shadow provides lift.
3.  **Active Elements (Level 2):** Interaction states (like hovering over a card) increase the backdrop blur and add a subtle emerald outer glow (`#10B981` at 20% opacity).

**Tactile Effects:** Buttons and inputs use "Embossed" styling—subtle internal shadows and highlights that make the element appear to be molded out of the glass surface rather than just sitting on top of it.

## Shapes
The design system utilizes **Rounded** geometry (0.5rem base) to maintain a friendly yet professional fintech feel. 

- **Cards/Panels:** Use `rounded-xl` (1.5rem) to create a soft, premium container look.
- **Buttons/Inputs:** Use `rounded-lg` (1rem) to provide a distinct tactile "pill-lite" feel.
- **Interactive Icons:** Should be contained within circular or highly rounded backgrounds.

## Components
- **Buttons:** 
  - *Primary:* Solid Emerald Green (#10B981) with white text. High tactile feel with a 1px top-highlight. 
  - *Secondary:* Glass-textured with a 1px border.
- **Inputs:** Darker than the panel surface. When focused, the border glows emerald and the internal shadow deepens to create a "pressed-in" feel.
- **Glass Cards:** The primary container. Must include `backdrop-filter: blur(12px)` and a subtle gradient stroke (white at 10% to white at 0%).
- **Financial Tickers:** Use Inter Medium. Negative values in a soft coral-red, positive values in Emerald.
- **Chips:** Small, pill-shaped glass elements with low-opacity emerald backgrounds for "Verified" or "Active" statuses.
- **Steppers:** Thin vertical lines using the Emerald accent to show progress through financial workflows.