import {
  reactive,
  ReactiveHTMLParser,
  createBindings,
  registerComponent
} from './re-html.js';

console.log('=== STARTING COMPONENT TEST ===');
  
(async () => {
  try {
    // Register component
    console.log('1. Registering component...');
    await registerComponent('counter-component', './component/Counter.html');
    console.log('   ✅ Component registered');
    
    // Create model
    console.log('2. Creating model...');
    const model = reactive({
      app: {}
    });
    console.log('   ✅ Model created');
    
    // Parse
    console.log('3. Parsing DOM...');
    const parser = new ReactiveHTMLParser();
    const root = document.querySelector('#app');
    const parsed = parser.parse(root);
    console.log('   ✅ DOM parsed, type:', parsed.type);
    console.log('   Children:', parsed.children.map(c => c.type));
    
    // Create bindings
    console.log('4. Creating bindings...');
    createBindings(parsed, model);
    console.log('   ✅ Bindings created');
    
    console.log('=== TEST COMPLETE ===');
    
    // Wait a bit and check if components are still alive
    setTimeout(() => {
      console.log('\n=== 5 SECONDS LATER ===');
      console.log('Component should still be mounted');
      console.log('Try clicking the buttons!');
    }, 5000);
    
  } catch (error) {
    console.error('❌ ERROR:', error);
    console.error(error.stack);
  }
})();