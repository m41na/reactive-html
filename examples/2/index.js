import {
  reactive,
  ReactiveHTMLParser,
  createBindings,
  GlobalErrorHandler,
} from './re-html';

GlobalErrorHandler.setErrorHandler((errorInfo) => {
  const log = document.getElementById('error-log');
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'padding: 5px; margin: 5px 0; background: #fee; border-left: 3px solid #f00;';
  errorDiv.innerHTML = `
    <strong>Error caught:</strong> ${errorInfo.error.message}<br>
    <small>Type: ${errorInfo.context.type}</small><br>
    <small>Time: ${new Date(errorInfo.timestamp).toLocaleTimeString()}</small>
  `;
  log.appendChild(errorDiv);
  
  // Keep only last 5 errors
  while (log.children.length > 5) {
    log.removeChild(log.firstChild);
  }
});

const model = reactive({
  app: {
    items: [
      { id: 1, name: 'Good Item' },
      { id: 2, name: 'Another Good Item' }
    ],
    
    goodOperation() {
      alert('This works perfectly!');
    },
    
    badOperation() {
      throw new Error('Intentional error - but app keeps working!');
    },
    
    addBadItem() {
      this.items.push({
        id: Date.now(),
        name: null // This will cause toUpperCase() to fail
      });
    }
  }
});

const parser = new ReactiveHTMLParser();
const root = document.querySelector('[data-model]');
const parsed = parser.parse(root);
createBindings(parsed, model);

console.log('✅ Error boundaries active! Try clicking the error button.');