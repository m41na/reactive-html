import {
  reactive,
  ReactiveHTMLParser,
  createBindings,
  registerComponent
} from './re-html';

// STEP 1: Register component
await registerComponent('counter-component', '/Counter.html');
  
// STEP 2: Create model
const model = reactive({
  app: {
    counters: [],
    
    addCounter() {
      alert('Dynamic component addition coming soon!');
    }
  }
});

// STEP 3: Parse and bind
const parser = new ReactiveHTMLParser();
const root = document.querySelector('[data-model]');
const parsed = parser.parse(root);
createBindings(parsed, model);

console.log('✅ Components loaded and mounted!');