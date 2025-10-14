import {EffectTracker} from "./effects";
import {LoopBindingFactory} from "./looping"
/**
 * Binding - Connects a Signal to a DOM update function
 *
 * Design principles:
 * - One binding per reactive attribute
 * - Automatic cleanup when element is removed
 * - Error isolation (one binding failure doesn't break others)
 * - Type-specific updaters (text, class, style, etc.)
 *
 * Lifecycle:
 * 1. Parse expression to find dependencies
 * 2. Create effect that evaluates expression
 * 3. Apply result to DOM
 * 4. Effect auto-re-runs when dependencies change
 * 5. Cleanup when element removed
 */
class Binding {
  constructor(element, attributeBinding, contextStack) {
    this.element = element;
    this.binding = attributeBinding;  // AttributeBinding from parser
    this.contextStack = contextStack;
    this.effect = null;
    this.cleanup = null;
    this.active = true;

    // Get the appropriate updater for this binding type
    this.updater = BindingUpdaters.get(attributeBinding.name);

    if (!this.updater) {
      console.warn(`No updater found for binding: ${attributeBinding.name}`);
      return;
    }

    // Create the reactive effect
    this._createEffect();
  }

  /**
   * Create an effect that evaluates the expression and updates DOM
   */
  _createEffect() {
    this.effect = EffectTracker.create(() => {
      if (!this.active) return;

      try {
        // Evaluate expression in context
        const value = this._evaluate();

        // Update the DOM
        this.updater(this.element, value, this.binding);

      } catch (error) {
        console.error(`Error in binding "${this.binding.name}":`, error);
        console.error(`Expression: ${this.binding.expression}`);
        console.error(`Element:`, this.element);
      }
    });
  }

  /**
   * Evaluate the binding expression in the current context
   */
  _evaluate() {
    return ExpressionEvaluator.evaluate(
      this.binding.expression,
      this.contextStack
    );
  }

  /**
   * Stop this binding and clean up
   */
  destroy() {
    this.active = false;
    if (this.effect) {
      this.effect.stop();
      this.effect = null;
    }
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
  }
}

/**
 * BindingUpdaters - Collection of DOM update functions
 *
 * Each updater knows how to apply a value to a specific attribute type
 */
class BindingUpdaters {
  static updaters = new Map();

  /**
   * Register an updater
   */
  static register(name, updater) {
    this.updaters.set(name, updater);
  }

  /**
   * Get an updater by name
   */
  static get(name) {
    return this.updaters.get(name);
  }

  /**
   * Register all built-in updaters
   */
  static registerBuiltins() {
    // :text - Update textContent
    this.register('text', (element, value) => {
      element.textContent = value ?? '';
    });

    // :html - Update innerHTML (be careful with XSS!)
    this.register('html', (element, value) => {
      element.innerHTML = value ?? '';
    });

    // :value - Update input value (two-way binding friendly)
    this.register('value', (element, value) => {
      if (element.value !== value) {
        element.value = value ?? '';
      }
    });

    // :checked - Update checkbox/radio checked state
    this.register('checked', (element, value) => {
      element.checked = !!value;
    });

    // :disabled - Update disabled state
    this.register('disabled', (element, value) => {
      element.disabled = !!value;
    });

    // :class - Update classList (handles string, array, or object)
    this.register('class', (element, value) => {
      if (typeof value === 'string') {
        // Simple string: "active error"
        element.className = value;
      } else if (Array.isArray(value)) {
        // Array: ["active", "error"]
        element.className = value.filter(Boolean).join(' ');
      } else if (typeof value === 'object') {
        // Object: { active: true, error: false }
        Object.keys(value).forEach(className => {
          element.classList.toggle(className, !!value[className]);
        });
      }
    });

    // :style - Update inline styles (handles string or object)
    this.register('style', (element, value) => {
      if (typeof value === 'string') {
        // Simple string: "color: red; font-size: 14px"
        element.style.cssText = value;
      } else if (typeof value === 'object') {
        // Object: { color: 'red', fontSize: '14px' }
        Object.keys(value).forEach(prop => {
          element.style[prop] = value[prop];
        });
      }
    });

    // :href, :src, :alt, etc. - Generic attribute updater
    this.register('href', (element, value) => {
      element.setAttribute('href', value ?? '');
    });

    this.register('src', (element, value) => {
      element.setAttribute('src', value ?? '');
    });

    this.register('alt', (element, value) => {
      element.setAttribute('alt', value ?? '');
    });

    this.register('title', (element, value) => {
      element.setAttribute('title', value ?? '');
    });

    this.register('placeholder', (element, value) => {
      element.setAttribute('placeholder', value ?? '');
    });

    // Generic fallback for any other attribute
    this.register('attr', (element, value, binding) => {
      const attrName = binding.name;
      if (value == null) {
        element.removeAttribute(attrName);
      } else {
        element.setAttribute(attrName, value);
      }
    });
  }
}

// Register all built-in updaters
BindingUpdaters.registerBuiltins();

/**
 * ExpressionEvaluator - Safely evaluate expressions in a given context
 *
 * Design principles:
 * - No eval() - use Function constructor with strict mode
 * - Context isolation - only access provided variables
 * - Error handling - return undefined on error, log warning
 * - Support for complex expressions
 *
 * Examples:
 * - "item.name" → Looks up item in context, returns item.name
 * - "items.length > 0" → Evaluates boolean expression
 * - "items.filter(i => i.active).length" → Complex expression with arrow functions
 */
export class ExpressionEvaluator {
  // Cache compiled functions for performance
  static cache = new Map();

  /**
   * Evaluate an expression in a given context stack
   *
   * @param {string} expression - The expression to evaluate
   * @param {Array} contextStack - Array of context objects (innermost last)
   * @returns {*} - The result of the expression
   */
  static evaluate(expression, contextStack) {
    try {
      // Get or create compiled function
      let fn = this.cache.get(expression);
      if (!fn) {
        fn = this._compile(expression);
        this.cache.set(expression, fn);
      }

      // Merge context stack into single object (inner contexts shadow outer)
      const context = this._mergeContexts(contextStack);

      // Execute function with context
      return fn(context);

    } catch (error) {
      console.warn(`Error evaluating expression: "${expression}"`, error);
      return undefined;
    }
  }

  /**
   * Compile an expression into a function
   * @private
   */
  static _compile(expression) {
    // Extract variable names from context
    // The function will receive a single 'context' object

    // Use 'with' statement to provide context scope
    // (Yes, 'with' is generally bad, but perfect for this use case)
    const fnBody = `
      with (context) {
        return (${expression});
      }
    `;

    try {
      return new Function('context', fnBody);
    } catch (error) {
      console.error(`Failed to compile expression: "${expression}"`, error);
      return () => undefined;
    }
  }

  /**
   * Merge context stack into a single object
   * Inner contexts override outer contexts
   * @private
   */
  static _mergeContexts(contextStack) {
    const merged = {};

    // Merge from outermost to innermost (inner values override)
    contextStack.forEach(context => {
      Object.keys(context).forEach(key => {
        const value = context[key];

        // If it's a function, bind it to its original context
        if (typeof value === 'function') {
          merged[key] = value.bind(context);
        } else {
          merged[key] = value;
        }
      });
    });

    return merged;
  }

  /**
   * Clear the compilation cache (for testing/debugging)
   */
  static clearCache() {
    this.cache.clear();
  }
}

/**
 * EventBinding - Handles @click, @input, etc.
 *
 * Design principles:
 * - Native event listeners (use addEventListener)
 * - Proper cleanup (removeEventListener)
 * - Context injection ($event, $element available in expression)
 * - Error boundaries (event handler errors don't break app)
 */
class EventBinding {
  constructor(element, attributeBinding, contextStack) {
    this.element = element;
    this.binding = attributeBinding;  // AttributeBinding with type='event'
    this.contextStack = contextStack;
    this.handler = null;

    this._attach();
  }

  /**
   * Attach the event listener
   */
  _attach() {
    const eventName = this.binding.name;  // 'click', 'input', etc.

    // Create handler that evaluates expression with event context
    this.handler = (event) => {
      try {
        // Add special variables to context
        const eventContext = {
          $event: event,
          $element: this.element,
          $target: event.target
        };

        // Evaluate expression with extended context
        const context = [...this.contextStack, eventContext];
        ExpressionEvaluator.evaluate(this.binding.expression, context);

      } catch (error) {
        console.error(`Error in event handler "${eventName}":`, error);
        console.error(`Expression: ${this.binding.expression}`);
      }
    };

    // Attach listener
    this.element.addEventListener(eventName, this.handler);
  }

  /**
   * Detach the event listener
   */
  destroy() {
    if (this.handler) {
      const eventName = this.binding.name;
      this.element.removeEventListener(eventName, this.handler);
      this.handler = null;
    }
  }
}

/**
 * BindingFactory - Creates the appropriate binding type
 *
 * Looks at the AttributeBinding type and creates:
 * - EventBinding for @click, @input, etc.
 * - Binding for :text, :class, etc.
 */
export class BindingFactory {
  /**
   * Create a binding from parsed metadata
   *
   * @param {HTMLElement} element - The DOM element
   * @param {AttributeBinding} attributeBinding - Parsed binding metadata
   * @param {Array} contextStack - Variable context
   * @returns {Binding|EventBinding} - The created binding
   */
  static create(element, attributeBinding, contextStack) {
    if (attributeBinding.type === 'event') {
      return new EventBinding(element, attributeBinding, contextStack);
    } else {
      return new Binding(element, attributeBinding, contextStack);
    }
  }
}

/**
 * BindingRegistry - Manages lifecycle of all bindings
 *
 * Responsibilities:
 * - Track all active bindings
 * - Clean up when elements are removed from DOM
 * - Provide debugging info (which bindings exist)
 *
 * Uses MutationObserver to detect element removal
 */
class BindingRegistry {
  constructor() {
    // Map from element -> Set of bindings
    this.elementBindings = new WeakMap();

    // Set of all active bindings (for debugging)
    this.allBindings = new Set();

    // MutationObserver to detect element removal
    this.observer = new MutationObserver(mutations => {
      this._handleMutations(mutations);
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Register a binding
   */
  register(element, binding) {
    // Track by element
    let bindings = this.elementBindings.get(element);
    if (!bindings) {
      bindings = new Set();
      this.elementBindings.set(element, bindings);
    }
    bindings.add(binding);

    // Track globally
    this.allBindings.add(binding);
  }

  /**
   * Unregister a binding
   */
  unregister(binding) {
    this.allBindings.delete(binding);
    // Note: WeakMap entry will be garbage collected automatically
  }

  /**
   * Clean up all bindings for an element
   */
  cleanup(element) {
    const bindings = this.elementBindings.get(element);
    if (bindings) {
      bindings.forEach(binding => {
        binding.destroy();
        this.allBindings.delete(binding);
      });
    }
  }

  /**
   * Handle DOM mutations (detect removed elements)
   */
  _handleMutations(mutations) {
    mutations.forEach(mutation => {
      mutation.removedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Clean up this element
          this.cleanup(node);

          // Clean up all descendants
          const descendants = node.querySelectorAll('*');
          descendants.forEach(descendant => {
            this.cleanup(descendant);
          });
        }
      });
    });
  }

  /**
   * Get binding count (for debugging)
   */
  get count() {
    return this.allBindings.size;
  }

  /**
   * Dispose of registry (stop observing)
   */
  dispose() {
    this.observer.disconnect();
    this.allBindings.forEach(binding => binding.destroy());
    this.allBindings.clear();
  }
}

// Global singleton
export const bindingRegistry = new BindingRegistry();

/**
 * createBindings - Enhanced to handle loops
 *
 * @param {ParsedElement} parsedElement - Output from ReactiveHTMLParser
 * @param {Object} model - The reactive data model
 * @param {Array} contextStack - Variable context stack
 */
export function createBindings(parsedElement, model, contextStack = []) {
  const element = parsedElement.element;

  // Handle model binding at root
  if (parsedElement.bindings.some(b => b.name === 'model')) {
    const modelBinding = parsedElement.bindings.find(b => b.name === 'model');
    const modelData = model[modelBinding.expression] || model;
    contextStack = [modelData];
  }

  // Handle loops - special case
  if (parsedElement.type === 'loop') {
    const loopBinding = LoopBindingFactory.create(
      parsedElement,
      model,
      contextStack
    );

    // Register for cleanup (bind to anchor comment node)
    bindingRegistry.register(parsedElement.loopConfig.anchor, loopBinding);

    // Don't recurse into children (loop handles that)
    return;
  }

  // Create regular bindings for this element
  parsedElement.bindings.forEach(attributeBinding => {
    if (attributeBinding.name === 'model') return;

    const binding = BindingFactory.create(
      element,
      attributeBinding,
      contextStack
    );

    bindingRegistry.register(element, binding);
  });

  // Recurse into children (unless it's a loop)
  parsedElement.children.forEach(child => {
    createBindings(child, model, contextStack);
  });
}
