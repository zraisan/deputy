---
name: Deputy
description: An agent that lives in your browser, shown the way a developer would watch it work, in DevTools.
colors:
  ground: "#111214"
  drawer: "#161719"
  panel: "#1b1c1f"
  raised: "#232529"
  line: "#33353a"
  line-soft: "#26282c"
  ink: "#e8e8e5"
  muted: "#a6a9af"
  dim: "#858991"
  accent: "#4ade80"
  accent-ink: "#062914"
  wait: "#fdd663"
  tag: "#7cacf8"
  attr: "#a8c7fa"
  value: "#f6b489"
  num: "#c58af9"
  site-paper: "#fbfaf7"
  site-green: "#11aa66"
  site-focus: "#1a73e8"
typography:
  display:
    fontFamily: "Google Sans Flex Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.6rem"
    fontWeight: 580
    lineHeight: 0.98
    letterSpacing: "-0.038em"
  headline:
    fontFamily: "Google Sans Flex Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 560
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Google Sans Flex Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 560
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  lede:
    fontFamily: "Google Sans Flex Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: "Google Sans Flex Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  action:
    fontFamily: "Google Sans Flex Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
  label:
    fontFamily: "Google Sans Flex Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1
  code:
    fontFamily: "Google Sans Code Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  code-pane:
    fontFamily: "Google Sans Code Variable, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "20px"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  gutter-mobile: "20px"
  gutter: "32px"
  column-gap: "64px"
  section-top-mobile: "80px"
  section-bottom-mobile: "64px"
  section-top: "112px"
  section-bottom: "96px"
  heading-to-pane: "48px"
  subsection: "80px"
  pane-inset: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  pane:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.xl}"
  pane-tabbar:
    textColor: "{colors.dim}"
    typography: "{typography.label}"
    padding: "0 12px"
    height: "36px"
  pane-tab-active:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  pane-footer:
    backgroundColor: "{colors.drawer}"
    textColor: "{colors.dim}"
    padding: "8px 12px"
  inline-code:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  code-well:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: "20px"
  side-tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  side-tab-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  step-button:
    textColor: "{colors.dim}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  step-button-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  notice-wait:
    backgroundColor: "rgb(253 214 99 / 0.06)"
    textColor: "{colors.wait}"
    rounded: "{rounded.lg}"
    padding: "16px"
  table-row-deputy:
    backgroundColor: "rgb(74 222 128 / 0.05)"
    textColor: "{colors.accent}"
---

# Design System: Deputy

## Overview

**Creative North Star: "The Opened Inspector"**

The page does not describe Deputy. It shows Deputy at work in a browser whose DevTools are already open. Everything borrows from the Chromium DevTools dark theme: graphite panels stacked a shade apart, hairline dividers instead of shadows, tab strips with a 2px underline on the active tab, and DOM syntax color (blue tags, pale-blue attribute names, orange values, violet numbers). Prose sits between the panes the way documentation sits beside a tool. The panes are what you read for evidence; the prose explains them.

Density is set by the instrument. Pane content runs at 12–13px monospace on whole 20px lines, and tables use tabular figures. Headlines are large, tightly tracked and sparse, so the page reads as a few loud statements with dense proof under each. There is one authored motion, the hero replay. Every other surface is still and visible on first paint.

Color is semantic and scarce. Green belongs to Deputy: what it writes, what it measured, the one action it asks for. Amber means a human has to act. The web page Deputy works on stays in its own light palette inside the dark chrome, because it is someone else's site. The page rejects the centered dev-tool launch page: no glow, no aurora gradients, no feature-card grids, no stat tiles.

**Key Characteristics:**
- Chromium DevTools dark theme, tonal layers from ground to raised, separated by hairlines.
- Green marks Deputy; amber marks waiting on a human; DOM syntax colors mark code.
- Google Sans Flex for prose, Google Sans Code for anything a machine reads.
- Panes with tab strips hold all evidence: replay, video, tables, source, markup.
- One authored motion (the hero replay); no entrance animations.
- Every figure is measured: it comes from `docs/measurements.md`, the README or the demo video.

## Colors

Graphite neutrals in tight steps, one green that belongs to Deputy, one amber for human attention, and the Elements panel's syntax palette.

### Primary
- **Deputy Green** (accent): what Deputy writes or does. Grafted attributes in the Elements tree and code samples, Deputy's row and figures in the comparison tables, the primary button, the active-tab underline, step numerals, the prompt chevron, the status dot while running, the focus ring, text selection, and the badge mark. Text on a green fill always uses **Deep Forest Ink** (accent-ink), never white.
- **Grafted Value Mint** (`#bdf5d1`, inline in the Inspector only): the value of an attribute Deputy just wrote, so the attribute name stays the stronger green.

### Secondary
- **Waiting Amber** (wait): a human has to act. The hero's final step ("Waits for a human"), its status text and dot, the note under the focused submit button, and the developer-preview notice. Amber tints (6% fill, 25% border) carry the notice box.

### Tertiary (syntax)
- **Tag Blue** (tag): element names and angle brackets.
- **Attribute Pale Blue** (attr): attribute names and JSON keys.
- **Value Orange** (value): quoted strings and attribute values.
- **Number Violet** (num): numeric literals.
- Comments use **Dim Graphite** (dim).

### Neutral
- **Ground** (ground): page background, code wells inside panes, the cut-out at the centre of the badge.
- **Drawer** (drawer): sunk strips at the foot of a pane: the Network summary row, the hero's console drawer.
- **Panel** (panel): pane bodies, the site footer.
- **Raised** (raised): browser toolbar, active side tabs and step buttons, inline code, hover fill.
- **Line** (line): pane borders, tab-strip dividers, secondary button border.
- **Soft Line** (line-soft): section dividers, table row rules, sub-headers inside panes.
- **Ink** (ink): headings, active labels, emphasized figures.
- **Muted** (muted): body and lede prose, inactive side tabs, nav links.
- **Dim** (dim): pane tab labels, table headers, captions, source links, comments.

### Depicted site
- **Site Paper** (site-paper), **Site Green** (site-green), **Site Focus Blue** (site-focus): the third-party reservation site inside the hero and the consent pane. Its fields are white with `#d4d2cc` borders, turning `#9bd8b6` when filled. Site Focus Blue is Chromium's focus ring on the submit button.

### Named Rules
**The Deputy's Pen Rule.** In any syntax-colored code, green means Deputy wrote it (`toolname`, `tooldescription`, `toolparamdescription`, `toolautosubmit`). No other token, key or value is ever green.

**The Amber Waits Rule.** Amber appears only where a person must act or be warned. It is never decoration and never a second accent.

**The Light Guest Rule.** A web page Deputy acts on keeps its own light palette inside the dark chrome. Never theme the depicted site dark.

## Typography

**Display Font:** Google Sans Flex Variable (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Google Sans Flex Variable (same stack)
**Label/Mono Font:** Google Sans Code Variable (with ui-monospace, SF Mono, Menlo, monospace)

**Character:** One family in two voices. The Flex sans is the documentation beside the tool, set with optical sizing and tight tracking at display sizes. Code is the tool itself: URLs, file paths, figures, tab asides and every pane's content.

### Hierarchy
- **Display** (580, 2.75rem mobile / 3.75rem ≥640px / 3.6rem ≥1024px, line-height 0.98, -0.038em): the hero headline only, capped at 14ch.
- **Headline** (560, 2rem mobile / 2.75rem ≥640px, 1.05, -0.03em): one per section, capped at 20ch, plain sentence case, no label above it.
- **Title** (560, 1.375rem, tight, -0.02em): sub-sections and the active tier's title. Install step titles drop to 17px medium.
- **Lede** (400, 17px, 1.65, muted): the paragraph under a headline, max 64ch. The hero sub is 17px, rising to 18px at ≥640px, with line-height 1.6 and max 46ch.
- **Body** (400, 15–16px, 1.65, muted): tier descriptions, table notes, install steps.
- **Label** (400, 12px, dim): pane tab labels, table column headers. Sentence case, no tracking, no uppercase.
- **Code** (400, 13px, 1.6): code wells, prompts, table figures at 13.5px. **Code Pane** (12px on 20px lines) inside the Inspector. Pane asides and source links use 11.5–12px Code.

### Named Rules
**The Machine Reads Mono Rule.** Anything a program would parse (paths, flags, URLs, token counts, costs, times, tool names) is set in Google Sans Code with tabular figures. Prose stays in the sans.

**The Balanced Headline Rule.** h1–h3 use `text-wrap: balance` and paragraphs use `pretty`. Headlines are sentence case statements with no eyebrow, kicker or label above them.

## Layout

A single 1200px column with 20px side padding, 32px at ≥640px. Above 1024px, content sits on a 12-column grid with a 64px column gap. Section heads split 5/7 (headline left, prose right) or 7/5 (headline and lede left, a pane or actions right). Below 1024px everything stacks into one column.

Sections are separated by a Soft Line hairline across the full width, with 80px above and 64px below the content (112px / 96px at ≥640px). A pane follows its heading block at 48px, and sub-blocks within a section are 80px apart. The hero breaks the pattern: it has no top rule, puts the headline (7 columns) and sub plus actions (5 columns) on one baseline row, then the full-width browser window 28–32px below.

Breakpoints are Tailwind's defaults (640 / 768 / 1024px). At 768px the Inspector splits into Elements and schema columns (1.15fr / 1fr) and the tier list becomes a 260px sidebar. Tables scroll horizontally inside their pane and shed secondary columns below 640px.

### Named Rules
**The Whole-Line Rule.** Scrolling panes use 20px lines, and their heights are whole multiples of that line (180px, 220px), so a pane never shows half a line under its header.

**The Visible-By-Default Rule.** All content renders on first paint. No scroll-triggered fades, slides or reveals.

## Elevation & Depth

Flat, tonal layering in the DevTools manner. Depth comes from four close steps (Ground, Drawer, Panel, Raised) and from 1px Line borders, never from shadow. The one exception is the hero browser window, which lifts off the page as the object the whole page is about.

### Shadow Vocabulary
- **Window lift** (`box-shadow: 0 30px 80px -20px rgb(0 0 0 / 0.7), inset 0 2px 0 0 rgb(255 255 255 / 0.03)`): the hero browser window only.

### Named Rules
**The One Lifted Window Rule.** Only the hero browser window casts a shadow. Every other pane is a bordered flat surface.

## Shapes

Gently rounded rectangles that echo browser chrome. Panes and the browser window use 12px corners with `overflow: hidden`, so tab strips and footer strips clip cleanly. Buttons, code wells, prompts and notices use 8px. Side tabs, step buttons and the depicted site's fields and button use 6px. Inline code uses 4px, and bar-chart tracks 2px. The omnibox and status dots are fully round, and the browser tab has 8px top corners only.

Icons come from one family: a 16px grid, 1.5px stroke, round caps and joins, `currentColor`. The GitHub mark is the one filled glyph. The Deputy mark is a six-point star with node dots at its tips and a Ground-colored centre holding green angle brackets, drawn identically in the favicon.

## Components

### Buttons
Solid and quiet, sized for a thumb.
- **Shape:** 8px corners, 44px tall, 20px side padding, 15px text.
- **Primary:** Deputy Green fill, Deep Forest Ink text at weight 600. One per view: "Install the developer preview."
- **Hover / Active:** brightness filter 110% on hover, 95% on press. No lift, no glow.
- **Secondary:** transparent with a Line border, Ink text at weight 500, optional leading 16px icon. On hover the border lightens to `#4a4d54` and the fill becomes Raised.
- **Focus:** global 2px Deputy Green outline, 3px offset, 4px radius.

### Panes (containers)
The DevTools pane is the page's card, and it only ever holds evidence.
- **Corner Style:** 12px, clipped.
- **Background:** Panel, with a 1px Line border.
- **Tab strip:** 36px tall, 12px padding, Line bottom border, 12px Dim labels. The active tab is Ink with a 2px Deputy Green bottom border running the strip's full height. An optional right-aligned aside in 11.5px Code names the object (`booking form · 7 fields`, `document.modelContext`).
- **Footer strip:** Drawer background, Line top border, 12px Code in Dim, with a Source link pushed right.
- **Shadow Strategy:** none (see Elevation).
- **Named tabs used:** Elements, Recorder, Network, Sources. Each pane is named after the DevTools panel that would show its content.

### Inline code
- **Style:** Raised fill, Ink text, 4px corners, 2px × 6px padding, Code at 0.86em.

### Code wells and prompts
- **Code well:** Ground fill inside a pane, Soft Line border, 8px corners, 16–20px padding, 13px Code on 1.6 line-height, highlighted with the syntax palette.
- **Prompt:** Panel fill, Line border, 8px corners, a Deputy Green `›` chevron (not selectable) before each command.

### Tables (Network style)
- **Header:** 32px row, 12px Dim sans, left-aligned text and right-aligned figures.
- **Rows:** Soft Line rules and tabular Code figures. Deputy's row gets a 5% green wash with its key figure in Deputy Green, and the baseline row's name is Muted.
- **Bars:** 10px tall on a Soft Line track with 2px corners. Deputy's bar is green, the baseline's neutral grey.

### Side tabs and step bar
- **Side tabs (tier list):** a vertical tablist with arrow-key navigation. Each item shows a Dim 11.5px Code file path over a 14px title. The active item is Raised and Ink, inactive items are Muted with a 60% Raised hover.
- **Step bar:** a 32px play/pause/replay icon button, then five numbered 32px step buttons with 6px corners. The current step is Raised and Ink with a green numeral (amber on the waiting step), past steps are Muted and future steps Dim. Labels hide below 640px, where the current step's label shows beside the play button.

### Notice
- **Developer preview:** Waiting Amber at 6% fill with a 25% border, 8px corners, 16px padding, a leading warning icon, and a bold Amber lead phrase before pale-amber body text.

### Navigation
- **Header:** 56px, the 22px badge mark plus "Deputy" at 17px/600 on the left, with nav links at 14px Muted on the right (Ink on hover). Section links hide below 640px, leaving Install and GitHub.
- **Footer:** Panel with a Line top border, 12.5px Code in Dim, links Muted turning green on hover.
- **Source links:** 12px Code in Dim with a 12px arrow icon, turning green on hover.

### Inspector (signature component)
The hero: a browser window (tab strip, toolbar with omnibox and extension icon, the light depicted site) over a docked DevTools panel. The panel holds an Elements tree on the left, a "Tool schema / generated by Chromium" pane on the right, a console drawer showing the one `browser_invoke` call, and the step bar. One 90ms clock drives every pane through five steps: the page loads, Deputy grafts, Chromium builds the schema, an agent calls it, the page waits for a human.
- **Graft flash:** each attribute Deputy writes arrives with `dom-flash` (green at 38% fading to 8% over 1.1s, `cubic-bezier(0.16, 1, 0.3, 1)`), just as DevTools flashes a modified node.
- **Typing caret:** a 1px green caret blinks with `steps(1)` in the field being filled.
- **Wait state:** the submit button gains a 2px Site Focus Blue outline, and the status dot, status text and note turn amber.
- **Behavior:** starts once when the window is 30% into view, never loops, and can be paused or scrubbed by step. Panes follow their newest line while running and return to the top when settled. Under `prefers-reduced-motion` it renders the finished state with no animation.

## Do's and Don'ts

### Do:
- **Do** keep the dark DevTools theme and Deputy Green (`#4ade80`) as the accent. Both are binding brand commitments.
- **Do** put evidence inside panes named after the DevTools panel that would show it (Elements, Network, Sources, Recorder), with a 36px tab strip and a green-underlined active tab.
- **Do** reserve green in code for Deputy's own attributes, and use the Elements palette for everything else: blue tags, pale-blue attributes, orange values, violet numbers.
- **Do** use amber only when a human must act or be warned.
- **Do** render any depicted third-party site in its own light palette inside the dark chrome.
- **Do** take every figure from `docs/measurements.md`, the README or the demo video, set it in tabular Google Sans Code, and link its source where a table cites it. Never contradict or reframe a figure shown in `docs/deputy-demo.mp4`; extra figures are fine.
- **Do** render the finished state of the hero replay under `prefers-reduced-motion`.
- **Do** separate layers with 1px Line / Soft Line hairlines and tonal steps (Ground, Drawer, Panel, Raised).

### Don't:
- **Don't** add a second authored motion, scroll-reveal entrances, or content that is hidden until scrolled to. The hero replay is the one motion.
- **Don't** put stat tiles or big-number metrics in the hero. Figures live in Network-style tables.
- **Don't** put a kicker, eyebrow or uppercase label above a headline.
- **Don't** lay features out as a card grid. Use a pane with side tabs, as the tiers section does.
- **Don't** use glow, aurora or gradient backgrounds, or a centered launch-page hero.
- **Don't** add shadows beyond the hero window's lift.
- **Don't** set Dim text on Raised surfaces. It drops to 4.37:1. Keep Dim on Ground, Drawer or Panel.
- **Don't** set white text on a green fill. Primary actions use Deep Forest Ink on Deputy Green.
