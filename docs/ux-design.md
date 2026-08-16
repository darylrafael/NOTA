# UX & UI Design Decisions

## 1. Dashboard Redesign (V1 to V2)
**Reference Product:** Vercel & Stripe Dashboards.
**Observed Pattern:** Monochromatic/High-contrast layout, low-visual noise, high data density, clear typographic hierarchy.
**Why it Works:** Enterprise software users want to see data quickly without being distracted by massive blocks of color or unnecessary UI chrome (like heavy drop shadows).
**Applicability:** NOTA is a financial tool. Users need to read numbers quickly.
**Adaptation in V2:**
- Removed the massive `colors.primary` background hero block.
- Replaced heavy `shadow.card` with subtle 1px borders (`StyleSheet.hairlineWidth`).
- Removed rounded corners on list items to create a continuous data-table feel.
- Enhanced font weights for merchant names and totals.

## 2. Confirmation Screen Redesign (V1 to V2)
**Reference Product:** Linear Issue Editor.
**Observed Pattern:** Keyboard-first design, borderless or minimal-border inputs, inline editing.
**Why it Works:** Editing a list of 10-15 items needs to be frictionless. Heavy borders around inputs cause visual fatigue.
**Applicability:** Correcting AI mistakes in receipt scanning requires rapid manual overrides.
**Adaptation in V2:**
- Inputs (Name, Quantity, Price) are now cleanly arranged on a single row.
- Used a uniform off-white background (`#FAFAFA`) to make the white item cards pop without shadows.
- Quantity and Price inputs use a specific `number-pad` keyboard and are aligned to the right for easy math readability.

## 3. Empty States & Feedback
- Actionable empty states: If there are no receipts, the UI provides a clear call to action to "Tap Scan".
- Optimistic feedback: Added Haptics on save, and a Toast notification to reassure the user that the action succeeded.
