// ============================================================================
// REACTIVE-HTML.JS - Complete Framework
// ============================================================================

'use strict';

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

class AttributeBinding {
  constructor(name, expression, type) {
    this.name = name;
    this.expression = expression;
    this.type = type;                    // 'property' | 'event' | 'attribute'
    this.dependencies = [];
  }
}

class LoopConfig {
  constructor(element, eachAttr) {
    const parsed = this._parseEachExpression(eachAttr);

    this.itemVar = parsed.itemVar;
    this.indexVar = parsed.indexVar;
    this.source = parsed.source;
    this.keyExpression = this._extractKey(element);

    this.template = element.cloneNode(true);
    this.template.removeAttribute(':each');
    this.template.removeAttribute(':key');

    this.anchor = document.createComment(`each: ${this.itemVar} in ${this.source}`);
    element.replaceWith(this.anchor);

    this.instances = [];
  }

  _parseEachExpression(expr) {
    const patterns = [
      /^\((\w+)\s*,\s*(\w+)\)\s+in\s+([\w.]+)$/,
      /^(\w+)\s*,\s*(\w+)\s+in\s+([\w.]+)$/,
      /^(\w+)\s+in\s+([\w.]+)$/
    ];

    for (const pattern of patterns) {
      const match = expr.match(pattern);
      if (match) {
        return {
          itemVar: match[1],
          indexVar: match[2] || null,
          source: match[match.length - 1]
        };
      }
    }

    throw new Error(`Invalid :each syntax: "${expr}"`);
  }

  _extractKey(element) {
    const keyAttr = element.getAttribute(':key');
    return keyAttr || '$index';
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

class Signal {
  static _nextId = 0;

  constructor(initialValue) {
    this._value = initialValue;
    this._subscribers = new Set();
    this._id = Signal._nextId++;
  }

  get value() {
    if (EffectTracker.current) {
      EffectTracker.current.track(this);
    }
    return this._value;
  }

  set value(newValue) {
    if (this._value === newValue) {
      return;
    }

    const oldValue = this._value;
    this._value = newValue;

    // DEBUG: Log when items property signal fires
    console.log('Signal fired! Subscribers:', this._subscribers.size);

    this._notify(newValue, oldValue);
  }

  get subscriberCount() {
    return this._subscribers.size;
  }

  subscribe(callback) {
    this._subscribers.add(callback);
    return () => {
      this._subscribers.delete(callback);
    };
  }

  _notify(newValue, oldValue) {
    const subscribers = Array.from(this._subscribers);
    subscribers.forEach(callback => {
      try {
        callback(newValue, oldValue);
      } catch (error) {
        console.error('Error in signal subscriber:', error);
      }
    });
  }

  dispose() {
    this._subscribers.clear();
  }

  toString() {
    return `Signal(${this._value})`;
  }
}

class EffectTracker {
  static current = null;
  static stack = [];

  static create(fn) {
    return new Effect(fn);
  }

  static track(effect, fn) {
    const previousEffect = EffectTracker.current;
    EffectTracker.stack.push(previousEffect);
    EffectTracker.current = effect;

    try {
      return fn();
    } finally {
      EffectTracker.current = previousEffect;
      EffectTracker.stack.pop();
    }
  }
}

class Effect {
  constructor(fn) {
    this.fn = fn;
    this.dependencies = new Set();
    this.cleanups = [];
    this.active = true;
    this.scheduled = false;  // NEW: Track if already scheduled

    this.run();
  }

  track(signal) {
    console.log('[Effect.track] Tracking signal ID:', signal._id);
    
    if (!this.dependencies.has(signal)) {
      console.log('[Effect.track] New dependency, subscribing');
      this.dependencies.add(signal);
      
      const unsubscribe = signal.subscribe(() => {
        if (this.active && !this.scheduled) {
          console.log('[Effect] Signal changed, scheduling re-run');
          this.scheduled = true;
          batchScheduler.schedule(this);
        }
      });
      
      this.cleanups.push(unsubscribe);
    } else {
      console.log('[Effect.track] Already tracking this signal');
    }
  }

  run() {
    if (!this.active) return;

    // Clear scheduled flag
    this.scheduled = false;

    this.cleanup();
    this.dependencies.clear();

    // Wrap in error boundary
    const safeRun = GlobalErrorHandler.wrap(() => {
      EffectTracker.track(this, this.fn);
    }, {
      type: 'effect',
      effect: this
    });
    
    safeRun();
  }

  cleanup() {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
  }

  stop() {
    this.active = false;
    this.cleanup();
    this.dependencies.clear();
  }
}

// ============================================================================
// PART 3: REACTIVE MODELS (Proxies)
// ============================================================================

class ReactiveModel {
  static _reactiveMap = new WeakMap();
  static _rawMap = new WeakMap();
  static _signalsMap = new WeakMap();

  static _getSignals(target) {
    let signals = this._signalsMap.get(target);
    if (!signals) {
      signals = new Map();
      this._signalsMap.set(target, signals);
    }
    return signals;
  }

  static isReactive(obj) {
    return obj && obj.__isReactive === true;
  }

  static toRaw(obj) {
    return this._rawMap.get(obj) || obj;
  }
}

function reactiveArray(arr) {
  const signals = ReactiveModel._getSignals(arr);

  // Create change signal
  let changeSignal = signals.get('__arrayChange');
  if (!changeSignal) {
    changeSignal = new Signal(null);
    signals.set('__arrayChange', changeSignal);
  }

  // Create length signal
  let lengthSignal = signals.get('length');
  if (!lengthSignal) {
    lengthSignal = new Signal(arr.length);
    signals.set('length', lengthSignal);
  }

  // ADD: Create version signal that always increments
  let versionSignal = signals.get('__version');
  if (!versionSignal) {
    versionSignal = new Signal(0);
    signals.set('__version', versionSignal);
  }

  const proxy = new Proxy(arr, {
    get(target, property, receiver) {
      const mutationMethods = {
        push: 'add',
        pop: 'remove',
        shift: 'remove',
        unshift: 'add',
        splice: 'splice',
        sort: 'reorder',
        reverse: 'reorder'
      };

      if (mutationMethods[property]) {
        return function (...args) {
          const oldLength = target.length;
          const result = Array.prototype[property].apply(target, args);

          // Update length signal
          lengthSignal.value = target.length;

          // ALWAYS increment version (even if length unchanged)
          versionSignal.value = versionSignal.value + 1;

          // Emit change event
          changeSignal.value = {
            type: mutationMethods[property],
            method: property,
            args,
            oldLength,
            newLength: target.length,
            timestamp: Date.now()
          };

          return result;
        };
      }

      // Track access to length
      if (property === 'length') {
        lengthSignal.value;
      }

      // ADDED: Track access to __version (for forcing re-renders)
      if (property === '__version') {
        return versionSignal.value;
      }

      const value = Reflect.get(target, property, receiver);

      if (typeof value === 'object' && value !== null) {
        return reactive(value);
      }

      return value;
    },

    set(target, property, value, receiver) {
      const oldValue = target[property];
      const result = Reflect.set(target, property, value, receiver);

      if (property === 'length' || !isNaN(property)) {
        lengthSignal.value = target.length;
        versionSignal.value = versionSignal.value + 1; // ADDED

        if (!isNaN(property) && oldValue !== value) {
          changeSignal.value = {
            type: 'update',
            method: 'set',
            index: parseInt(property),
            oldValue,
            newValue: value,
            timestamp: Date.now()
          };
        }
      }

      return result;
    }
  });

  ReactiveModel._reactiveMap.set(arr, proxy);
  ReactiveModel._rawMap.set(proxy, arr);

  return proxy;
}

function reactive(target) {
  if (Array.isArray(target)) {
    return reactiveArray(target);
  }

  if (ReactiveModel._reactiveMap.has(target)) {
    return ReactiveModel._reactiveMap.get(target);
  }

  if (typeof target !== 'object' || target === null) {
    return target;
  }

  const signals = ReactiveModel._getSignals(target);

  const proxy = new Proxy(target, {
    get(target, property, receiver) {
      if (property === '__isReactive') return true;
      if (property === '__raw') return target;
      if (property === '__signals') return signals;
    
      // ADD DEBUGGING
      if (property === 'count') {
        console.log('[Reactive.get] Accessing count property');
        console.log('[Reactive.get] EffectTracker.current:', EffectTracker.current ? 'YES' : 'NO');
      }
    
      // Check if this is a getter (computed property)
      const descriptor = Object.getOwnPropertyDescriptor(target, property);
      if (descriptor && descriptor.get) {
        // This is a getter - make it computed!
        let computedSignal = signals.get(property);
        if (!computedSignal) {
          computedSignal = new ComputedSignal(descriptor.get, receiver);
          signals.set(property, computedSignal);
        }
        return computedSignal.value;
      }
    
      const value = Reflect.get(target, property, receiver);
    
      // Create or get signal for property tracking
      let signal = signals.get(property);
      if (!signal) {
        signal = new Signal(value);
        signals.set(property, signal);
        
        // ADD DEBUGGING
        if (property === 'count') {
          console.log('[Reactive.get] Created NEW signal for count, ID:', signal._id);
        }
      } else {
        // ADD DEBUGGING
        if (property === 'count') {
          console.log('[Reactive.get] Found EXISTING signal for count, ID:', signal._id);
        }
      }
    
      signal.value; // Trigger tracking
      
      // ADD DEBUGGING
      if (property === 'count') {
        console.log('[Reactive.get] After accessing signal.value');
      }
    
      if (typeof value === 'object' && value !== null) {
        return reactive(value);
      }
    
      return value;
    },

    set(target, property, value, receiver) {
      if (property === 'count') {
        console.log('[Reactive.set] Setting count property to:', value);
        console.log('[Reactive.set] Old value:', target[property]);
      }

      const oldValue = target[property];

      // Make the new value reactive if it's an object/array
      const reactiveValue = (typeof value === 'object' && value !== null) 
        ? reactive(value) 
        : value;

      const result = Reflect.set(target, property, reactiveValue, receiver);
  
      if (oldValue !== reactiveValue) {
        let signal = signals.get(property);
        if (!signal) {
          signal = new Signal(reactiveValue);
          signals.set(property, signal);
        } else {
          if (property === 'count') {
            console.log('[Reactive.set] Updating signal ID:', signal._id);
          }
          signal.value = reactiveValue;
        }
      }

      return result;
    },

    deleteProperty(target, property) {
      const hadProperty = property in target;
      const result = Reflect.deleteProperty(target, property);

      if (hadProperty) {
        const signal = signals.get(property);
        if (signal) {
          signal.value = undefined;
        }
      }

      return result;
    }
  });

  ReactiveModel._reactiveMap.set(target, proxy);
  ReactiveModel._rawMap.set(proxy, target);

  return proxy;
}

// ============================================================================
// PART 4: HTML PARSER
// ============================================================================

class ReactiveHTMLParser {
  constructor() {
    this.parsed = new Map();
    this.customElements = new Set();
  }

  parse(rootElement, contextStack = []) {
    return this._parseElement(rootElement, contextStack);
  }

  getCustomElements() {
    return this.customElements;
  }

  /**
  * Check if element is a registered component
  */
  _isComponent(element) {
    const tagName = element.tagName.toLowerCase();
    return ComponentRegistry.has(tagName);
  }

  /**
  * Parse a component element
  */
  _parseComponent(element, parentContext) {
    const componentName = element.tagName.toLowerCase();
    
    // Extract props from attributes
    const props = [];
    
    Array.from(element.attributes).forEach(attr => {
      // Skip special attributes
      if (attr.name === 'data-model' || attr.name === ':key') {
        return;
      }
      
      if (attr.name.startsWith(':')) {
        // Dynamic prop
        props.push({
          name: attr.name.slice(1),
          expression: attr.value,
          isDynamic: true
        });
      } else if (attr.name.startsWith('@')) {
        // Event handler (passed to component)
        props.push({
          name: attr.name,
          expression: attr.value,
          isDynamic: true
        });
      } else {
        // Static prop
        props.push({
          name: attr.name,
          value: attr.value,
          isDynamic: false
        });
      }
    });
    
    return {
      type: 'component',
      element,
      componentName,
      props,
      context: parentContext,
      children: [] // Components don't parse children (they own their template)
    };
  }

  _parseElement(element, parentContext = []) {
    // Check if this is a component FIRST
    if (this._isComponent(element)) {
      return this._parseComponent(element, parentContext);
    }
    
    // Check for :each (loop)
    if (element.hasAttribute(':each')) {
      return this._parseLoop(element, parentContext);
    }
    
    // Check for :if (conditional)
    if (element.hasAttribute(':if')) {
      return this._parseConditional(element, parentContext);
    }
    
    // Regular element
    const bindings = this._parseBindings(element);
    
    // Determine element type
    let type = 'static';
    if (bindings.length > 0) {
      type = 'reactive';
    }
    
    // Check if this is a registration point (has data-model)
    const isRegistrationPoint = element.hasAttribute('data-model');
    
    // Parse children
    const children = [];
    Array.from(element.children).forEach(child => {
      // Skip <template>, <script>, <style> tags
      if (['TEMPLATE', 'SCRIPT', 'STYLE'].includes(child.tagName)) {
        return;
      }
      
      const parsed = this._parseElement(child, parentContext);  // ← Pass parentContext here!
      if (parsed) {
        children.push(parsed);
      }
    });
    
    return {
      type,
      element,
      bindings,
      children,
      isRegistrationPoint
    };
  }

  /**
   * Parse loop (:each)
   */
  _parseLoop(element, parentContext) {
    const eachAttr = element.getAttribute(':each');
    const keyAttr = element.getAttribute(':key');
    
    // Parse "item in items" or "item, index in items"
    const match = eachAttr.match(/^(?:(\w+)(?:\s*,\s*(\w+))?\s+in\s+)?(.+)$/);
    
    if (!match) {
      throw new Error(`Invalid :each expression: ${eachAttr}`);
    }
    
    const itemName = match[1] || 'item';
    const indexName = match[2] || null;
    const source = match[3];
    
    // Remove :each and :key attributes
    element.removeAttribute(':each');
    if (keyAttr) {
      element.removeAttribute(':key');
    }
    
    // Create anchor comment
    const anchor = document.createComment('each');
    
    // Create loop config
    const loopConfig = {
      itemName,
      indexName,
      source,
      keyExpression: keyAttr || null,
      templateElement: element.cloneNode(true),
      anchor,
      instances: []
    };
    
    // Replace element with anchor
    element.replaceWith(anchor);
    
    return {
      type: 'loop',
      element: anchor,
      loopConfig,
      bindings: [],
      children: []
    };
  }

  /**
   * Parse conditional (:if/:else-if/:else)
   */
  _parseConditional(element, parentContext) {
    const branches = [];
    
    // First branch (if)
    if (element.hasAttribute(':if')) {
      const condition = element.getAttribute(':if');
      element.removeAttribute(':if');
      
      branches.push({
        type: 'if',
        expression: condition,
        template: element.cloneNode(true),
        element: null,
        parsed: null,
        bindings: null
      });
    }
    
    // Collect else-if and else branches
    let sibling = element.nextElementSibling;
    const siblings = [];
    
    while (sibling) {
      if (sibling.hasAttribute(':else-if')) {
        const condition = sibling.getAttribute(':else-if');
        sibling.removeAttribute(':else-if');
        
        branches.push({
          type: 'else-if',
          expression: condition,
          template: sibling.cloneNode(true),
          element: null,
          parsed: null,
          bindings: null
        });
        
        siblings.push(sibling);
        sibling = sibling.nextElementSibling;
        
      } else if (sibling.hasAttribute(':else')) {
        sibling.removeAttribute(':else');
        
        branches.push({
          type: 'else',
          expression: 'true',
          template: sibling.cloneNode(true),
          element: null,
          parsed: null,
          bindings: null
        });
        
        siblings.push(sibling);
        break;
        
      } else {
        break;
      }
    }
    
    // Remove sibling elements
    siblings.forEach(s => s.remove());
    
    // Create anchor
    const anchor = document.createComment('if');
    
    // Create conditional config
    const conditionalConfig = {
      branches,
      anchor,
      activeBranch: null,
      activeElement: null
    };
    
    // Replace element with anchor
    element.replaceWith(anchor);
    
    return {
      type: 'conditional',
      element: anchor,
      conditionalConfig,
      bindings: [],
      children: []
    };
  }

  _classifyElement(element) {
    if (this._hasAttribute(element, ':each')) return 'loop';
    if (this._hasAttribute(element, ':if')) return 'conditional';
    if (this._isCustomElement(element)) return 'component';
    if (this._hasReactiveAttributes(element)) return 'reactive';

    const hasReactiveChildren = Array.from(element.children).some(child =>
      this._hasReactiveAttributes(child) ||
      this._isCustomElement(child) ||
      child.hasAttribute(':each') ||
      child.hasAttribute(':if')
    );

    if (hasReactiveChildren) return 'reactive';
    return 'static';
  }

  _isCustomElement(element) {
    const tagName = element.tagName.toLowerCase();
    return tagName.startsWith('re-') || tagName.includes('-');
  }

  _hasReactiveAttributes(element) {
    return Array.from(element.attributes).some(attr =>
      attr.name.startsWith(':') ||
      attr.name.startsWith('@') ||
      attr.name === 'data-model'
    );
  }

  _hasAttribute(element, name) {
    return element.hasAttribute(name);
  }

  _parseBindings(element) {
    const bindings = [];

    Array.from(element.attributes).forEach(attr => {
      if (attr.name.startsWith(':')) {
        const propName = attr.name.slice(1);

        const binding = new AttributeBinding(
          propName,
          attr.value,
          'property'
        );
        binding.dependencies = this._extractDependencies(attr.value);
        bindings.push(binding);
      } else if (attr.name.startsWith('@')) {
        const eventName = attr.name.slice(1);
        const binding = new AttributeBinding(eventName, attr.value, 'event');
        binding.dependencies = this._extractDependencies(attr.value);
        bindings.push(binding);
      } else if (attr.name === 'data-model') {
        const binding = new AttributeBinding('model', attr.value, 'property');
        bindings.push(binding);
      }
    });

    return bindings;
  }

  _extractDependencies(expression) {
    const deps = [];
    const regex = /\b(\w+(?:\.\w+)*)\b/g;
    let match;

    while ((match = regex.exec(expression)) !== null) {
      const path = match[1];
      if (!this._isKeyword(path) && !this._isMethodCall(expression, match.index)) {
        deps.push(path);
      }
    }

    return [...new Set(deps)];
  }

  _isKeyword(word) {
    const keywords = [
      'true', 'false', 'null', 'undefined', 'this',
      'return', 'if', 'else', 'for', 'while', 'do',
      'switch', 'case', 'break', 'continue', 'function',
      'var', 'let', 'const', 'new', 'typeof', 'instanceof'
    ];
    return keywords.includes(word);
  }

  _isMethodCall(expression, index) {
    const remaining = expression.slice(index);
    return /^\w+\s*\(/.test(remaining);
  }
}

// ============================================================================
// PART 5: EXPRESSION EVALUATOR
// ============================================================================

class ExpressionEvaluator {
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

// ============================================================================
// PART 6: BINDING UPDATERS
// ============================================================================

class BindingUpdaters {
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

// ============================================================================
// PART 7: BINDINGS
// ============================================================================

class Binding {
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
    console.log('[Binding._createEffect] Creating for:', this.binding.name, 'expression:', this.binding.expression);
    console.log('[Binding._createEffect] Element:', this.element.tagName);
    
    this.effect = EffectTracker.create(() => {
      if (!this.active) return;
  
      const safeUpdate = GlobalErrorHandler.wrap(() => {
        const value = this._evaluate();
        
        console.log('[Binding.effect] Running for:', this.binding.name, 'value:', value);
        
        this.updater(this.element, value, this.binding);
        
        console.log('[Binding.effect] Updated DOM');
      }, {
        type: 'binding',
        bindingName: this.binding.name,
        element: this.element,
        expression: this.binding.expression
      });
  
      safeUpdate();
    });
    
    console.log('[Binding._createEffect] Effect created');
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

class EventBinding {
  constructor(element, attributeBinding, contextStack) {
    console.log('[EventBinding] Creating for:', element.tagName, 'event:', attributeBinding.name, 'expression:', attributeBinding.expression);
    console.log('[EventBinding] Context stack length:', contextStack.length);
    
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
      console.log('[EventBinding] Event fired:', eventName);
      console.log('[EventBinding] Expression:', this.binding.expression);
      console.log('[EventBinding] Context stack length:', this.contextStack.length);
      console.log('[EventBinding] Context[0]:', this.contextStack[0]);
      
      const eventContext = {
        $event: event,
        $element: this.element,
        $target: event.target
      };
      
      const context = [...this.contextStack, eventContext];
      
      // Wrap in error boundary
      const safeHandler = GlobalErrorHandler.wrap(() => {
        console.log('[EventBinding] About to evaluate expression');
        const result = ExpressionEvaluator.evaluate(this.binding.expression, context);
        console.log('[EventBinding] Evaluation result:', result);
      }, {
        type: 'event',
        eventName,
        element: this.element,
        expression: this.binding.expression
      });
      
      safeHandler();
    };

    this.element.addEventListener(eventName, this.handler);
  }

  destroy() {
    if (this.handler) {
      const eventName = this.binding.name;
      this.element.removeEventListener(eventName, this.handler);
      this.handler = null;
    }
  }
}

// ============================================================================
// PART 8: LOOP BINDING
// ============================================================================

class LoopBinding {
  constructor(loopConfig, model, contextStack) {
    this.loopConfig = loopConfig;
    this.model = model;
    this.parentContext = contextStack;
    this.instances = [];
    this.effect = null;
    this._createEffect();
  }

  _createEffect() {
    this.effect = EffectTracker.create(() => {
      const sourceArray = this._getSourceArray();

      if (!Array.isArray(sourceArray)) {
        console.warn(`Loop source is not an array: ${this.loopConfig.source}`);
        return;
      }

      this._reconcile(sourceArray);
    });
  }

  _getSourceArray() {
    console.log('📍 _getSourceArray called');
    console.log('   EffectTracker.current:', EffectTracker.current ? 'YES (inside effect)' : 'NO (outside effect)');

    const expr = this.loopConfig.source;

    console.log('   Evaluating expression:', expr);
    const array = ExpressionEvaluator.evaluate(expr, this.parentContext);
    console.log('   Got array, length:', array ? array.length : 'null');

    if (array && typeof array.__version !== 'undefined') {
      console.log('   Accessing array.__version');
      array.__version;
    }

    return array;
  }

  _reconcile(newData) {
    const oldByKey = this._buildKeyMap(this.instances);
    const newByKey = this._buildDataKeyMap(newData);
    const operations = this._planOperations(oldByKey, newByKey, newData);
    this._applyOperations(operations);
    this.instances = operations.finalInstances;
  }

  _buildKeyMap(instances) {
    const map = new Map();
    instances.forEach((instance, index) => {
      const key = this._computeKey(instance.data, instance.context);
      map.set(key, {instance, index});
    });
    return map;
  }

  _buildDataKeyMap(dataArray) {
    const map = new Map();
    dataArray.forEach((data, index) => {
      const context = this._createItemContext(data, index);
      const key = this._computeKey(data, context);
      map.set(key, {data, index, context});
    });
    return map;
  }

  _computeKey(data, context) {
    if (this.loopConfig.keyExpression === '$index') {
      return context.$index;
    }

    try {
      return ExpressionEvaluator.evaluate(this.loopConfig.keyExpression, [context]);
    } catch (error) {
      console.warn('Error computing key:', error);
      return context.$index;
    }
  }

  _createItemContext(data, index) {
    const context = {
      [this.loopConfig.itemVar]: data,
      $index: index,
      $parent: this.parentContext[this.parentContext.length - 1] || {}
    };

    if (this.loopConfig.indexVar) {
      context[this.loopConfig.indexVar] = index;
    }

    return context;
  }

  _planOperations(oldByKey, newByKey, newData) {
    const toRemove = [];
    const toUpdate = [];
    const toAdd = [];

    oldByKey.forEach((oldItem, key) => {
      if (newByKey.has(key)) {
        const newItem = newByKey.get(key);
        toUpdate.push({
          key,
          instance: oldItem.instance,
          newData: newItem.data,
          newIndex: newItem.index,
          oldIndex: oldItem.index,
          newContext: newItem.context
        });
      } else {
        toRemove.push(oldItem.instance);
      }
    });

    newByKey.forEach((newItem, key) => {
      if (!oldByKey.has(key)) {
        toAdd.push({
          key,
          data: newItem.data,
          index: newItem.index,
          context: newItem.context
        });
      }
    });

    const finalInstances = newData.map((data, index) => {
      const context = this._createItemContext(data, index);
      const key = this._computeKey(data, context);

      if (oldByKey.has(key)) {
        const instance = oldByKey.get(key).instance;
        instance.data = data;
        instance.context = context;
        return instance;
      }

      return null;
    });

    return {toRemove, toUpdate, toAdd, finalInstances};
  }

  _applyOperations(operations) {
    operations.toRemove.forEach(instance => {
      instance.element.remove();
      instance.cleanup();
    });

    operations.toUpdate.forEach(op => {
      Object.assign(op.instance.context, op.newContext);
    });

    operations.toAdd.forEach(op => {
      const instance = this._createInstance(op.data, op.context);

      const targetIndex = op.index;
      const anchor = this.loopConfig.anchor;

      if (targetIndex === 0) {
        anchor.parentNode.insertBefore(instance.element, anchor.nextSibling);
      } else {
        const previousInstance = operations.finalInstances[targetIndex - 1];
        if (previousInstance && previousInstance.element) {
          previousInstance.element.parentNode.insertBefore(
            instance.element,
            previousInstance.element.nextSibling
          );
        }
      }

      operations.finalInstances[op.index] = instance;
    });

    this._reorderDOM(operations.finalInstances);
  }

  _reorderDOM(instances) {
    const anchor = this.loopConfig.anchor;
    let currentNode = anchor.nextSibling;

    instances.forEach(instance => {
      if (!instance || !instance.element) return;

      if (instance.element !== currentNode) {
        anchor.parentNode.insertBefore(instance.element, currentNode);
      }

      currentNode = instance.element.nextSibling;
    });
  }

  _createInstance(data, context) {
    const element = this.loopConfig.template.cloneNode(true);
    const parser = new ReactiveHTMLParser();
    const parsed = parser.parse(element, [...this.parentContext, context]);
    const bindings = this._createInstanceBindings(parsed, context);

    const instance = {
      element,
      data,
      context,
      parsed,
      bindings,
      cleanup: () => {
        bindings.forEach(binding => binding.destroy());
      }
    };

    return instance;
  }

  _createInstanceBindings(parsedElement, itemContext) {
    const bindings = [];
    const contextStack = [...this.parentContext, itemContext];

    parsedElement.bindings.forEach(attributeBinding => {
      const binding = BindingFactory.create(parsedElement.element, attributeBinding, contextStack);
      bindings.push(binding);
      bindingRegistry.register(parsedElement.element, binding);
    });

    parsedElement.children.forEach(child => {
      const childBindings = this._createInstanceBindings(child, itemContext);
      bindings.push(...childBindings);
    });

    return bindings;
  }

  destroy() {
    if (this.effect) {
      this.effect.stop();
      this.effect = null;
    }

    this.instances.forEach(instance => {
      instance.cleanup();
    });

    this.instances = [];
  }
}

// ============================================================================
// PART 9: CONDITIONALS BINDING
// ============================================================================

/**
 * ConditionalBinding - Manages :if/:else-if/:else branches
 *
 * Responsibilities:
 * - Evaluate branch conditions in order
 * - Show first truthy branch (or hide all)
 * - Lazy parse branches (only when first shown)
 * - Use comment anchor (preserve DOM position)
 * - Clean up when element removed
 *
 * Key difference from loops:
 * - Loops: many instances, all visible
 * - Conditionals: one branch, conditionally visible
 *
 * Algorithm:
 * 1. Evaluate conditions top to bottom
 * 2. Stop at first true condition
 * 3. Show that branch (parse if needed)
 * 4. Hide current branch if different
 * 5. If no conditions true, hide all
 */
class ConditionalBinding {
  constructor(conditionalConfig, model, contextStack) {
    this.conditionalConfig = conditionalConfig;
    this.model = model;
    this.contextStack = contextStack;
    this.effect = null;

    // Create effect to watch all conditions
    this._createEffect();
  }

  /**
   * Create an effect that evaluates conditions and shows appropriate branch
   */
  _createEffect() {
    this.effect = EffectTracker.create(() => {
      // Evaluate each branch condition in order
      for (let i = 0; i < this.conditionalConfig.branches.length; i++) {
        const branch = this.conditionalConfig.branches[i];

        // Evaluate condition
        const condition = this._evaluateCondition(branch.expression);

        // If true, show this branch and stop
        if (condition) {
          this._showBranch(i);
          return;
        }
      }

      // No condition was true - hide all
      this._hideAll();
    });
  }

  /**
   * Evaluate a branch condition
   */
  _evaluateCondition(expression) {
    try {
      return ExpressionEvaluator.evaluate(expression, this.contextStack);
    } catch (error) {
      console.warn(`Error evaluating condition: "${expression}"`, error);
      return false;
    }
  }

  /**
   * Show a specific branch
   */
  _showBranch(branchIndex) {
    const config = this.conditionalConfig;

    if (config.activeBranch === branchIndex) {
      return;
    }

    // Clean up current branch
    if (config.activeElement) {
      config.activeElement.remove();

      const oldBranch = config.branches[config.activeBranch];
      if (oldBranch && oldBranch.bindings) {
        oldBranch.bindings.forEach(binding => binding.destroy());
        oldBranch.bindings = [];
      }

      config.activeElement = null;
    }

    const branch = config.branches[branchIndex];

    // Clone from template fresh each time!
    branch.element = branch.template.cloneNode(true);

    // Parse and bind the fresh clone
    this._parseBranch(branch);

    // Insert into DOM
    config.anchor.parentNode.insertBefore(
      branch.element,
      config.anchor.nextSibling
    );

    config.activeElement = branch.element;
    config.activeBranch = branchIndex;
  }

  /**
   * Hide all branches
   */
  _hideAll() {
    const config = this.conditionalConfig;

    if (config.activeElement) {
      config.activeElement.remove();
      config.activeElement = null;
      config.activeBranch = null;
    }
  }

  /**
   * Parse a branch (lazy - only done once per branch)
   */
  _parseBranch(branch) {
    // Clean up existing bindings if any
    if (branch.bindings && branch.bindings.length > 0) {
      branch.bindings.forEach(binding => binding.destroy());
      branch.bindings = [];
    }

    // Re-parse the branch element
    const parser = new ReactiveHTMLParser();
    branch.parsed = parser.parse(branch.element, this.contextStack);

    // Create fresh bindings
    branch.bindings = [];
    this._createBranchBindings(branch.parsed, branch.bindings);
  }

  /**
   * Create bindings for a branch
   */
  _createBranchBindings(parsedElement, bindingsArray) {
    // Handle loops within conditional branches
    if (parsedElement.type === 'loop') {
      const loopBinding = LoopBindingFactory.create(
        parsedElement,
        this.model,
        this.contextStack
      );
      bindingsArray.push(loopBinding);
      bindingRegistry.register(parsedElement.loopConfig.anchor, loopBinding);
      return;
    }

    // Handle nested conditionals
    if (parsedElement.type === 'conditional') {
      const nestedConditional = ConditionalBindingFactory.create(
        parsedElement,
        this.model,
        this.contextStack
      );
      bindingsArray.push(nestedConditional);
      bindingRegistry.register(parsedElement.conditionalConfig.anchor, nestedConditional);
      return;
    }

    // Create regular bindings
    parsedElement.bindings.forEach(attributeBinding => {
      const binding = BindingFactory.create(
        parsedElement.element,
        attributeBinding,
        this.contextStack
      );
      bindingsArray.push(binding);
      bindingRegistry.register(parsedElement.element, binding);
    });

    // Recurse into children
    parsedElement.children.forEach(child => {
      this._createBranchBindings(child, bindingsArray);
    });
  }

  /**
   * Clean up this conditional binding
   */
  destroy() {
    if (this.effect) {
      this.effect.stop();
      this.effect = null;
    }

    // Clean up all parsed branches
    this.conditionalConfig.branches.forEach(branch => {
      if (branch.bindings) {
        branch.bindings.forEach(binding => binding.destroy());
      }
    });

    this._hideAll();
  }
}

/**
 * ConditionalBindingFactory - Creates ConditionalBinding from parsed metadata
 */
class ConditionalBindingFactory {
  /**
   * Create a conditional binding from parsed element
   *
   * @param {ParsedElement} parsedElement - Element with type='conditional'
   * @param {Object} model - The reactive model
   * @param {Array} contextStack - Parent context
   * @returns {ConditionalBinding}
   */
  static create(parsedElement, model, contextStack) {
    if (parsedElement.type !== 'conditional') {
      throw new Error('Can only create conditional binding from conditional element');
    }

    return new ConditionalBinding(
      parsedElement.conditionalConfig,
      model,
      contextStack
    );
  }
}

/**
 * BatchScheduler - Batches DOM updates using requestAnimationFrame
 *
 * Design principles:
 * - Multiple signal changes = one DOM update
 * - Uses RAF for optimal rendering timing
 * - Microtask queue for immediate updates when needed
 * - Automatic deduplication (same effect doesn't run twice)
 *
 * Performance characteristics:
 * - Before: N changes = N DOM updates
 * - After: N changes = 1 DOM update (60fps)
 */
class BatchScheduler {
  constructor() {
    this.pendingEffects = new Set();
    this.isScheduled = false;
    this.isFlushing = false;
  }

  /**
   * Schedule an effect to run in the next batch
   * @param {Effect} effect - The effect to schedule
   */
  schedule(effect) {
    // Add to pending queue
    this.pendingEffects.add(effect);

    // Schedule flush if not already scheduled
    if (!this.isScheduled && !this.isFlushing) {
      this.isScheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  /**
   * Flush all pending effects
   */
  flush() {
    if (this.isFlushing) return;

    this.isFlushing = true;
    this.isScheduled = false;

    // Copy and clear pending effects
    const effects = Array.from(this.pendingEffects);
    this.pendingEffects.clear();

    // Run all effects
    effects.forEach(effect => {
      if (effect.active) {
        effect.run();
      }
    });

    this.isFlushing = false;

    // If new effects were scheduled during flush, schedule another flush
    if (this.pendingEffects.size > 0 && !this.isScheduled) {
      this.isScheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  /**
   * Force immediate flush (for testing or critical updates)
   */
  flushSync() {
    this.flush();
  }
}

// Global scheduler instance
const batchScheduler = new BatchScheduler();

/**
 * nextTick - Wait for next batch of DOM updates
 *
 * @param {Function} callback - Called after DOM updates
 * @returns {Promise} - Resolves after DOM updates
 *
 * @example
 * cart.items.push(newItem);
 * await nextTick();
 * console.log('DOM updated!', document.querySelector('.item:last-child'));
 */
function nextTick(callback) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (callback) callback();
        resolve();
      });
    });
  });
}

/**
 * batch - Execute multiple updates in a single batch
 *
 * @param {Function} fn - Function containing multiple updates
 * @returns {*} - Return value of fn
 *
 * @example
 * batch(() => {
 *   cart.items.push(item1);
 *   cart.items.push(item2);
 *   cart.items.push(item3);
 * });
 * // Only one DOM update after all three pushes
 */
function batch(fn) {
  // Execute function
  const result = fn();

  // Force immediate flush
  batchScheduler.flushSync();

  return result;
}

/**
 * ComputedSignal - A cached, reactive computed value
 *
 * Design principles:
 * - Lazy evaluation (only computes when accessed)
 * - Automatic caching (reuses result until dependencies change)
 * - Dependency tracking (knows what it depends on)
 * - Works like a signal (can be tracked by effects)
 *
 * @example
 * const total = computed(() => {
 *   return cart.items.reduce((sum, item) => sum + item.price, 0);
 * });
 *
 * console.log(total.value); // Computes: 15.50
 * console.log(total.value); // Cached: 15.50 (no recomputation)
 *
 * cart.items.push({...}); // Dependencies changed
 * console.log(total.value); // Recomputes: 20.00
 */
class ComputedSignal extends Signal {
  constructor(getter, context = null) {
    super(undefined);

    this.getter = getter;
    this.context = context; // For binding 'this'
    this.effect = null;
    this.dirty = true; // Needs recomputation

    this._setupEffect();
  }

  /**
   * Set up effect to track dependencies and mark dirty when they change
   */
  _setupEffect() {
    this.effect = new Effect(() => {
      // Evaluate getter to track dependencies
      const newValue = this.context
        ? this.getter.call(this.context)
        : this.getter();

      // Only update if value actually changed
      if (this._value !== newValue) {
        this._value = newValue;
        this._notify(newValue, this._value);
      }

      // No longer dirty
      this.dirty = false;
    });

    // Override effect's run to mark dirty instead of running immediately
    const originalRun = this.effect.run.bind(this.effect);
    this.effect.run = () => {
      this.dirty = true;
      // Don't compute yet - wait for someone to access .value
    };
  }

  /**
   * Get the computed value (lazy evaluation)
   */
  get value() {
    // If dirty, recompute
    if (this.dirty) {
      this._recompute();
    }

    // Track this computed as a dependency (if inside an effect)
    if (EffectTracker.current) {
      EffectTracker.current.track(this);
    }

    return this._value;
  }

  /**
   * Computed values are read-only
   */
  set value(newValue) {
    console.warn('Cannot set value of computed property. Computed values are read-only.');
  }

  /**
   * Force recomputation
   */
  _recompute() {
    this.effect.run = this.effect.run.bind(this.effect);

    // Run the getter to get new value
    const newValue = this.context
      ? this.getter.call(this.context)
      : this.getter();

    // Update if changed
    if (this._value !== newValue) {
      this._value = newValue;
      this._notify(newValue, this._value);
    }

    this.dirty = false;
  }

  /**
   * Dispose of this computed (stop tracking)
   */
  dispose() {
    if (this.effect) {
      this.effect.stop();
      this.effect = null;
    }
    super.dispose();
  }
}

/**
 * asyncComputed - Computed value from async function
 *
 * @param {Function} getter - Async function
 * @param {*} defaultValue - Value while loading
 * @returns {Object} - { value, loading, error }
 */
function asyncComputed(getter, defaultValue = null) {
  const state = reactive({
    value: defaultValue,
    loading: false,
    error: null
  });

  const compute = async () => {
    state.loading = true;
    state.error = null;

    try {
      const result = await getter();
      state.value = result;
    } catch (err) {
      state.error = err;
    } finally {
      state.loading = false;
    }
  };

  // Initial computation
  compute();

  return state;
}

/**
 * computed - Create a computed property
 *
 * @param {Function} getter - Function that computes the value
 * @param {Object} context - Optional 'this' context for getter
 * @returns {ComputedSignal} - Computed signal
 *
 * @example
 * // Simple computed
 * const doubled = computed(() => count.value * 2);
 *
 * // With context
 * const total = computed(function() {
 *   return this.items.reduce((s, i) => s + i.price, 0);
 * }, cart);
 *
 * // Chained computed
 * const tax = computed(() => total.value * 0.1);
 * const grandTotal = computed(() => total.value + tax.value);
 */
function computed(getter, context = null) {
  return new ComputedSignal(getter, context);
}

/**
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

// ============================================================================
// PART 9: FACTORIES & REGISTRY
// ============================================================================

class BindingFactory {
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

class LoopBindingFactory {
  static create(parsedElement, model, contextStack) {
    if (parsedElement.type !== 'loop') {
      throw new Error('Can only create loop binding from loop element');
    }

    const enhancedContext = [...contextStack, model];
    return new LoopBinding(parsedElement.loopConfig, model, enhancedContext);
  }
}

class BindingRegistry {
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
            console.log('[MutationObserver] Element removed:', node.tagName, node.className);
            const bindings = this.registry.get(node);
            if (bindings) {
              console.log('[MutationObserver] Found', bindings.size, 'binding(s) to destroy');
              bindings.forEach((binding) => {
                if (binding && binding.destroy) {
                  binding.destroy();
                }
              });
              this.registry.delete(node);
            } else {
              console.log('[MutationObserver] No bindings found for this element');
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

const bindingRegistry = new BindingRegistry();

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
 * ErrorBoundary - Catches and handles errors in reactive code
 * 
 * Features:
 * - Prevents errors from bubbling up and breaking the app
 * - Provides helpful error context (element, binding, expression)
 * - Allows custom error handlers
 * - Logs errors with stack traces
 * - Supports graceful degradation
 */
class ErrorBoundary {
  constructor(options = {}) {
    this.onError = options.onError || this._defaultErrorHandler;
    this.fallback = options.fallback || null;
    this.logErrors = options.logErrors !== false; // Default true
  }
  
  /**
   * Wrap a function in error handling
   */
  wrap(fn, context = {}) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        this._handleError(error, context);
        return this.fallback;
      }
    };
  }
  
  /**
   * Wrap an async function in error handling
   */
  wrapAsync(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this._handleError(error, context);
        return this.fallback;
      }
    };
  }
  
  /**
   * Handle an error
   */
  _handleError(error, context) {
    const errorInfo = {
      error,
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    
    if (this.logErrors) {
      this._logError(errorInfo);
    }
    
    // Call custom error handler
    try {
      this.onError(errorInfo);
    } catch (handlerError) {
      console.error('Error in error handler:', handlerError);
    }
  }
  
  /**
   * Log error with helpful context
   */
  _logError(errorInfo) {
    console.group('🚨 ReactiveHTML Error');
    console.error('Error:', errorInfo.error.message);
    console.error('Stack:', errorInfo.error.stack);
    
    if (errorInfo.context.element) {
      console.log('Element:', errorInfo.context.element);
    }
    
    if (errorInfo.context.binding) {
      console.log('Binding:', errorInfo.context.binding);
    }
    
    if (errorInfo.context.expression) {
      console.log('Expression:', errorInfo.context.expression);
    }
    
    if (errorInfo.context.type) {
      console.log('Error Type:', errorInfo.context.type);
    }
    
    console.log('Timestamp:', errorInfo.timestamp);
    console.groupEnd();
  }
  
  /**
   * Default error handler (does nothing)
   */
  _defaultErrorHandler(errorInfo) {
    // Override this with custom handler
  }
}

/**
 * GlobalErrorHandler - Singleton for framework-wide error handling
 */
class GlobalErrorHandler {
  static instance = null;
  
  static initialize(options = {}) {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new ErrorBoundary(options);
    }
    return GlobalErrorHandler.instance;
  }
  
  static get() {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new ErrorBoundary();
    }
    return GlobalErrorHandler.instance;
  }
  
  static setErrorHandler(handler) {
    GlobalErrorHandler.get().onError = handler;
  }
  
  static wrap(fn, context) {
    return GlobalErrorHandler.get().wrap(fn, context);
  }
  
  static wrapAsync(fn, context) {
    return GlobalErrorHandler.get().wrapAsync(fn, context);
  }
}

// Initialize with default options
const errorBoundary = GlobalErrorHandler.initialize();

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

// mock window
window.process = {
  env: {
    NODE_ENV: 'development'
  }
}
// Initialize
initializeErrorHandling(process.env.NODE_ENV === 'development');

// ============================================================================
// PART 12: COMPONENT LIFECYCLE SYSTEM
// ============================================================================

/**
 * ComponentLifecycle - Lifecycle management using effects
 * 
 * Philosophy: Lifecycle is just effects with sugar
 * - onMount = effect that runs once
 * - onUnmount = cleanup function
 * - watch/watchEffect = reactive effects (what we already have!)
 */
class ComponentLifecycle {
  constructor(component) {
    this.component = component;
    this.effects = [];
    this.cleanups = [];
    this.mounted = false;
  }
  
  /**
   * onMount - Run once when component is attached
   */
  onMount(fn) {
    if (this.mounted) {
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        this.cleanups.push(cleanup);
      }
    } else {
      const effect = EffectTracker.create(() => {
        if (!this.mounted) {
          this.mounted = true;
          const cleanup = fn();
          if (typeof cleanup === 'function') {
            this.cleanups.push(cleanup);
          }
        }
      });
      this.effects.push(effect);
    }
  }
  
  /**
   * onUnmount - Run when component is detached
   */
  onUnmount(fn) {
    this.cleanups.push(fn);
  }
  
  /**
   * watchEffect - Run effect that tracks dependencies
   */
  watchEffect(fn) {
    const effect = EffectTracker.create(fn);
    this.effects.push(effect);
    return () => effect.stop();
  }
  
  /**
   * watch - Watch specific property
   */
  watch(getter, callback, options = {}) {
    let oldValue = undefined;
    let firstRun = true;
    
    const effect = EffectTracker.create(() => {
      const newValue = getter();
      
      if (firstRun) {
        firstRun = false;
        if (options.immediate) {
          callback(newValue, oldValue);
        }
        oldValue = newValue;
        return;
      }
      
      if (newValue !== oldValue) {
        callback(newValue, oldValue);
        oldValue = newValue;
      }
    });
    
    this.effects.push(effect);
    return () => effect.stop();
  }
  
  /**
   * destroy - Clean up all effects and run cleanup functions
   */
  destroy() {
    this.cleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('Error in component cleanup:', error);
      }
    });
    
    this.effects.forEach(effect => effect.stop());
    
    this.cleanups = [];
    this.effects = [];
    this.mounted = false;
  }
}

// ============================================================================
// PART 13: COMPONENT LOADER - Fetch and parse component files
// ============================================================================

/**
 * ComponentLoader - Load component HTML files
 * 
 * Parses:
 * - <template> tag (required)
 * - <script> tag (optional)
 * - <style> tag (optional, can be scoped)
 */
class ComponentLoader {
  static cache = new Map();
  
  /**
   * Load a component from URL
   */
  static async load(name, url) {
    if (this.cache.has(name)) {
      return this.cache.get(name);
    }
    
    try {
      const html = await fetch(url).then(r => {
        if (!r.ok) throw new Error(`Failed to load component: ${url}`);
        return r.text();
      });
      
      const component = this.parse(html, name);
      this.cache.set(name, component);
      
      return component;
    } catch (error) {
      console.error(`Error loading component "${name}":`, error);
      throw error;
    }
  }
  
  /**
   * Parse component HTML into parts
   */
  static parse(html, componentName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract template
    const templateEl = doc.querySelector('template');
    if (!templateEl) {
      throw new Error(`Component "${componentName}" must have a <template> tag`);
    }
    
    // Extract script
    const scriptEl = doc.querySelector('script');
    let definition = {};
    
    if (scriptEl) {
      try {
        const code = scriptEl.textContent.trim();
        // Create function that exports default object
        definition = this._parseExport(code);
      } catch (error) {
        console.error(`Error parsing component script for "${componentName}":`, error);
        throw error;
      }
    }
    
    // Extract style
    const styleEl = doc.querySelector('style');
    const style = styleEl ? styleEl.textContent : null;
    const scoped = styleEl ? styleEl.hasAttribute('scoped') : false;
    
    return {
      name: componentName,
      template: templateEl.content,
      style,
      scoped,
      definition
    };
  }

  /**
   * Parse export default { ... } into object
   */
  static _parseExport(code) {
    // Remove 'export default' and surrounding whitespace
    let cleaned = code
      .replace(/^\s*export\s+default\s+/, '')
      .trim();
    
    // Remove trailing semicolon if present
    if (cleaned.endsWith(';')) {
      cleaned = cleaned.slice(0, -1).trim();
    }
    
    // Check if it's an object literal (starts with { )
    if (!cleaned.startsWith('{')) {
      throw new Error('Component must export an object literal: export default { ... }');
    }
    
    try {
      // Use Function constructor to evaluate the object in isolated scope
      // Wrap in parentheses to treat as expression, not statement block
      const fn = new Function(`'use strict'; return (${cleaned});`);
      const result = fn();
      
      if (typeof result !== 'object' || result === null) {
        throw new Error('Component export must be an object');
      }
      
      return result;
    } catch (error) {
      console.error('Error parsing component definition:');
      console.error('Original code:', code);
      console.error('Cleaned code:', cleaned);
      console.error('Error:', error);
      throw error;
    }
  }
  
  /**
   * Clear cache (useful for development/hot reload)
   */
  static clearCache() {
    this.cache.clear();
  }
}

// ============================================================================
// SCOPED STYLER - Generate scoped CSS
// ============================================================================

/**
 * ScopedStyler - Add scope to CSS rules
 */
class ScopedStyler {
  static scopeId = 0;
  
  /**
   * Generate scoped CSS with unique attribute selector
   */
  static generate(css, componentName) {
    const id = `data-v-${componentName}-${this.scopeId++}`;
    
    // Add scope attribute to all selectors
    const scopedCSS = css.replace(
      /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g,
      (match, selector, suffix) => {
        // Skip @rules like @media, @keyframes
        if (selector.trim().startsWith('@')) return match;
        
        // Add scope attribute
        const trimmed = selector.trim();
        return `${trimmed}[${id}]${suffix}`;
      }
    );
    
    return { id, css: scopedCSS };
  }
  
  /**
   * Inject CSS into document head
   */
  static inject(css, componentName) {
    const style = document.createElement('style');
    style.setAttribute('data-component', componentName);
    style.textContent = css;
    document.head.appendChild(style);
    return style;
  }
}

// ============================================================================
// COMPONENT REGISTRY - Register and retrieve components
// ============================================================================

/**
 * ComponentRegistry - Central registry for all components
 */
class ComponentRegistry {
  static components = new Map();
  static styles = new Map();
  
  /**
   * Register a component from URL
   */
  static async register(name, url) {
    try {
      const component = await ComponentLoader.load(name, url);
      
      // Inject scoped styles if needed
      if (component.scoped && component.style) {
        const { id, css } = ScopedStyler.generate(component.style, name);
        component.scopeId = id;
        
        const styleEl = ScopedStyler.inject(css, name);
        this.styles.set(name, styleEl);
      } else if (component.style) {
        // Non-scoped styles
        const styleEl = ScopedStyler.inject(component.style, name);
        this.styles.set(name, styleEl);
      }
      
      this.components.set(name, component);
      
      return component;
    } catch (error) {
      console.error(`Failed to register component "${name}":`, error);
      throw error;
    }
  }
  
  /**
   * Get a registered component
   */
  static get(name) {
    return this.components.get(name);
  }
  
  /**
   * Check if component is registered
   */
  static has(name) {
    return this.components.has(name);
  }
  
  /**
   * Unregister a component (removes styles too)
   */
  static unregister(name) {
    const styleEl = this.styles.get(name);
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
    
    this.styles.delete(name);
    this.components.delete(name);
  }
  
  /**
   * Get all registered component names
   */
  static list() {
    return Array.from(this.components.keys());
  }
}

// ============================================================================
// COMPONENT BINDING - Create and manage component instances
// ============================================================================

/**
 * ComponentBinding - Binds a component element to its definition
 */
class ComponentBinding {
  constructor(element, componentName, props, contextStack) {
    this.element = element;
    this.componentName = componentName;
    this.props = props;
    this.contextStack = contextStack;
    this.instance = null;
    this.lifecycle = null;
    this.mountedElement = null;
    this.bindings = [];
    
    this._createInstance();
  }
  
  /**
   * Create component instance
   */
  async _createInstance() {
    const component = ComponentRegistry.get(this.componentName);
    if (!component) {
      console.error(`Component not found: ${this.componentName}`);
      return;
    }
    
    try {
      // Evaluate props from parent context
      const evaluatedProps = this._evaluateProps();
      
      // Create component data
      let componentData = {
        ...evaluatedProps
      };

      // Call data() with props as 'this' context
      if (component.definition.data) {
        const dataResult = component.definition.data.call(componentData);
        componentData = {
          ...componentData,
          ...dataResult
        };
      }
      
      // Create lifecycle manager
      this.lifecycle = new ComponentLifecycle(componentData);
      
      // Add lifecycle methods
      componentData.onMount = this.lifecycle.onMount.bind(this.lifecycle);
      componentData.onUnmount = this.lifecycle.onUnmount.bind(this.lifecycle);
      componentData.watchEffect = this.lifecycle.watchEffect.bind(this.lifecycle);
      componentData.watch = this.lifecycle.watch.bind(this.lifecycle);
      
      // Add $emit for events
      componentData.$emit = (eventName, ...args) => {
        const event = new CustomEvent(eventName, {
          detail: args,
          bubbles: true
        });
        if (this.mountedElement) {
          this.mountedElement.dispatchEvent(event);
        }
      };
      
      // Add component methods
      Object.keys(component.definition).forEach(key => {
        const value = component.definition[key];
        if (typeof value === 'function' && key !== 'data' && key !== 'setup') {
          componentData[key] = value.bind(componentData);
        }
      });
      
      // Make reactive
      this.instance = reactive(componentData);

      // NOW bind methods to the REACTIVE proxy
      Object.keys(component.definition).forEach(key => {
        const value = component.definition[key];
        if (typeof value === 'function' && key !== 'data' && key !== 'setup') {
          this.instance[key] = value.bind(this.instance);  // ← Bind to reactive proxy!
        }
      });
      
      // Clone template
      const templateClone = component.template.cloneNode(true);
      
      // Get root element
      let root = templateClone.firstElementChild;
      if (!root) {
        console.error(`Component "${this.componentName}" template must have a root element`);
        return;
      }
      
      // Apply scoped style attribute
      if (component.scoped && component.scopeId) {
        this._applyScopeId(root, component.scopeId);
      }
      
      // Store reference to placeholder BEFORE replacing
      const placeholder = this.element;

      // Pause MutationObserver during element swap
      // This prevents it from destroying us when it sees the placeholder removed
      bindingRegistry.disconnect();

      // This prevents MutationObserver from destroying us
      bindingRegistry.unregister(placeholder);
      
      // Replace placeholder element with component
      placeholder.parentNode.replaceChild(root, placeholder);
      this.mountedElement = root;
      
      // NOW register this binding on the MOUNTED element (not placeholder)
      // This prevents the MutationObserver from destroying us when placeholder is removed
      bindingRegistry.register(root, this);

      // Resume MutationObserver
      bindingRegistry.reconnect();
      
      // Parse and create bindings
      const parser = new ReactiveHTMLParser();
      const parsed = parser.parse(root, [this.instance]);
      this._createBindings(parsed, this.instance);

      // Run setup AFTER everything is mounted
      if (component.definition.setup) {
        component.definition.setup.call(this.instance);
      }
      
      // Add this debugging:
      console.log('[ComponentBinding] Finished creating component');
      console.log('[ComponentBinding] Mounted element in DOM?', document.body.contains(this.mountedElement));
      console.log('[ComponentBinding] Mounted element:', this.mountedElement);
    } catch (error) {
      console.error(`Error creating component "${this.componentName}":`, error);
    }
  }

  unregister(element) {
    const bindings = this.registry.get(element);
    if (bindings) {
      this.registry.delete(element);
    }
  }
  
  /**
   * Evaluate props from parent context
   */
  _evaluateProps() {
    const props = {};
    
    this.props.forEach(prop => {
      if (prop.isDynamic) {
        // Dynamic prop: :prop="value"
        try {
          props[prop.name] = ExpressionEvaluator.evaluate(
            prop.expression,
            this.contextStack
          );
        } catch (error) {
          console.error(`Error evaluating prop "${prop.name}":`, error);
          props[prop.name] = undefined;
        }
      } else {
        // Static prop: prop="value"
        // Parse number/boolean values
        let value = prop.value;
        if (/^\d+$/.test(value)) {
          value = parseInt(value, 10);
        } else if (/^\d*\.\d+$/.test(value)) {
          value = parseFloat(value);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (value === 'null') {
          value = null;
        }
        props[prop.name] = value;
      }
    });
    
    return props;
  }
  
  /**
   * Apply scope ID to element and children
   */
  _applyScopeId(element, scopeId) {
    element.setAttribute(scopeId, '');
    
    Array.from(element.children).forEach(child => {
      this._applyScopeId(child, scopeId);
    });
  }
  
  /**
   * Create bindings for parsed component
   */
  _createBindings(parsedElement, componentInstance) {
    const createComponentBindings = (parsed) => {
      // Handle loops
      if (parsed.type === 'loop') {
        const loopBinding = LoopBindingFactory.create(
          parsed,
          { component: componentInstance },
          [componentInstance]
        );
        this.bindings.push(loopBinding);
        bindingRegistry.register(parsed.loopConfig.anchor, loopBinding);
        return;
      }
      
      // Handle conditionals
      if (parsed.type === 'conditional') {
        const conditionalBinding = ConditionalBindingFactory.create(
          parsed,
          { component: componentInstance },
          [componentInstance]
        );
        this.bindings.push(conditionalBinding);
        bindingRegistry.register(parsed.conditionalConfig.anchor, conditionalBinding);
        return;
      }
      
      // Create regular bindings
      parsed.bindings.forEach(attributeBinding => {
        const binding = BindingFactory.create(
          parsed.element,
          attributeBinding,
          [componentInstance]
        );
        this.bindings.push(binding);
        bindingRegistry.register(parsed.element, binding);
      });
      
      // Recurse into children
      parsed.children.forEach(child => {
        createComponentBindings(child);
      });
    };
    
    createComponentBindings(parsedElement);
  }
  
  /**
   * Destroy component and cleanup
   */
  destroy() {
    console.log('[ComponentBinding.destroy] Called for:', this.componentName);
    console.trace(); // This shows the call stack!

    // Destroy lifecycle (runs cleanups, stops effects)
    if (this.lifecycle) {
      this.lifecycle.destroy();
      this.lifecycle = null;
    }
    
    // Destroy all bindings
    this.bindings.forEach(binding => {
      if (binding && binding.destroy) {
        binding.destroy();
      }
    });
    this.bindings = [];
    
    // Remove mounted element
    if (this.mountedElement && this.mountedElement.parentNode) {
      this.mountedElement.parentNode.removeChild(this.mountedElement);
      this.mountedElement = null;
    }
    
    this.instance = null;
  }
}


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
  ModelBinding,
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
    ModelBinding,
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

