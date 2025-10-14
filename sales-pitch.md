# The Problem Nobody Asked Me to Solve

I was tired. Not physically tired—mentally exhausted from the JavaScript framework fatigue that's been plaguing developers for the past decade.

You know the drill:

- Install Node.js
- Run ```npm create vite@latest```
- Wait for 500MB of dependencies
- Learn a new templating syntax (JSX? SFC? Svelte syntax?)
- Configure webpack/vite/rollup
- Set up HMR
- Learn the framework's mental model
- Finally write <div>Hello World</div>

What if I told you there's a better way?

## The Epiphany: HTML Doesn't Need Fixing

Here's a radical idea: HTML is already a perfectly good templating language.
What if instead of replacing HTML with JSX/SFC/templates, we just... enhanced it?
This is ReactiveHTML. No build step. No compilation. Just HTML with a script tag. Save as index.html, open in browser, type in the input. It just works.
No build step. No bundler. No framework CLI. No 200,000 files in node_modules.

### "But We Already Have..."

#### React
"React is the industry standard!"
Cool. React is great for large SPAs with complex state management. But do you really need 44KB of framework (minified!) to add a shopping cart to your static site?
ReactiveHTML: 5KB gzipped.

#### Vue
"Vue has great DX and is easier than React!"
Absolutely. Vue is wonderful. But it still requires a build step for SFCs, Vite for development, and a mental model shift from "HTML with JavaScript" to "Vue components."
ReactiveHTML: Write HTML. Add reactivity where you need it.

#### Svelte
"Svelte compiles away the framework!"
True, and that's brilliant. But it's still a compiler. You're still writing Svelte syntax, not HTML. You still need a build pipeline.
ReactiveHTML: No compilation. It's already compiled—it's just JavaScript.

#### Alpine.js
"This sounds like Alpine!"
Alpine is AWESOME and was a huge inspiration. But Alpine has limitations:

- No keyed list reconciliation (inefficient updates)
- No computed properties with caching
- Limited to inline expressions (no complex logic)
- No component composition story

ReactiveHTML: Full reactive system with computed properties, keyed reconciliation, and automatic batching.

## The Philosophy: HTML-First Reactivity
1. Zero Build Step

Drop a script tag in your HTML. That's it. No webpack, no vite, no babel, no nothing.
Perfect for:

- Adding interactivity to static sites
- Prototyping without setup overhead
- Server-rendered pages that need client-side enhancement
- Learning reactivity without framework complexity

2. Progressive Enhancement

Start with static HTML. Add data-model="app" to make it reactive. Add :text bindings where you need them. Add :each for lists. Add :model for forms.
Enhance, don't replace.

3. Real JavaScript

That's just JavaScript. No special syntax. No .value unwrapping. No magic.
You can use:

- Array methods (map, filter, reduce)
- Object spread ({ ...user })
- Template literals
- Any JavaScript you know

4. Explicit Over Implicit

Everything is explicit:

- data-model="app" - This element uses the app model
- :text="name" - Bind textContent to name
- :model="email" - Two-way bind to email
- @click="submit()" - Call submit() on click

No magic. No auto-registration. No "convention over configuration."

## The Features You Actually Need
### Two-Way Binding
All form inputs supported. Works exactly like Vue's v-model. Text inputs, checkboxes (boolean and array), radio buttons, selects (single and multiple), textareas.

### Lists with Keyed Reconciliation
Efficient DOM updates. Only changed items re-render. Uses the same diffing algorithm as React/Vue.

### Conditionals
Lazy evaluation. Branches only parse when first shown. Full support for if/else-if/else chains.

### Computed Properties
Automatic caching. Recomputes only when dependencies change. Use native JavaScript getters.

### Batch Updates
Multiple changes equal one DOM update. Automatic batching with requestAnimationFrame. 100 array mutations equal 1 DOM paint. Not 100.

## Real-World Example: Shopping Cart
A complete working shopping cart in 100 lines. Two-way binding, computed total, keyed list updates, conditional rendering, event handling. No build step. No dependencies.

## When NOT to Use ReactiveHTML
Let's be honest about limitations:

### Large SPAs
If you're building the next Gmail or Figma, use React/Vue/Svelte. They have better tooling, bigger ecosystems, and are battle-tested at scale.

### Team Standardization
If your team is already invested in React, switching to ReactiveHTML adds cognitive overhead. Standardization has value.

### Complex State Management
No built-in router. No built-in state management like Redux/Pinia. You'll need to bring your own or keep state simple.

### TypeScript
No first-class TypeScript support (yet). If your project demands TypeScript, this might not be the best fit.

## When TO Use ReactiveHTML

### Adding Interactivity to Static Sites
You have a static site and need a shopping cart, a contact form, or a search filter. Drop in one script tag. Done.

### Rapid Prototyping
No setup time. No dependencies. Just write HTML and see it work instantly.

### Learning Reactivity
Understand how reactive frameworks work by using one that's simple and transparent. No magic, no build tools, just JavaScript.

### Progressive Enhancement
You have server-rendered HTML and need client-side interactivity. Enhance what's already there instead of replacing it.

### Small Projects
Personal sites, landing pages, marketing sites, portfolios. Projects where framework overhead feels like overkill.

## The Tech
Under the hood:

- Proxy-based reactivity (like Vue 3)
- Signal system with automatic dependency tracking
- Keyed reconciliation for efficient list updates
- Batch scheduler using requestAnimationFrame
- Computed properties with smart caching
- MutationObserver for automatic cleanup

All in 15KB minified (5KB gzipped).

## Getting Started

1. Download reactive-html.js
2. Add script tag to HTML
3. Write data-model="app" on an element
4. Create reactive model
5. Parse and bind
6. Start coding

That's it. Five steps. No npm install. No webpack config. No build process.

## The Bottom Line
ReactiveHTML isn't trying to replace React or Vue or Svelte. It's not trying to be the next big thing.

It's trying to be the framework you reach for when you don't want a framework.

When you just want to add some reactivity to HTML without the ceremony, the tooling, the build step, the dependencies.

__Sometimes the best framework is barely a framework at all.__

##
Try it. Break it. Fork it. Learn from it.

Or just use it to add a shopping cart to your blog.

Either way, it's there. Zero dependencies. Zero build step. Zero excuses.

Made with coffee and determination.

__"Sometimes the best tool is the one you understand completely."__