import {reactive} from "../reactive";
import {ReactiveHTMLParser} from "../parser";
import {createBindings} from "../binding";

// 1. Create reactive model
const model = reactive({
  cart: {
    items: [
      { id: 1, name: 'Coffee', price: 4.50 },
      { id: 2, name: 'Bagel', price: 3.00 }
    ]
  }
});

// 2. Parse HTML
const parser = new ReactiveHTMLParser();
const html = `
  <re-shopping-cart data-model="cart">
    <h2>Shopping Cart</h2>
    <div :each="item in items" :key="item.id">
      <span :text="item.name"></span>
      <span :text="'$' + item.price"></span>
      <button @click="items.splice(items.indexOf(item), 1)">Remove</button>
    </div>
    <div class="total">
      Total: <span :text="'$' + items.reduce((s,i) => s + i.price, 0)"></span>
    </div>
  </re-shopping-cart>
`;

document.body.innerHTML = html;
const root = document.querySelector('re-shopping-cart');
const parsed = parser.parse(root);

// 3. Create bindings
createBindings(parsed, model);

// 4. Now it's live! Changes to model update DOM automatically
setTimeout(() => {
  model.cart.items.push({ id: 3, name: 'Tea', price: 3.50 });
  // DOM automatically updates with new item!
}, 2000);

setTimeout(() => {
  model.cart.items[0].price = 5.00;
  // Price updates, total recalculates, DOM updates!
}, 4000);
