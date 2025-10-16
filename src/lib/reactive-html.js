// ============================================================================
// REACTIVE-HTML.JS - Complete Framework
// ============================================================================

'use strict';

import Signal from "./signal";
import { Effect, EffectTracker } from "./effect";
import {bindingRegistry, BindingRegistry } from './binding.js';
import {ComponentLoader, ComponentBinding, ScopedStyler, ComponentLifecycle, ReactiveHTMLParser, ComponentRegistry } from "./component-binding";
import { ConditionalBinding, ConditionalBindingFactory } from "./conditional-binding";
import {LoopBinding,} from './loop-binding.js'
import {reactive, ReactiveModel} from "./reactive";
import {ExpressionEvaluator} from './event-binding.js';
import { batchScheduler, nextTick, batch } from "./batch-effect.js";
import { computed } from "./computed-signal.js";
import { GlobalErrorHandler, ErrorBoundary } from "./error-handling.js";

// ============================================================================
// PART 1: DATA STRUCTURES (Parser Output)
// ============================================================================

class ParsedElement {
  constructor(element) {
    this.element = element;
    this.type = null;                    // 'component' | 'loop' | 'conditional' | 'reactive' | 'static'
    this.bindings = [];
    this.children = [];
    this.context = null;
    this.isRegistrationPoint = false;
    this.isResumePoint = false;
    this.loopConfig = null;
    this.conditionalConfig = null;
  }
}

class ConditionalConfig {
  constructor(element) {
    this.branches = this._parseBranches(element);
    this.anchor = document.createComment('if');
    this.activeBranch = null;
    this.activeElement = null;
    element.replaceWith(this.anchor);
  }

  _parseBranches(element) {
    const branches = [];

    if (element.hasAttribute(':if')) {
      const template = element.cloneNode(true);
      template.removeAttribute(':if');

      branches.push({
        type: 'if',
        expression: element.getAttribute(':if'),
        template: template,  // Original template - never modified!
        element: null,       // Current working element
        parsed: null,
        bindings: null
      });
    }

    let sibling = element.nextElementSibling;
    while (sibling) {
      if (sibling.hasAttribute(':else-if')) {
        const template = sibling.cloneNode(true);
        template.removeAttribute(':else-if');

        branches.push({
          type: 'else-if',
          expression: sibling.getAttribute(':else-if'),
          template: template,
          element: null,
          parsed: null,
          bindings: null
        });

        const next = sibling.nextElementSibling;
        sibling.remove();
        sibling = next;

      } else if (sibling.hasAttribute(':else')) {
        const template = sibling.cloneNode(true);
        template.removeAttribute(':else');

        branches.push({
          type: 'else',
          expression: 'true',
          template: template,
          element: null,
          parsed: null,
          bindings: null
        });

        sibling.remove();
        break;

      } else {
        break;
      }
    }

    return branches;
  }
}

// ============================================================================
// PART 2: CORE REACTIVITY (Signals & Effects)
// ============================================================================



// ============================================================================
// PART 3: REACTIVE MODELS (Proxies)
// ============================================================================



// ============================================================================
// PART 4: HTML PARSER
// ============================================================================



// ============================================================================
// PART 5: EXPRESSION EVALUATOR
// ============================================================================



// ============================================================================
// PART 6: BINDING UPDATERS
// ============================================================================



// ============================================================================
// PART 7: BINDINGS
// ============================================================================



// ============================================================================
// PART 8: LOOP BINDING
// ============================================================================



// ============================================================================
// PART 9: CONDITIONALS BINDING
// ============================================================================



// ============================================================================
// PART 9: FACTORIES & REGISTRY
// ============================================================================



class LoopBindingFactory {
  static create(parsedElement, model, contextStack) {
    if (parsedElement.type !== 'loop') {
      throw new Error('Can only create loop binding from loop element');
    }

    const enhancedContext = [...contextStack, model];
    return new LoopBinding(parsedElement.loopConfig, model, enhancedContext);
  }
}


// ============================================================================
// PART 10: INTEGRATION
// ============================================================================

/**
 * createBindings - Enhanced to handle loops AND conditionals
 */
function createBindings(parsedElement, model, contextStack = []) {
  const element = parsedElement.element;
  
  // Handle data-model
  if (element.hasAttribute && element.hasAttribute('data-model')) {
    const modelBinding = parsedElement.bindings.find(b => b.name === 'model');
    if (modelBinding) {
      const modelData = model[modelBinding.expression] || model;
      contextStack = [modelData];
    }
  }
  
  // Handle components
  if (parsedElement.type === 'component') {
    const componentBinding = new ComponentBinding(
      parsedElement.element,
      parsedElement.componentName,
      parsedElement.props,
      contextStack
    );
    bindingRegistry.register(parsedElement.element, componentBinding);
    return;
  }
  
  // Handle loops
  if (parsedElement.type === 'loop') {
    const loopBinding = LoopBindingFactory.create(parsedElement, model, contextStack);
    bindingRegistry.register(parsedElement.loopConfig.anchor, loopBinding);
    return;
  }
  
  // Handle conditionals
  if (parsedElement.type === 'conditional') {
    const conditionalBinding = ConditionalBindingFactory.create(parsedElement, model, contextStack);
    bindingRegistry.register(parsedElement.conditionalConfig.anchor, conditionalBinding);
    return;
  }
  
  // Create regular bindings
  parsedElement.bindings.forEach(attributeBinding => {
    if (attributeBinding.name === 'model' && element.hasAttribute && element.hasAttribute('data-model')) {
      return;
    }
    
    const binding = BindingFactory.create(element, attributeBinding, contextStack);
    bindingRegistry.register(element, binding);
  });
  
  // Recurse into children
  parsedElement.children.forEach(child => {
    createBindings(child, model, contextStack);
  });
}

// ============================================================================
// PART 11: ERROR BOUNDARIES
// ============================================================================


/**
 * Create an error boundary for a specific element
 */
function createElementErrorBoundary(element, options = {}) {
  const boundary = new ErrorBoundary({
    onError: (errorInfo) => {
      // Show error UI
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'padding: 10px; background: #fee; border: 1px solid #fcc; color: #c00;';
      errorDiv.textContent = options.message || 'Something went wrong';
      
      element.innerHTML = '';
      element.appendChild(errorDiv);
      
      // Call custom handler if provided
      if (options.onError) {
        options.onError(errorInfo);
      }
    },
    fallback: options.fallback,
    logErrors: options.logErrors
  });
  
  return boundary;
}

/**
 * Initialize error handling based on environment
 */
function initializeErrorHandling(isDevelopment = false) {
  if (isDevelopment) {
    // Development: Verbose logging
    GlobalErrorHandler.initialize({
      logErrors: true,
      onError: (errorInfo) => {
        // Show detailed error overlay
        showDevelopmentErrorOverlay(errorInfo);
      }
    });
  } else {
    // Production: Silent logging, user-friendly messages
    GlobalErrorHandler.initialize({
      logErrors: false,
      onError: (errorInfo) => {
        // Send to monitoring service
        sendToErrorTracking(errorInfo);
        
        // Show generic message to user
        showUserFriendlyError();
      }
    });
  }
}

// Initialize
initializeErrorHandling(process.env.NODE_ENV === 'development');

// ============================================================================
// PART 12: COMPONENT LIFECYCLE SYSTEM
// ============================================================================



// ============================================================================
// PART 13: COMPONENT LOADER - Fetch and parse component files
// ============================================================================



// ============================================================================
// SCOPED STYLER - Generate scoped CSS
// ============================================================================



// ============================================================================
// COMPONENT REGISTRY - Register and retrieve components
// ============================================================================



// ============================================================================
// COMPONENT BINDING - Create and manage component instances
// ============================================================================

/**
 * ComponentBinding - Binds a component element to its definition
 */



// ============================================================================
// PART 14: EXPORTS & INITIALIZATION
// ============================================================================

// Convenience function
let registerComponent = ComponentRegistry.register.bind(ComponentRegistry)

export {
  Signal,
  Effect,
  EffectTracker,
  reactive,
  ReactiveHTMLParser,
  createBindings,
  BindingRegistry,
  bindingRegistry,
  ExpressionEvaluator,
  ReactiveModel,
  computed,
  batch,
  nextTick,
  batchScheduler,
  ConditionalBinding,
  ConditionalBindingFactory,
  
  // Add error handling
  ErrorBoundary,
  GlobalErrorHandler,
  createElementErrorBoundary,

  // Component system
  ComponentLifecycle,
  ComponentLoader,
  ComponentRegistry,
  ComponentBinding,
  ScopedStyler,

  // Convenience function
  registerComponent,
}

if (typeof window !== 'undefined') {
  window.ReactiveHTML = {
    Signal,
    Effect,
    EffectTracker,
    reactive,
    ReactiveHTMLParser,
    createBindings,
    BindingRegistry,
    bindingRegistry,
    ExpressionEvaluator,
    ReactiveModel,
    computed,
    batch,
    nextTick,
    batchScheduler,
    ConditionalBinding,
    ConditionalBindingFactory,
    
    // Add error handling
    ErrorBoundary,
    GlobalErrorHandler,
    createElementErrorBoundary,

    // Component system
    ComponentLifecycle,
    ComponentLoader,
    ComponentRegistry,
    ComponentBinding,
    ScopedStyler,
    
    // Convenience function
    registerComponent,
  };
  
  console.log('Reactive HTML Framework loaded!');
}

