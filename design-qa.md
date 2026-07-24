# 官网重构 Design QA

## 比较基线

- Source visual truth: `/Users/gaiyao/.codex/generated_images/019f87ef-1040-7812-ba71-66ce8ca15ab2/call_fHZVIaGGQmLrRmRj9R0T2YwV.png`
- Source pixels: `864 × 1821`
- Implementation desktop hero: `/Users/gaiyao/Downloads/trae/映川/output/website-redesign-1440-hero-v3.jpg`
- Implementation evidence section: `/Users/gaiyao/Downloads/trae/映川/output/website-redesign-1440-evidence-v2.jpg`
- Implementation mobile hero: `/Users/gaiyao/Downloads/trae/映川/output/website-redesign-390-hero.jpg`
- Full-view comparison: `/Users/gaiyao/Downloads/trae/映川/output/website-design-qa-hero-comparison-v3.jpg`
- Desktop viewport and screenshot: `1440 × 1000 CSS px`, `deviceScaleFactor 1`, `1440 × 1000 px`
- Mobile viewport and screenshot: `390 × 844 CSS px`, `deviceScaleFactor 1`, `390 × 844 px`
- State: default landing page, production workspace links intact

Source and implementation use different full-page heights. The hero comparison crops both
images to the same `1.44:1` viewport ratio and normalizes each side to `620 × 431 px` before
comparison. Focused evidence review uses the live `1440 × 1000` implementation capture because
the source evidence area is readable in the full visual target.

## Findings

- Fonts and typography: passed. The implementation preserves the source's oversized Chinese
  display hierarchy, restrained body scale, monospace data labels and high-contrast editorial
  tone. System Chinese fallbacks remain legible without loading a blocking remote font.
- Spacing and layout rhythm: passed. Hero proportions, two-column data composition, hairline
  dividers, capability bands and workflow grid follow the selected source. Mobile collapses to
  one column with 16 px page margins and no horizontal overflow.
- Colors and visual tokens: passed. Warm off-white canvas, near-black type and deep-teal signal
  accents match the source. The final CTA intentionally uses a solid brand surface for conversion
  contrast.
- Image quality and asset fidelity: passed. The selected direction contains no photographic or
  illustrative raster assets. Product data remains semantic HTML; Phosphor supplies the visible
  interface icons. No placeholder imagery, emoji, handcrafted SVG or fake provider logo remains.
- Copy and content: passed. The page keeps the product promise, four supported model names,
  workflow, evidence limitations and real workspace destination. Marketing metrics are explicitly
  identified as example data.
- Interaction and accessibility: passed. Anchor navigation and the workspace CTA were verified;
  the CTA resolves to `https://app.chatway.chat`. The page exposes a skip link, semantic headings,
  visible focus styles and reduced-motion handling. Browser console errors: none.
- Responsive behavior: passed at `320`, `390`, `768`, `1024` and `1440` px. Each checked viewport
  reported `scrollWidth === innerWidth`; the 320 px heading and data panel remained inside the
  16 px page margins.

## Comparison history

1. Initial comparison found one P2 issue: the hero display type was visibly smaller than the
   selected source, weakening the above-the-fold hierarchy.
2. Increased the desktop display scale from `clamp(64px, 6.15vw, 96px)` to
   `clamp(84px, 9vw, 136px)` while preserving the mobile-specific scale.
3. Post-fix evidence in `website-design-qa-hero-comparison-v3.jpg` shows the intended three-line
   hierarchy, with the CTA and model table still visible in the first desktop viewport.

## Follow-up polish

- P3: a future branded variable font could further refine Chinese display weight, but it is not
  required for this release and would add a network dependency.

final result: passed
