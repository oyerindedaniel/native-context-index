# NCI Homepage Architecture Blueprint

This document is a full implementation plan for the `apps/web` homepage.
It is intentionally deep, specific, and implementation-oriented.
It favors systems thinking over ad-hoc patching.

---

## 1) Product Narrative (homepage-level)

Native Context Index (NCI) helps developers query package APIs with high signal and low noise.
The homepage should communicate that NCI is:

- fast
- precise
- visual
- developer-first
- credible for production workflows

The homepage flow should be:

1. **Hero**: establish identity + technical ambition immediately.
2. **Features**: explain practical value to developers.
3. **Benchmark**: prove speed/perf edge with unique visual style.
4. **CTA section**: re-emphasize value + route to docs.
5. **Footer**: lightweight wayfinding + trust links.

---

## 2) Core Visual Principles

1. Clean, high-contrast typography.
2. Minimal noise; controlled motion.
3. One signature visual language across sections.
4. Branded but not over-styled.
5. Technical elegance, not marketing fluff.
6. Motion should support comprehension, not spectacle.
7. The hero should feel “alive but deliberate”.
8. Avoid crowded iconography and random decoration.
9. Spatial rhythm: large quiet zones around key moments.
10. Animation should have clear beginning, middle, and settle.

---

## 3) Information Architecture

Top-level sections for `/`:

1. `Nav`
2. `HeroCanvasSection`
3. `FeatureGridSection`
4. `BenchmarkSection`
5. `SecondaryCTASection`
6. `Footer`

### 3.1 Section Goals

- `Nav`: orient + route quickly.
- `HeroCanvasSection`: identity + wow + concise statement.
- `FeatureGridSection`: concrete utility (3 feature cards).
- `BenchmarkSection`: evidence through visualized comparison.
- `SecondaryCTASection`: reaffirm trust and direct to docs.
- `Footer`: close with strong brand + GitHub path.

---

## 4) Technical Stack

Already installed:

- Next.js app router
- Tailwind v4
- `motion` (installed now)

Required for hero rendering:

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`

### 4.1 Why this stack

- R3F allows declarative scene composition with React ergonomics.
- Three shaders enable your liquid-surface reaction concept.
- Motion handles non-canvas UI animation and enter transitions.
- Tailwind handles layout and typography consistency.

---

## 5) Motion System (global)

Define a homepage motion token system instead of one-off values.

### 5.1 Motion Tokens

- `motion.duration.instant = 0.12`
- `motion.duration.fast = 0.22`
- `motion.duration.base = 0.36`
- `motion.duration.emphasis = 0.56`
- `motion.duration.settle = 0.82`
- `motion.duration.heroTravel = 1.35`
- `motion.duration.heroSettle = 1.10`

### 5.2 Easing Tokens

Use cubic-bezier curves as constants:

- `ease.standard = [0.2, 0.0, 0.0, 1.0]`
- `ease.outSoft = [0.16, 1.0, 0.3, 1.0]`
- `ease.outStrong = [0.05, 0.9, 0.1, 1.0]`
- `ease.settle = [0.22, 1.0, 0.36, 1.0]`
- `ease.micro = [0.25, 0.1, 0.25, 1.0]`

### 5.3 Stagger Tokens

- `stagger.tight = 0.03`
- `stagger.base = 0.06`
- `stagger.relaxed = 0.10`

---

## 6) Hero Architecture

You want:

- fullscreen canvas
- logo 3D object animation from top-left to center
- liquid-like reactive surface that responds to logo motion
- heading/subheading overlay with thoughtful mask behavior

Implement this as two layers:

1. `Canvas layer` (WebGL)
2. `Overlay layer` (HTML/CSS + motion)

### 6.1 Hero DOM Structure

```tsx
<section className="relative min-h-screen overflow-hidden">
  <HeroCanvas />
  <HeroOverlay />
</section>
```

### 6.2 Hero Canvas Subsystems

1. Scene setup
2. Camera rig
3. Logo mesh loader
4. Logo transform timeline
5. Liquid displacement simulation
6. Ripple settle simulation
7. Performance governor

### 6.3 Hero Overlay Subsystems

1. Heading/subheading max-width container
2. Blend/mask treatment for readability + immersion
3. Intro fade/slide tied to hero timeline
4. Reduced-motion fallback

---

## 7) Hero Animation Phases

Define deterministic phases:

1. **Phase A: Pre-roll** (0.0 -> 0.25s)
   - canvas appears
   - low-intensity liquid drift

2. **Phase B: Entry travel** (0.25 -> 1.60s)
   - logo starts top-left offset
   - translation + mild rotation toward center
   - liquid field displacement increases with velocity

3. **Phase C: Convergence** (1.60 -> 2.30s)
   - logo decelerates
   - rotational velocity dampens
   - focal turbulence near center

4. **Phase D: Settle + residual ripples** (2.30 -> 3.70s)
   - logo lands at center
   - liquid radiates low-amplitude rings
   - amplitude decays exponentially

5. **Phase E: Idle loop** (3.70s+)
   - minimal breathing motion
   - near-static logo
   - subtle surface drift

---

## 8) Liquid Surface Strategy

Use a screen-space distortion map with a low-resolution flow field.

Implementation direction:

- generate a low-res flow texture
- upsample in shader
- distort UVs by flow vectors
- inject impulses from logo velocity
- emit a radial settle impulse when the logo lands at center
- apply exponential decay so the surface naturally returns to idle

---

## 9) Text Overlay Mask Treatment

Goal:

- text overlays canvas
- liquid visible through/around text in a controlled way
- not fully opaque block

Approach:

1. Overlay container with semi-translucent backdrop.
2. Heading in near-solid ink for legibility.
3. Subheading with slight alpha reduction.
4. Use `backdrop-filter` blur at very low strength.
5. Use a soft mask gradient around text container edges.

Rules:

- prioritize readability over effect.
- keep blur low.
- avoid glow.
- avoid heavy frosted style.

---

## 10) Copy Direction (Hero)

Need concise, non-corny, factual.

Approved hero heading:

- `The Modern API Index`

Approved hero subheading:

- `Built for precise symbol, dependency, and version lookup across TypeScript packages.`

---

## 11) Navigation Layout

Requirements:

- left: logo
- center: index product link (primary product route)
- docs link
- right: GitHub icon link
- no heavy background

Execution:

- transparent nav on hero
- subtle border-bottom appears after first scroll threshold
- fixed/sticky nav with backdrop only after scroll > 24px

---

## 12) Features Section

Layout:

- 2x2 grid
- only 3 cards
- third card spans full width at bottom
- leave custom SVG placeholders (no emoji/icons)

Structure:

Row 1:

- Card A
- Card B

Row 2:

- Card C spanning 2 columns

### 12.1 Feature Picks (developer practical)

Card A:

- title: `Search Real API Surfaces`
- body: `Query exported symbols directly from declaration graphs to find what a package really exposes.`

Card B:

- title: `Trace Dependency Context`
- body: `Inspect package versions and declared dependencies to understand integration impact before shipping.`

Card C (primary, spanning):

- title: `Build Fast, Repeatable Indexes`
- body: `Index large node_modules trees with cache-aware workflows so lookup stays fast across daily iteration.`

---

## 13) Benchmark Section

Use a custom “stream bar” system with horizontal bars and subtle directional shear:

- one bar style for baseline tools
- one signature NCI style for emphasis
- animation on viewport enter

### 13.1 Visual Language

- Baseline bars use muted border/surface style.
- NCI bars use dual-layer flat style:
  - base strip in `dark`
  - top inset strip in `primary`

### 13.2 Interaction

- On enter, bars grow left -> right.
- Value labels fade after bar reaches 85% width.
- NCI row gets slight pulse at completion.

### 13.3 Data storytelling

Use realistic scenarios:

- “Index react + types”
- “Find symbol across 50 packages”
- “Query package dependency metadata”

Keep claims credible and reproducible.

---

## 14) Secondary CTA Section

Purpose:

- re-emphasize hero promise
- drive documentation click

Layout:

- centered heading/subheading
- one primary button: `Read Documentation`
- one secondary text link: `View on GitHub`

Tone:

- concise
- direct
- no hype language

---

## 15) Footer

Requirements:

- left: logo
- right: GitHub

Execution:

- thin top border
- compact height
- muted text
- no extra columns initially

---

## 16) Responsive Strategy

### 16.1 Breakpoints

- mobile: `<640`
- tablet: `640-1023`
- desktop: `>=1024`

### 16.2 Hero behavior by size

- mobile:
  - shorter timeline
  - less displacement amplitude
  - reduced camera movement

- tablet:
  - medium fidelity

- desktop:
  - full effect

### 16.3 Feature grid behavior

- mobile: 1 column stacked
- tablet+: 2 columns with spanning third card

---

## 17) Performance Budget

Targets:

- LCP < 2.5s (desktop local with warm cache)
- TBT < 150ms
- FPS >= 50 during hero motion (desktop baseline)
- FPS >= 35 on mid-tier mobile

Controls:

- clamp device pixel ratio
- reduce shader steps on low-end
- pause canvas when tab hidden
- disable heavy effects under reduced motion

---

## 18) Accessibility Strategy

1. Hero overlay text must maintain contrast.
2. Nav links must be keyboard reachable.
3. Reduced motion media query should simplify hero.
4. Benchmark bars need textual values, not only visuals.
5. Buttons must have visible focus ring.
6. Avoid long easing tails that cause visual fatigue.

---

## 19) Suggested File Structure

```text
apps/web/
  app/
    page.tsx
    globals.css
  components/home/
    home-page.tsx
    nav.tsx
    hero/
      hero-section.tsx
      hero-canvas.tsx
      hero-overlay.tsx
      use-hero-timeline.ts
      use-liquid-field.ts
      shaders/
        liquid.frag.glsl
        liquid.vert.glsl
    features/
      features-section.tsx
      feature-card.tsx
    benchmark/
      benchmark-section.tsx
      benchmark-row.tsx
    cta/
      cta-section.tsx
    footer/
      footer.tsx
  lib/motion/
    tokens.ts
    easings.ts
  lib/perf/
    use-performance-tier.ts
```

---

## 20) Build Order (phased)

### Phase 1

- section skeleton
- typography hierarchy
- spacing grid

### Phase 2

- hero canvas with static logo
- overlay text + nav

### Phase 3

- logo travel timeline
- simple procedural liquid distortion

### Phase 4

- settle ripple event
- benchmark animation

### Phase 5

- polish
- responsive tuning
- perf pass

---

## 21) Pseudocode: Top-level Page

```tsx
function HomePage() {
  return (
    <main className="bg-surface text-ink">
      <TopNav />
      <HeroSection />
      <FeaturesSection />
      <BenchmarkSection />
      <SecondaryCTASection />
      <SiteFooter />
    </main>
  );
}
```

---

## 22) Pseudocode: Hero Section

```tsx
function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  const timeline = useHeroTimeline({ prefersReducedMotion });

  return (
    <section className="relative min-h-screen overflow-hidden">
      <HeroCanvas timeline={timeline} reduced={prefersReducedMotion} />
      <HeroOverlay timeline={timeline} />
    </section>
  );
}
```

---

## 23) Pseudocode: Hero Timeline Hook

```ts
type HeroPhase = "preroll" | "travel" | "converge" | "settle" | "idle";

function useHeroTimeline(input: { prefersReducedMotion: boolean }) {
  const [phase, setPhase] = useState<HeroPhase>("preroll");
  const progress = useMotionValue(0);
  const velocity = useMotionValue(0);
  const settleImpulse = useMotionValue(0);

  useEffect(() => {
    if (input.prefersReducedMotion) {
      setPhase("idle");
      progress.set(1);
      velocity.set(0);
      settleImpulse.set(0);
      return;
    }

    // run deterministic timeline
    // update phase + progress + velocity
    // emit settleImpulse at landing moment
  }, [input.prefersReducedMotion]);

  return { phase, progress, velocity, settleImpulse };
}
```

---

## 24) Pseudocode: Hero Canvas Scene

```tsx
function HeroCanvas({ timeline, reduced }) {
  const perfTier = usePerformanceTier();
  const logoRef = useRef<Mesh>(null);
  const liquid = useLiquidField({ perfTier, reduced });

  useFrame((state, delta) => {
    if (!logoRef.current) return;

    // 1) compute logo transform from timeline.progress
    // 2) compute velocity from transform delta
    // 3) feed velocity + position into liquid.addImpulse(...)
    // 4) on settle event, liquid.addRing(...)
    // 5) update shader uniforms
  });

  return (
    <Canvas>
      <SceneLighting />
      <LiquidSurface materialUniforms={liquid.uniforms} />
      <LogoMesh ref={logoRef} />
    </Canvas>
  );
}
```

---

## 25) Pseudocode: Liquid Field Engine

```ts
function useLiquidField({ perfTier, reduced }) {
  const uniforms = useMemo(() => createUniforms(), []);

  function addImpulse(x: number, y: number, power: number) {
    // write localized disturbance into low-res field
  }

  function addRing(x: number, y: number, amplitude: number, radius: number) {
    // radial disturbance for settle splash
  }

  function step(dt: number) {
    // decay field over time
    // advect noise
    // clamp to stable range
  }

  return { uniforms, addImpulse, addRing, step };
}
```

---

## 26) Pseudocode: Overlay

```tsx
function HeroOverlay({ timeline }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
      <div className="max-w-3xl text-center">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl md:text-6xl"
        >
          The Modern API Index
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.9, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-4 max-w-2xl text-base md:text-lg"
        >
          Built for precise symbol, dependency, and version lookup across
          TypeScript packages.
        </motion.p>
      </div>
    </div>
  );
}
```

---

## 27) Pseudocode: Feature Section

```tsx
function FeaturesSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <SectionHeading
        title="Built for day-to-day engineering decisions"
        subtitle="Three practical workflows where NCI removes API guesswork."
      />

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <FeatureCard title="Search Real API Surfaces" body="..." />
        <FeatureCard title="Trace Dependency Context" body="..." />
        <FeatureCard
          title="Build Fast, Repeatable Indexes"
          body="..."
          className="md:col-span-2"
        />
      </div>
    </section>
  );
}
```

---

## 28) Pseudocode: Benchmark Section

```tsx
function BenchmarkSection() {
  const rows = [
    { label: "Index react + types", nci: 1.2, alt: 2.1 },
    { label: "Find symbol across 50 packages", nci: 0.18, alt: 0.67 },
    { label: "Query dependency metadata", nci: 0.05, alt: 0.23 },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <SectionHeading
        title="Performance you can feel"
        subtitle="Representative benchmark scenarios from real package workflows."
      />
      <BenchmarkChart rows={rows} />
    </section>
  );
}
```

---

## 29) Pseudocode: CTA + Footer

```tsx
function SecondaryCTASection() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h2>Get precise package context before you ship</h2>
      <p className="mx-auto mt-4 max-w-2xl text-muted">
        Explore full docs and integration guides to bring NCI into your
        workflow.
      </p>
      <a
        href="/docs"
        className="mt-8 inline-flex h-11 items-center rounded-full bg-primary px-6 text-white"
      >
        Read Documentation
      </a>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <a href="https://github.com/..." aria-label="GitHub">
          GitHub
        </a>
      </div>
    </footer>
  );
}
```

---

## 30) Risk Register

1. Hero effects may look heavy on low-end devices.
2. Text readability can drop over dynamic backgrounds.
3. Too much motion can feel noisy.
4. Benchmark claims may be questioned if not reproducible.
5. Overbuilding first pass can delay shipping.

Mitigations:

- tiered rendering
- strict readability checks
- motion budget
- benchmark methodology note
- phased rollout

---

## 31) Benchmark Methodology Note

When publishing benchmark visuals:

- list machine class
- list data set
- list command/query shape
- list run count
- show median

No exaggerated claims.

---

## 32) CSS/Tailwind Conventions for this page

1. Use semantic token classes only.
2. Avoid direct hex in components.
3. Keep spacing on an 8px rhythm.
4. Prefer `max-w-*` constraints for readability.
5. Heading/subheading width constraints must be explicit.
6. Preserve generous top and bottom spacing around section headings.
7. Maintain consistent section paddings.

---

## 33) Section-by-Section Content Constraints

### Hero

- heading <= 8 words
- subheading <= 20 words

### Features

- card heading <= 6 words
- card body <= 18 words

### Benchmark

- heading <= 6 words
- subheading <= 16 words

### Secondary CTA

- heading <= 9 words
- subheading <= 18 words

---

## 34) Scroll Choreography

1. Hero enters on load.
2. Features animate in when 20% visible.
3. Benchmark bars animate once when 25% visible.
4. CTA fades in with slight upward translate.
5. Footer remains static.

Do not use parallax-heavy patterns.

---

## 35) Reduced Motion Variant

When `prefers-reduced-motion`:

- skip logo travel.
- render logo in centered final state.
- keep the liquid surface static.
- disable bar growth animation; render final values.

---

## 36) Pseudocode: Reduced Motion Gate

```ts
const reduced = useReducedMotion();

if (reduced) {
  renderHero({ mode: "static" });
  renderBenchmark({ animate: false });
} else {
  renderHero({ mode: "animated" });
  renderBenchmark({ animate: true });
}
```

---

## 37) Engineering Checklist (line-by-line)

The following checklist is intentionally long and explicit so nothing is left ambiguous.

1. Create `components/home/home-page.tsx`.
2. Move page composition into `HomePage`.
3. Keep `app/page.tsx` as thin wrapper.
4. Add `TopNav` component.
5. Add `HeroSection` component.
6. Add `FeaturesSection` component.
7. Add `BenchmarkSection` component.
8. Add `SecondaryCTASection` component.
9. Add `SiteFooter` component.
10. Define shared section container utility class.
11. Define shared heading block component.
12. Add motion token file.
13. Add easing token file.
14. Add performance tier hook.
15. Add reduced motion helper.
16. Add viewport enter hook for section triggers.
17. Add logo asset loader abstraction.
18. Add OBJ load error fallback UI.
19. Add hero canvas component shell.
20. Add hero scene lights.
21. Add hero camera rig.
22. Add logo mesh placeholder.
23. Add timeline hook skeleton.
24. Add phase state enum.
25. Implement phase transitions.
26. Implement progress interpolation.
27. Implement velocity tracking.
28. Emit settle event.
29. Add liquid field state structure.
30. Add liquid uniforms structure.
31. Add liquid simulation step function.
32. Add impulse injection function.
33. Add ring injection function.
34. Add decay function.
35. Add clamp function.
36. Connect timeline velocity to impulses.
37. Connect settle event to ring impulse.
38. Add low-res field render target.
39. Add upscale pass.
40. Add distortion pass.
41. Tune displacement amplitude defaults.
42. Add perf-tier amplitude scaling.
43. Add DPR clamp logic.
44. Add frame skip on low tier.
45. Add document visibility pause.
46. Add cleanup on unmount.
47. Add overlay container.
48. Add hero heading.
49. Add hero subheading.
50. Add overlay fade-in animation.
51. Add overlay translate animation.
52. Add max-width constraints.
53. Add readability background strategy.
54. Add backdrop-filter gate.
55. Add nav logo placeholder.
56. Add nav center links.
57. Add nav GitHub action.
58. Add nav scroll threshold state.
59. Add nav style transition.
60. Add section spacing constants.
61. Add feature card component.
62. Add feature card content props.
63. Add 2x2 grid layout with span.
64. Add custom SVG slot area.
65. Add feature heading/subheading block.
66. Add card hover micro motion.
67. Add card border token usage.
68. Add benchmark section layout.
69. Add benchmark data model.
70. Add benchmark row component.
71. Add baseline bar style.
72. Add NCI highlight bar style.
73. Add bar enter animation.
74. Add value label animation.
75. Add benchmark caption note.
76. Add benchmark methodology placeholder.
77. Add secondary CTA layout.
78. Add docs button.
79. Add CTA copy.
80. Add footer layout.
81. Add footer left logo.
82. Add footer right GitHub.
83. Ensure no emoji/icons in cards.
84. Ensure no decorative noise.
85. Ensure semantic heading hierarchy.
86. Ensure keyboard focus states.
87. Ensure button focus ring.
88. Ensure link underlines on focus.
89. Ensure sufficient color contrast.
90. Ensure reduced motion branch tested.
91. Ensure hero static fallback tested.
92. Ensure mobile hero scale tuned.
93. Ensure tablet hero scale tuned.
94. Ensure desktop hero scale tuned.
95. Ensure hero text legibility on all tiers.
96. Ensure nav readability over canvas.
97. Ensure benchmark labels wrap correctly.
98. Ensure feature card copy lengths constrained.
99. Ensure CTA copy length constrained.
100. Ensure footer spacing balanced.
101. Add snapshot images for visual baseline.
102. Add section-level storybook.
103. Add unit tests for timeline math.
104. Add unit tests for liquid decay clamp.
105. Add integration test for reduced motion.
106. Add integration test for nav links.
107. Add integration test for docs button.
108. Add performance measurement script.
109. Add FPS debug panel in dev only.
110. Add memory leak checks in dev.
111. Add route transition reset logic.
112. Add lazy load for hero heavy modules.
113. Add suspense fallback for canvas.
114. Add hydration-safe guards.
115. Add error boundary around hero.
116. Add no-webgl fallback section.
117. Add static logo fallback image.
118. Add low-power mode detection.
119. Add prefetch docs route.
120. Add nav active style states.
121. Add consistent border radius scale.
122. Add vertical rhythm utilities.
123. Add responsive typography rules.
124. Add heading tracking overrides.
125. Add paragraph line-height baseline.
126. Add section intro width limits.
127. Add card body width controls.
128. Add benchmark row height controls.
129. Add animation delay harmonization.
130. Add global motion disable debug flag.
131. Add CSS variables for motion durations.
132. Add CSS variables for motion easing names.
133. Add token documentation update.
134. Add implementation notes in guidelines.
135. Add known constraints list.
136. Add improvements list.
137. Add TODO for docs/index center nav action.
138. Add TODO for backend search integration hook.
139. Add TODO for VPN sqlite service integration.
140. Add TODO for custom docs theme link validation.
141. Verify no section uses gradients.
142. Verify no heavy box shadows.
143. Verify no random iconography.
144. Verify no inconsistent spacing jumps.
145. Verify no text clipping in hero.
146. Verify no benchmark overflow on mobile.
147. Verify no CLS during hero init.
148. Verify no janky first frame.
149. Verify no stale animation state after refresh.
150. Verify no hidden focusable controls.
151. Verify top nav touch target sizes.
152. Verify docs button touch target size.
153. Verify footer link touch target size.
154. Verify section IDs for deep links.
155. Verify semantic landmarks used.
156. Verify ARIA labels where needed.
157. Verify canvas is marked decorative.
158. Verify heading message is concise.
159. Verify subheading message is concise.
160. Verify feature copy is practical, not abstract.
161. Verify benchmark headings are factual.
162. Verify CTA wording is clear.
163. Verify all external links safe attributes.
164. Verify tab order natural.
165. Verify font loading strategy `swap`.
166. Verify no FOIT.
167. Verify line-height consistency.
168. Verify tracking consistency for headings.
169. Verify no over-tight tracking on mobile.
170. Verify all section paddings on mobile.
171. Verify all section paddings on desktop.
172. Verify hero min-height behavior with browser chrome.
173. Verify safe-area insets.
174. Verify no horizontal overflow.
175. Verify benchmark units visible.
176. Verify benchmark source note present.
177. Verify fallback data path for benchmark.
178. Verify static export compatibility.
179. Verify server/client boundary correctness.
180. Verify no hydration warnings.
181. Verify no stale refs in useFrame.
182. Verify no allocations in hot render loop.
183. Verify uniforms are memoized.
184. Verify texture updates are bounded.
185. Verify event listeners cleaned up.
186. Verify RAF loops are canceled.
187. Verify reduced motion and perf tier interplay.
188. Verify quality downgrade path.
189. Verify quality upgrade path.
190. Verify deterministic animation start.
191. Verify deterministic settle event.
192. Verify timeline restart behavior.
193. Verify timeline pause/resume behavior.
194. Verify route leave cleanup.
195. Verify route enter initialization.
196. Verify benchmark animation once-only.
197. Verify benchmark animation replay option in dev.
198. Verify nav transition not distracting.
199. Verify footer remains visually lightweight.
200. Verify all tokens come from globals theme.
201. Add audit pass for color usage.
202. Add audit pass for spacing usage.
203. Add audit pass for typography usage.
204. Add audit pass for motion usage.
205. Add audit pass for accessibility usage.
206. Add audit pass for performance usage.
207. Add final copy review pass.
208. Add legal/trademark review for logo use.
209. Add benchmark claims review.
210. Add docs link final target.
211. Add GitHub link final target.
212. Add center nav index route target.
213. Add analytics event for docs CTA.
214. Add analytics event for GitHub click.
215. Add analytics event for center index click.
216. Add hero loaded event.
217. Add benchmark viewed event.
218. Add features viewed event.
219. Add CTA viewed event.
220. Add basic route performance tracing.
221. Add render timing logs in dev.
222. Add screenshot diff baseline for hero.
223. Add screenshot diff baseline for features.
224. Add screenshot diff baseline for benchmark.
225. Add screenshot diff baseline for CTA/footer.
226. Add mobile screenshot baseline.
227. Add desktop screenshot baseline.
228. Add reduced motion screenshot baseline.
229. Add no-webgl screenshot baseline.
230. Add commit guard for accidental gradient use.
231. Add stylelint rule.
232. Add lint rule for restricted classes.
233. Add content guidelines to docs.
234. Add section ownership notes.
235. Add quick tuning knobs list.
236. Add emergency fallback toggle.
237. Add hard-disable hero env var in production incidents.
238. Add safe default for unknown perf tier.
239. Add static fallback for benchmark if JS disabled.
240. Add nav fallback for no JS.
241. Add CTA fallback for no JS.
242. Add baseline readability test with blur disabled.
243. Add baseline readability test with blur enabled.
244. Add baseline readability test with high zoom.
245. Add baseline readability test with 200% text size.
246. Add localization readiness check for heading lengths.
247. Add localization readiness check for feature card lengths.
248. Add localization readiness check for benchmark labels.
249. Add RTL readiness note.
250. Add final polish pass ticket.
251. Finalize hero copy.
252. Finalize feature copy.
253. Finalize benchmark copy.
254. Finalize CTA copy.
255. Finalize nav labels.
256. Finalize footer labels.
257. Run full lint/type checks.
258. Run performance checks.
259. Run accessibility checks.
260. Approve and ship homepage v1.

---

## 38) Final Direction

Use a **system-first build**:

- ship section structure + typography baseline first
- then integrate hero canvas in controlled phases
- enforce motion/perf tokens from day one
- keep copy concise and technical

This gives you:

- design control
- engineering predictability
- easy iteration without rework

---

## 39) Next command-ready implementation start

Immediate next actionable build sequence:

1. scaffold section components
2. wire page composition
3. ship static hero + overlay text
4. integrate logo model
5. add timeline + liquid v1
6. tune and benchmark

---

## 40) Owner Notes

- You are driving creative direction.
- This document is built to be edited with your taste.
- Every section should be treated as composable, not final.
- Keep constraints tight to protect quality.
