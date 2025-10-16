import { GlobalErrorHandler } from "./error-handling";
import { EVENT_CONTEXT, ERROR_TYPE } from './constants.js';

/**
 * EventBinding - Binds DOM events to reactive methods
 */
export class EventBinding {
    constructor(element, attributeBinding, contextStack) {
      this.element = element;
      this.binding = attributeBinding;
      this.contextStack = contextStack;
      this.handler = null;
      this.active = true;
      
      this._attach();
    }
    
    _attach() {
      const eventName = this.binding.name;
  
      this.handler = (event) => {
        console.log('🔷 [DEBUG] Event fired:', eventName, 'expr:', this.binding.expression);

        const eventContext = {
          [EVENT_CONTEXT.EVENT]: event,
          [EVENT_CONTEXT.ELEMENT]: this.element,
          [EVENT_CONTEXT.TARGET]: event.target
        };
        
        const context = [...this.contextStack, eventContext];
        console.log('🔷 [DEBUG] Context length:', context.length);

        const safeHandler = GlobalErrorHandler.wrap(() => {
          const result = ExpressionEvaluator.evaluate(this.binding.expression, context);
          console.log('✅ Event handler result:', result);
        }, {
          type: ERROR_TYPE.EVENT,
          eventName,
          element: this.element,
          expression: this.binding.expression
        });
        
        safeHandler();
      };
  
      this.element.addEventListener(eventName, this.handler);
    }
    
    destroy() {
      this.active = false;
      
      if (this.handler) {
        const eventName = this.binding.name;
        this.element.removeEventListener(eventName, this.handler);
        this.handler = null;
      }
    }
  }

  export class ExpressionEvaluator {
    static cache = new Map();
  
    static evaluate(expression, contextStack) {
      try {
        let fn = this.cache.get(expression);
        if (!fn) {
          fn = this._compile(expression);
          this.cache.set(expression, fn);
        }
  
        const context = this._mergeContexts(contextStack);
        return fn(context);
  
      } catch (error) {
        console.warn(`Error evaluating expression: "${expression}"`, error);
        return undefined;
      }
    }
  
    static _compile(expression) {
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
  
    static _mergeContexts(contextStack) {
      const handler = {
        get(target, property) {
  
          for (let i = contextStack.length - 1; i >= 0; i--) {
            const context = contextStack[i];
  
            if (property in context) {
              const value = context[property];
  
              if (typeof value === 'function') {
                return value.bind(context);
              }
  
              return value;
            }
          }
  
          return undefined;
        },
  
        has(target, property) {
          return contextStack.some(context => property in context);
        }
      };
  
      return new Proxy({}, handler);
    }
  
    static clearCache() {
      this.cache.clear();
    }
  }
