import { EffectTracker } from "./effect";
import { GlobalErrorHandler } from "./error-handling";
import {EventBinding, ExpressionEvaluator} from "./event-binding.js";
import { ERROR_TYPE } from './constants.js';

/**
 * Binding - Binds element property to reactive data
 */
export class Binding {
    constructor(element, attributeBinding, contextStack) {
      this.element = element;
      this.binding = attributeBinding;
      this.contextStack = contextStack;
      this.effect = null;
      this.cleanup = null;
      this.active = true;
  
      this.updater = BindingUpdaters.get(attributeBinding.name);
  
      if (!this.updater) {
        console.warn(`No updater found for binding: ${attributeBinding.name}`);
        return;
      }
  
      this._createEffect();
    }
  
    _createEffect() {
      console.log('🔷 [DEBUG] Creating binding for:', this.binding.name, 'expr:', this.binding.expression);

      this.effect = EffectTracker.create(() => {
        if (!this.active) return;
  
        const safeUpdate = GlobalErrorHandler.wrap(() => {
          const value = this._evaluate();
          console.log('✅ Binding update:', this.binding.name, '=', value);
          this.updater(this.element, value, this.binding);
        }, {
          type: ERROR_TYPE.BINDING,
          bindingName: this.binding.name,
          element: this.element,
          expression: this.binding.expression
        });
  
        safeUpdate();
      });
    }
  
    _evaluate() {
      return ExpressionEvaluator.evaluate(this.binding.expression, this.contextStack);
    }
  
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

  export /**
  * ModelBinding - Two-way data binding for form inputs
  *
  * Handles:
  * - Text inputs (text, email, number, url, etc.)
  * - Checkboxes (single boolean or array of values)
  * - Radio buttons
  * - Select dropdowns (single and multiple)
  * - Textareas
  *
  * @example
  * <input type="text" :model="username">
  * <input type="checkbox" :model="agreedToTerms">
  * <input type="checkbox" :model="selectedItems" value="item1">
  * <input type="radio" :model="size" value="small">
  * <select :model="country">...</select>
  * <textarea :model="bio"></textarea>
  */
 class ModelBinding {
   constructor(element, attributeBinding, contextStack) {
     this.element = element;
     this.binding = attributeBinding;
     this.contextStack = contextStack;
     this.effect = null;
     this.eventHandler = null;
     this.active = true;
 
     this.inputType = this._determineInputType();
     this._setup();
   }
 
   /**
    * Determine what type of input we're dealing with
    */
   _determineInputType() {
     const tagName = this.element.tagName.toLowerCase();
 
     if (tagName === 'input') {
       const type = this.element.type.toLowerCase();
 
       if (type === 'checkbox') {
         // Check if this is array binding (has value attribute)
         return this.element.hasAttribute('value') ? 'checkbox-array' : 'checkbox-boolean';
       }
 
       if (type === 'radio') {
         return 'radio';
       }
 
       // text, email, number, url, tel, etc.
       return 'input';
     }
 
     if (tagName === 'select') {
       return this.element.hasAttribute('multiple') ? 'select-multiple' : 'select';
     }
 
     if (tagName === 'textarea') {
       return 'textarea';
     }
 
     console.warn('Unknown input type for :model binding:', this.element);
     return 'input'; // fallback
   }
 
   /**
    * Setup bidirectional binding
    */
   _setup() {
     // Model → View (reactive effect)
     this._setupModelToView();
 
     // View → Model (event listener)
     this._setupViewToModel();
   }
 
   /**
    * Model → View: Update input when model changes
    */
   _setupModelToView() {
     this.effect = EffectTracker.create(() => {
       if (!this.active) return;
 
       try {
         const value = this._evaluate();
         this._updateView(value);
       } catch (error) {
         console.error('Error in model→view binding:', error);
       }
     });
   }
 
   /**
    * View → Model: Update model when user interacts
    */
   _setupViewToModel() {
     const eventName = this._getEventName();
 
     this.eventHandler = (event) => {
 
       try {
         const newValue = this._getValueFromView();
         this._updateModel(newValue);
       } catch (error) {
         console.error('Error in view→model binding:', error);
       }
     };
 
     this.element.addEventListener(eventName, this.eventHandler);
   }
 
   /**
    * Get appropriate event name for this input type
    */
   _getEventName() {
     switch (this.inputType) {
       case 'checkbox-boolean':
       case 'checkbox-array':
       case 'radio':
       case 'select':
       case 'select-multiple':
         return 'change';
 
       case 'input':
       case 'textarea':
       default:
         return 'input';
     }
   }
 
   /**
    * Evaluate the binding expression to get model value
    */
   _evaluate() {
     return ExpressionEvaluator.evaluate(this.binding.expression, this.contextStack);
   }
 
   /**
    * Update the view (input) with model value
    */
   _updateView(modelValue) {
     switch (this.inputType) {
       case 'checkbox-boolean':
         this.element.checked = !!modelValue;
         break;
 
       case 'checkbox-array':
         const checkboxValue = this.element.value;
         this.element.checked = Array.isArray(modelValue) && modelValue.includes(checkboxValue);
         break;
 
       case 'radio':
         const radioValue = this.element.value;
         this.element.checked = (modelValue == radioValue);
         break;
 
       case 'select-multiple':
         if (Array.isArray(modelValue)) {
           Array.from(this.element.options).forEach(option => {
             option.selected = modelValue.includes(option.value);
           });
         }
         break;
 
       case 'select':
       case 'input':
       case 'textarea':
       default:
         if (this.element.value !== modelValue) {
           this.element.value = modelValue ?? '';
         }
         break;
     }
   }
 
   /**
    * Get value from the view (input)
    */
   _getValueFromView() {
     switch (this.inputType) {
       case 'checkbox-boolean':
         return this.element.checked;
 
       case 'checkbox-array':
         // This is handled in _updateModel
         return null;
 
       case 'radio':
         return this.element.value;
 
       case 'select-multiple':
         return Array.from(this.element.selectedOptions).map(opt => opt.value);
 
       case 'input':
         // Handle number inputs
         if (this.element.type === 'number') {
           const num = parseFloat(this.element.value);
           return isNaN(num) ? this.element.value : num;
         }
         return this.element.value;
 
       case 'select':
       case 'textarea':
       default:
         return this.element.value;
     }
   }
 
   /**
    * Update the model with view value
    */
   _updateModel(newValue) {
     // Special handling for checkbox arrays
     if (this.inputType === 'checkbox-array') {
       const currentArray = this._evaluate();
       const checkboxValue = this.element.value;
 
       if (!Array.isArray(currentArray)) {
         console.warn('Checkbox array binding expects an array in the model');
         return;
       }
 
       if (this.element.checked) {
         // Add to array if not present
         if (!currentArray.includes(checkboxValue)) {
           currentArray.push(checkboxValue);
         }
       } else {
         // Remove from array
         const index = currentArray.indexOf(checkboxValue);
         if (index !== -1) {
           currentArray.splice(index, 1);
         }
       }
 
       return; // Array is already mutated (reactive)
     }
 
     // For all other types, set the value
     // We need to evaluate the expression path and set it
     this._setModelValue(newValue);
   }
 
   /**
    * Set value in the model (handle nested paths)
    */
   _setModelValue(newValue) {
     const expression = this.binding.expression;
 
     // Simple case: direct property (e.g., "username")
     if (/^\w+$/.test(expression)) {
       // Find in context stack
       for (let i = this.contextStack.length - 1; i >= 0; i--) {
         const context = this.contextStack[i];
         console.log('   Checking context', i, ':', Object.keys(context).slice(0, 5));
 
         if (expression in context) {
           context[expression] = newValue;
           return;
         }
       }
     }
 
     // Complex case: nested property (e.g., "user.profile.name")
     const match = expression.match(/^([\w.]+)$/);
     if (match) {
       const path = match[1].split('.');
       const lastProp = path.pop();
 
       // Navigate to parent object
       let obj = null;
       for (let i = this.contextStack.length - 1; i >= 0; i--) {
         const context = this.contextStack[i];
         if (path[0] in context) {
           obj = context;
           break;
         }
       }
 
       if (obj) {
         // Navigate nested path
         for (const prop of path) {
           obj = obj[prop];
           if (!obj) break;
         }
 
         if (obj) {
           console.log('   Setting', lastProp, '=', newValue, 'on', obj);
           obj[lastProp] = newValue;
         }
       }
     }
   }
 
   /**
    * Clean up
    */
   destroy() {
     this.active = false;
 
     if (this.effect) {
       this.effect.stop();
       this.effect = null;
     }
 
     if (this.eventHandler) {
       const eventName = this._getEventName();
       this.element.removeEventListener(eventName, this.eventHandler);
       this.eventHandler = null;
     }
   }
 }
 

  export class BindingUpdaters {
    static updaters = new Map();
  
    static register(name, updater) {
      this.updaters.set(name, updater);
    }
  
    static get(name) {
      return this.updaters.get(name);
    }
  
    static registerBuiltins() {
      this.register('text', (element, value) => {
        element.textContent = value ?? '';
      });
  
      this.register('html', (element, value) => {
        element.innerHTML = value ?? '';
      });
  
      this.register('value', (element, value) => {
        if (element.value !== value) {
          element.value = value ?? '';
        }
      });
  
      this.register('checked', (element, value) => {
        element.checked = !!value;
      });
  
      this.register('disabled', (element, value) => {
        element.disabled = !!value;
      });
  
      this.register('class', (element, value) => {
        if (typeof value === 'string') {
          element.className = value;
        } else if (Array.isArray(value)) {
          element.className = value.filter(Boolean).join(' ');
        } else if (typeof value === 'object') {
          Object.keys(value).forEach(className => {
            element.classList.toggle(className, !!value[className]);
          });
        }
      });
  
      this.register('style', (element, value) => {
        if (typeof value === 'string') {
          element.style.cssText = value;
        } else if (typeof value === 'object') {
          Object.keys(value).forEach(prop => {
            element.style[prop] = value[prop];
          });
        }
      });
  
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
    }
  }
  
  BindingUpdaters.registerBuiltins();

  export class BindingRegistry {
    constructor() {
      this.elementBindings = new WeakMap();
      this.allBindings = new Set();
  
      this.observer = new MutationObserver(mutations => {
        this._handleMutations(mutations);
      });
  
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  
    get count() {
      return this.allBindings.size;
    }
  
    register(element, binding) {
      let bindings = this.elementBindings.get(element);
      if (!bindings) {
        bindings = new Set();
        this.elementBindings.set(element, bindings);
      }
      bindings.add(binding);
      this.allBindings.add(binding);
    }
  
    unregister(binding) {
      this.allBindings.delete(binding);
    }
  
    disconnect() {
      if (this.observer) {
        this.observer.disconnect();
      }
    }
    
    reconnect() {
      if (this.observer) {
        this.observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    }
  
    cleanup(element) {
      const bindings = this.elementBindings.get(element);
      if (bindings) {
        bindings.forEach(binding => {
          binding.destroy();
          this.allBindings.delete(binding);
        });
      }
    }
  
    _handleMutations(mutations) {
      mutations.forEach(mutation => {
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.cleanup(node);
            const descendants = node.querySelectorAll('*');
            descendants.forEach(descendant => {
              this.cleanup(descendant);
            });
          }
        });
      });
    }
  
    dispose() {
      this.observer.disconnect();
      this.allBindings.forEach(binding => binding.destroy());
      this.allBindings.clear();
    }
  
    _setupMutationObserver() {
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.removedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              
              const bindings = this.registry.get(node);
              if (bindings) {
                
                bindings.forEach((binding) => {
                  if (binding && binding.destroy) {
                    binding.destroy();
                  }
                });
                this.registry.delete(node);
              } else {
                
              }
            }
          });
        });
      });
      
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
  
  export class BindingFactory {
    static create(element, attributeBinding, contextStack) {
      // Check for :model binding
      if (attributeBinding.name === 'model') {
        return new ModelBinding(element, attributeBinding, contextStack);
      }
  
      // Event bindings
      if (attributeBinding.type === 'event') {
        return new EventBinding(element, attributeBinding, contextStack);
      }
  
      // Regular property bindings
      return new Binding(element, attributeBinding, contextStack);
    }
  }
  
  export const bindingRegistry = new BindingRegistry();
