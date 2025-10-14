import { ReactiveHTMLParser, ParsedElement, AttributeBinding, LoopConfig, ConditionalConfig} from '../parser';

// Create a parser instance
const parser = new ReactiveHTMLParser();

// Set up test HTML
document.body.innerHTML = `
  <re-shopping-cart data-model="cart">
    <h2>Shopping Cart</h2>

    <div :each="item in items" :key="item.id">
      <span :text="item.name"></span>
      <span :text="item.price"></span>

      <div :if="item.onSale">
        <span class="badge">SALE!</span>
      </div>
      <div :else>
        <button @click="addToCart(item)">Add to Cart</button>
      </div>
    </div>

    <div :if="items.length === 0">
      <p>Your cart is empty</p>
    </div>
    <div :else-if="items.length < 5">
      <p>You have a few items</p>
    </div>
    <div :else>
      <p>Your cart is full!</p>
    </div>

    <div class="total">
      <span :text="'Total: $' + total"></span>
    </div>
  </re-shopping-cart>
`;

// Parse the element
const root = document.querySelector('re-shopping-cart');
const parsed = parser.parse(root);

// Inspect the result
console.log('Parsed tree:', parsed);
console.log('Custom elements found:', parser.getCustomElements());

// Examine loop config
const loopElement = parsed.children.find(c => c.type === 'loop');
if (loopElement) {
  console.log('Loop config:', loopElement.loopConfig);
  console.log('  Item var:', loopElement.loopConfig.itemVar);
  console.log('  Source:', loopElement.loopConfig.source);
  console.log('  Key expression:', loopElement.loopConfig.keyExpression);
}

// Examine conditional config
const conditionalElement = parsed.children.find(c => c.type === 'conditional');
if (conditionalElement) {
  console.log('Conditional config:', conditionalElement.conditionalConfig);
  console.log('  Branches:', conditionalElement.conditionalConfig.branches.length);
  conditionalElement.conditionalConfig.branches.forEach((branch, i) => {
    console.log(`  Branch ${i}: ${branch.type} - ${branch.expression}`);
  });
}

// Examine bindings
parsed.children.forEach((child, i) => {
  if (child.bindings.length > 0) {
    console.log(`Element ${i} bindings:`, child.bindings);
  }
});
