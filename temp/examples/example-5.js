import {
  reactive,
  ReactiveHTMLParser,
  createBindings,
  bindingRegistry
} from './re-html';

// Initialize parser
const parser = new ReactiveHTMLParser();
const root = document.querySelector('re-shopping-cart');

// Create reactive model
const model = reactive({
  cart: {
    items: [],

    removeItem(id) {
      const index = this.items.findIndex(item => item.id === id);
      if (index !== -1) {
        this.items.splice(index, 1);
      }
    },

    addRandomItem() {
      const names = ['Coffee', 'Bagel', 'Tea', 'Muffin', 'Juice'];
      const name = names[Math.floor(Math.random() * names.length)];
      const price = parseFloat((Math.random() * 5 + 2).toFixed(2));
      const id = Date.now();

      this.items.push({ id, name, price });
    },

    addExpensiveItem() {
      const names = ['Steak', 'Lobster', 'Champagne', 'Caviar'];
      const name = names[Math.floor(Math.random() * names.length)];
      const price = parseFloat((Math.random() * 5 + 8).toFixed(2));
      const id = Date.now();

      this.items.push({ id, name, price });
    },

    clearCart() {
      console.log('=== CLEAR CART CALLED ===');
      console.log('this:', this);
      console.log('this.items BEFORE:', this.items.length);

      this.items = [];

      console.log('this.items AFTER:', this.items.length);
      console.log('Is new array reactive?', this.items.__isReactive);
      console.log('Does new array have __version?', this.items.__version);
    }
  }
});

// Parse and create bindings
const parsed = parser.parse(root);
createBindings(parsed, model);

console.log('✅ Shopping cart with conditionals is now reactive!');
console.log('Active bindings:', bindingRegistry.count);

// Update debug info every second
setInterval(() => {
  const debugSpans = document.querySelectorAll('[data-model] div:last-child span');
  if (debugSpans[0]) {
    debugSpans[0].textContent = bindingRegistry.count;
  }
}, 1000);
