import { reactive } from "./reactive";
import { bindingRegistry, BindingFactory, } from "./binding.js";
import {ExpressionEvaluator} from './event-binding.js';
import { EffectTracker } from "./effect.js";
import { 
  DIRECTIVE, 
  SKIP_TAGS, 
  ELEMENT_TYPE, 
  BRANCH_TYPE,
  DIRECTIVE_PREFIX,
  COMPONENT_KEYS,
  LIFECYCLE_HOOKS,
  BINDING_TYPE,
  JS_KEYWORDS,
} from './constants.js';

class AttributeBinding {
  constructor(name, expression, type) {
    this.name = name;
    this.expression = expression;
    this.type = type;                    // 'property' | 'event' | 'attribute'
    this.dependencies = [];
  }
}

export class ReactiveHTMLParser {
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
      if (attr.name === DIRECTIVE.MODEL || attr.name === DIRECTIVE.KEY) {
        return;
      }
      
      if (attr.name.startsWith(DIRECTIVE_PREFIX.PROPERTY)) {
        // Dynamic prop
        props.push({
          name: attr.name.slice(1),
          expression: attr.value,
          isDynamic: true
        });
      } else if (attr.name.startsWith(DIRECTIVE_PREFIX.EVENT)) {
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
    if (element.hasAttribute(DIRECTIVE.EACH)) {
      return this._parseLoop(element, parentContext);
    }
    
    // Check for :if (conditional)
    if (element.hasAttribute(DIRECTIVE.IF)) {
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
    const isRegistrationPoint = element.hasAttribute(DIRECTIVE.MODEL);
    
    // Parse children
    const children = [];
    Array.from(element.children).forEach(child => {
      // Skip <template>, <script>, <style> tags
      if (SKIP_TAGS.has(child.tagName)) {
        return;
      }
      
      const parsed = this._parseElement(child, parentContext);  // ← Pass parentContext here!
      if (parsed) {
        children.push(parsed);
      }
    });
    
    return {
      type: bindings.length > 0 ? ELEMENT_TYPE.REACTIVE : ELEMENT_TYPE.STATIC,
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
    const eachAttr = element.getAttribute(DIRECTIVE.EACH);
    const keyAttr = element.getAttribute(DIRECTIVE.KEY);
    
    // Parse "item in items" or "item, index in items"
    const match = eachAttr.match(/^(?:(\w+)(?:\s*,\s*(\w+))?\s+in\s+)?(.+)$/);
    
    if (!match) {
      throw new Error(`Invalid :each expression: ${eachAttr}`);
    }
    
    const itemName = match[1] || 'item';
    const indexName = match[2] || null;
    const source = match[3];
    
    // Remove :each and :key attributes
    element.removeAttribute(DIRECTIVE.EACH);
    if (keyAttr) {
      element.removeAttribute(DIRECTIVE.KEY);
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
      type: ELEMENT_TYPE.LOOP,
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
    if (element.hasAttribute(DIRECTIVE.IF)) {
      const condition = element.getAttribute(DIRECTIVE.IF);
      element.removeAttribute(DIRECTIVE.IF);
      
      branches.push({
        type: BRANCH_TYPE.IF,
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
      if (sibling.hasAttribute(DIRECTIVE.ELSE_IF)) {
        const condition = sibling.getAttribute(DIRECTIVE.ELSE_IF);
        sibling.removeAttribute(DIRECTIVE.ELSE_IF);
        
        branches.push({
          type: BRANCH_TYPE.ELSE_IF,
          expression: condition,
          template: sibling.cloneNode(true),
          element: null,
          parsed: null,
          bindings: null
        });
        
        siblings.push(sibling);
        sibling = sibling.nextElementSibling;
        
      } else if (sibling.hasAttribute(DIRECTIVE.ELSE)) {
        sibling.removeAttribute(DIRECTIVE.ELSE);
        
        branches.push({
          type: BRANCH_TYPE.ELSE,
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
      type: ELEMENT_TYPE.CONDITIONAL,
      element: anchor,
      conditionalConfig,
      bindings: [],
      children: []
    };
  }

  _classifyElement(element) {
    if (this._hasAttribute(element, DIRECTIVE.EACH)) return ELEMENT_TYPE.LOOP;
    if (this._hasAttribute(element, DIRECTIVE.IF)) return ELEMENT_TYPE.CONDITIONAL;
    if (this._isCustomElement(element)) return ELEMENT_TYPE.COMPONENT;
    if (this._hasReactiveAttributes(element)) return ELEMENT_TYPE.REACTIVE;

    const hasReactiveChildren = Array.from(element.children).some(child =>
      this._hasReactiveAttributes(child) ||
      this._isCustomElement(child) ||
      child.hasAttribute(DIRECTIVE.EACH) ||
      child.hasAttribute(DIRECTIVE.IF)
    );

    if (hasReactiveChildren) return ELEMENT_TYPE.REACTIVE;
    return ELEMENT_TYPE.STATIC;
  }

  _isCustomElement(element) {
    const tagName = element.tagName.toLowerCase();
    return tagName.startsWith('re-') || tagName.includes('-');
  }

  _hasReactiveAttributes(element) {
    return Array.from(element.attributes).some(attr =>
      attr.name.startsWith(DIRECTIVE_PREFIX.PROPERTY) ||
      attr.name.startsWith(DIRECTIVE_PREFIX.EVENT) ||
      attr.name === DIRECTIVE.MODEL
    );
  }

  _hasAttribute(element, name) {
    return element.hasAttribute(name);
  }

  _parseBindings(element) {
    const bindings = [];

    Array.from(element.attributes).forEach(attr => {
      if (attr.name.startsWith(DIRECTIVE_PREFIX.PROPERTY)) {
        const propName = attr.name.slice(1);

        const binding = new AttributeBinding(
          propName,
          attr.value,
          BINDING_TYPE.PROPERTY
        );
        binding.dependencies = this._extractDependencies(attr.value);
        bindings.push(binding);
      } else if (attr.name.startsWith(DIRECTIVE_PREFIX.EVENT)) {
        const eventName = attr.name.slice(1);
        const binding = new AttributeBinding(eventName, attr.value, BINDING_TYPE.EVENT);
        binding.dependencies = this._extractDependencies(attr.value);
        bindings.push(binding);
      } else if (attr.name === DIRECTIVE.MODEL) {
        const binding = new AttributeBinding('model', attr.value, BINDING_TYPE.PROPERTY);
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
    return JS_KEYWORDS.has(word);
  }

  _isMethodCall(expression, index) {
    const remaining = expression.slice(index);
    return /^\w+\s*\(/.test(remaining);
  }
}

/**
* ComponentRegistry - Central registry for all components
*/
export class ComponentRegistry {
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

 export class ComponentBinding {
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
    console.log('🔷 [DEBUG] Creating component:', this.componentName);

     const component = ComponentRegistry.get(this.componentName);
     if (!component) {
       console.error(`Component not found: ${this.componentName}`);
       return;
     }

     console.log('✅ Component found, definition:', Object.keys(component.definition));
     
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
       componentData[LIFECYCLE_HOOKS.ON_MOUNT] = this.lifecycle.onMount.bind(this.lifecycle);
       componentData[LIFECYCLE_HOOKS.ON_UNMOUNT] = this.lifecycle.onUnmount.bind(this.lifecycle);
       componentData[LIFECYCLE_HOOKS.WATCH_EFFECT] = this.lifecycle.watchEffect.bind(this.lifecycle);
       componentData[LIFECYCLE_HOOKS.WATCH] = this.lifecycle.watch.bind(this.lifecycle);
       
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
       
       // Make reactive FIRST (before binding methods!)
      this.instance = reactive(componentData);

      // NOW bind component methods to the REACTIVE instance
      Object.keys(component.definition).forEach(key => {
        const value = component.definition[key];
        const isReservedKey = key === COMPONENT_KEYS.DATA || key === COMPONENT_KEYS.SETUP;

        if (typeof value === 'function' && !isReservedKey) {
          this.instance[key] = value.bind(this.instance);  // ← Bind to REACTIVE proxy!
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
       if (component.definition[COMPONENT_KEYS.SETUP]) {
        console.log('🔷 [DEBUG] Running setup()');
        component.definition[COMPONENT_KEYS.SETUP].call(this.instance);
        console.log('✅ Setup complete');
      }
       
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
    console.log('🔷 [DEBUG] Evaluating props:', this.props);

     const props = {};
     
     this.props.forEach(prop => {
       if (prop.isDynamic) {
         // Dynamic prop: :prop="value"
         try {
           props[prop.name] = ExpressionEvaluator.evaluate(
             prop.expression,
             this.contextStack
           );
           console.log('✅ Dynamic prop', prop.name, '=', props[prop.name]);
         } catch (error) {
          console.error('❌ Error evaluating prop:', prop.name, error);
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
         console.log('✅ Static prop', prop.name, '=', value);
       }
     });
     
     console.log('✅ Final props:', props);
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

/**
 * ComponentLoader - Load component HTML files
 * 
 * Parses:
 * - <template> tag (required)
 * - <script> tag (optional)
 * - <style> tag (optional, can be scoped)
 */
export class ComponentLoader {
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

  /**
 * ScopedStyler - Add scope to CSS rules
 */
export class ScopedStyler {
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
        if (selector.trim().startsWith(DIRECTIVE_PREFIX.EVENT)) return match;
        
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

/**
 * ComponentLifecycle - Lifecycle management using effects
 * 
 * Philosophy: Lifecycle is just effects with sugar
 * - onMount = effect that runs once
 * - onUnmount = cleanup function
 * - watch/watchEffect = reactive effects (what we already have!)
 */
export class ComponentLifecycle {
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



