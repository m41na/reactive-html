# ReactiveHTML 🚀

**A lightweight, zero-dependency reactive framework that brings Vue-like reactivity directly to HTML.**

No build step. No virtual DOM. No JSX. Just HTML with superpowers.

## Why ReactiveHTML?
```html
<!-- This just works. No compilation needed. -->
<div data-model="app">
  <input :model="username">
  <p>Hello, <span :text="username"></span>!</p>
</div>

<script src="reactive-html.js"></script>
<script>
  const model = ReactiveHTML.reactive({
    app: { username: 'World' }
  });

  const parser = new ReactiveHTML.ReactiveHTMLParser();
  const root = document.querySelector('[data-model]');
  const parsed = parser.parse(root);
  ReactiveHTML.createBindings(parsed, model);
</script>
```

That's it. Type in the input, the text updates. Change the model, the input updates. Pure reactivity, zero magic. [Read more...](./MARKETING.md)

## Features

✅ Reactive Data - Deep reactivity for objects and arrays

✅ Two-Way Binding - :model for forms (text, checkbox, radio, select, textarea)

✅ Loops - :each with keyed reconciliation for efficient updates

✅ Conditionals - :if/:else-if/:else with lazy evaluation

✅ Events - @click, @input, etc. with proper this binding

✅ Computed Properties - Cached, reactive derived state

✅ Batch Updates - Automatic batching with requestAnimationFrame

✅ Zero Dependencies - Pure JavaScript, no build step

✅ Tiny Size - ~15KB minified (~5KB gzipped)

## Installation
### CDN
```html
html<script src="https://unpkg.com/reactive-html@latest/dist/reactive-html.js"></script>
```
### NPM
```bash
npm install reactive-html
```
```javascript
import { reactive, ReactiveHTMLParser, createBindings } from 'reactive-html';
```

## Quick Start
1. Reactive Data Binding
```html
<div data-model="app">
  <h1 :text="title"></h1>
  <p :text="description"></p>
</div>

<script>
  const model = ReactiveHTML.reactive({
    app: {
      title: 'Hello World',
      description: 'Reactivity made simple'
    }
  });

  // Parse and bind
  const parser = new ReactiveHTML.ReactiveHTMLParser();
  const root = document.querySelector('[data-model]');
  const parsed = parser.parse(root);
  ReactiveHTML.createBindings(parsed, model);

  // Changes automatically update the DOM
  setTimeout(() => {
    model.app.title = 'Hello ReactiveHTML!';
  }, 2000);
</script>
```

2. Two-Way Form Binding
```html
<form data-model="form">
   <input type="text" :model="username" placeholder="Username">
   <input type="email" :model="email" placeholder="Email">

  <label>
    <input type="checkbox" :model="subscribe">
    Subscribe to newsletter
  </label>

<button @click="submit()">Submit</button>

  <pre :text="JSON.stringify(this, null, 2)"></pre>
</form>

<script>
  const model = ReactiveHTML.reactive({
    form: {
      username: '',
      email: '',
      subscribe: false,

      submit() {
        console.log('Form data:', {
          username: this.username,
          email: this.email,
          subscribe: this.subscribe
        });
      }
    }
  });
</script>
```

3. Lists with Loops
 ```html
<div data-model="app">
   <button @click="addItem()">Add Item</button>

  <ul>
    <li :each="item in items" :key="item.id">
      <span :text="item.name"></span>
      <button @click="removeItem(item.id)">Remove</button>
    </li>
  </ul>
</div>

<script>
  const model = ReactiveHTML.reactive({
    app: {
      items: [
        { id: 1, name: 'Coffee' },
        { id: 2, name: 'Tea' }
      ],

      addItem() {
        this.items.push({
          id: Date.now(),
          name: `Item ${this.items.length + 1}`
        });
      },

      removeItem(id) {
        const index = this.items.findIndex(i => i.id === id);
        this.items.splice(index, 1);
      }
    }
  });
</script>
```

4. Conditionals
```html
<div data-model="app">
   <button @click="toggle()">Toggle</button>

  <p :if="count === 0">No items</p>
  <p :else-if="count < 5">A few items</p>
  <p :else>Many items!</p>
</div>

<script>
  const model = ReactiveHTML.reactive({
    app: {
      count: 0,
      toggle() {
        this.count = (this.count + 1) % 10;
      }
    }
  });
</script>
```

5. Computed Properties
 ```html
<div data-model="cart">
  <div :each="item in items" :key="item.id">
    <span :text="item.name"></span> - $<span :text="item.price"></span>
  </div>

  <div>
    <strong>Total:</strong> $<span :text="total.toFixed(2)"></span>
  </div>
</div>

<script>
  const model = ReactiveHTML.reactive({
    cart: {
      items: [
        { id: 1, name: 'Coffee', price: 4.50 },
        { id: 2, name: 'Tea', price: 3.00 }
      ],

      // Computed property using getter
      get total() {
        return this.items.reduce((sum, item) => sum + item.price, 0);
      }
    }
  });
</script>
```

## API Reference
### Directives
#### Property Binding

- :text - Set textContent
- :html - Set innerHTML (use carefully)
- :value - Set value attribute
- :class - Set class (object or string)
- :style - Set style (object or string)
- :disabled, :checked, etc. - Set boolean attributes
- :model - Two-way binding for form inputs

#### Event Binding

- @click, @input, @change, etc. - Attach event listeners
- Access event with $event, element with $element, target with $target

#### Control Flow

- :each="item in items" - Loop over arrays
- :key="item.id" - Key for efficient updates
- :if="condition" - Conditional rendering
- :else-if="condition" - Else-if branch
- :else - Else branch

#### Component Binding

- data-model="modelName" - Bind element to model property

### Core API
```reactive(obj)```

Makes an object reactive with deep reactivity.
```javascript
const state = reactive({
count: 0,
user: { name: 'John' }
});

state.count++; // Triggers updates
state.user.name = 'Jane'; // Also triggers updates
```

```computed(getter, context)```

Creates a computed property that caches its value.
```javascript
const doubled = computed(() => state.count * 2);
console.log(doubled.value); // 0
state.count++;
console.log(doubled.value); // 2
```

```batch(fn)```

Executes multiple updates in a single batch.
```javascript
batch(() => {
state.count++;
state.user.name = 'Jane';
state.items.push(...newItems);
});
// Only one DOM update!
```

```nextTick(callback)```

Waits for the next DOM update cycle.
```javascript
state.count++;
await nextTick();
console.log('DOM updated!');
```

## Comparison
| Feature         | ReactiveHTML | Vue        | React      | Svelte     |
|-----------------|--------------|------------|------------|------------|
| Build Step      | ❌ None       | ✅ Required | ✅ Required | ✅ Required |
| Virtual DOM     | ❌            | ✅          | ✅          | ❌          |
| Bundle Size     | 5KB          | 34KB       | 44KB       | varies     |
| Two-Way Binding | ✅            | ✅          | ❌          | ✅          |
| Computed        | ✅            | ✅          | ❌          | ✅          |
| Learning Curve  | Minimal      | Medium     | Steep      | Medium     |

## Philosophy
- HTML First. Your HTML is your template. No JSX, no template strings, no separate files.
- Zero Magic. Everything is explicit. If you can read HTML and JavaScript, you can read ReactiveHTML.
- Progressive Enhancement. Start with static HTML, add reactivity where you need it.
- Framework Weight Zero. No build tools, no CLI, no ecosystem. Just drop in the script and go.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

(Basically any browser with Proxy support)

## Contributing
Contributions welcome! This is a learning project that became surprisingly useful.
License
MIT © 2025

Made with ❤️ and a lot of coffee.
"Sometimes the best framework is the one you build yourself."
