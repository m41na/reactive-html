import {reactive} from "./temp/reactive";
import {ReactiveHTMLParser} from "./temp/parser";
import {createBindings} from "./temp/binding";

// Initialize the system
const parser = new ReactiveHTMLParser();
const root = document.querySelector('re-shopping-cart');

// Create reactive model
const model = reactive({
  cart: {
    items: [
      { id: 1, name: 'Coffee', price: 4.50 },
      { id: 2, name: 'Bagel', price: 3.00 },
      { id: 3, name: 'Tea', price: 3.50 }
    ],

    removeItem(id) {
      const index = this.items.findIndex(item => item.id === id);
      if (index !== -1) {
        this.items.splice(index, 1);
      }
    },

    addRandomItem() {
      const names = ['Sandwich', 'Salad', 'Soup', 'Cookie', 'Muffin'];
      const name = names[Math.floor(Math.random() * names.length)];
      const price = (Math.random() * 10 + 2).toFixed(2);
      const id = Date.now();

      this.items.push({ id, name, price: parseFloat(price) });
    },

    sortByPrice() {
      this.items.sort((a, b) => a.price - b.price);
    }
  }
});

// Parse and create bindings
const parsed = parser.parse(root);
createBindings(parsed, model);

console.log('Shopping cart is now reactive!');
console.log('Try adding items, removing items, or sorting in the browser!');
