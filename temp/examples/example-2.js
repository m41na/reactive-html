import {Signal} from "../signal";
import {EffectTracker} from "../effects";
import {reactive} from "../reactive";

// Example 1
// Create signals
const firstName = new Signal('John');
const lastName = new Signal('Doe');

// Create a computed effect
const fullName = new Signal('');

const effect = EffectTracker.create(() => {
  // These Signal.value accesses are automatically tracked
  fullName.value = firstName.value + ' ' + lastName.value;
  console.log('Full name updated:', fullName.value);
});

// Logs: "Full name updated: John Doe"

firstName.value = 'Jane';
// Logs: "Full name updated: Jane Doe"
// Effect automatically re-runs because firstName changed!

lastName.value = 'Smith';
// Logs: "Full name updated: Jane Smith"
// Effect automatically re-runs because lastName changed!

// Example 2

// Create a reactive object
const cart = reactive({
  items: [
    { id: 1, name: 'Coffee', price: 4.50 },
    { id: 2, name: 'Bagel', price: 3.00 }
  ],
  total: 0
});

// Create an effect to compute total
EffectTracker.create(() => {
  cart.total = cart.items.reduce((sum, item) => sum + item.price, 0);
  console.log('Total:', cart.total);
});
// Logs: "Total: 7.50"

// Add an item - effect auto-runs!
cart.items.push({ id: 3, name: 'Tea', price: 3.50 });
// Logs: "Total: 11.00"

// Change a price - effect auto-runs!
cart.items[0].price = 5.00;
// Logs: "Total: 11.50"

// Remove an item - effect auto-runs!
cart.items.splice(1, 1);
// Logs: "Total: 8.50"
