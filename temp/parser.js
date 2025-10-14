// ============================================================================
// DATA STRUCTURES
// ============================================================================

class ParsedElement {
  constructor(element) {
    this.element = element;              // The actual DOM element
    this.type = null;                    // 'component' | 'loop' | 'conditional' | 'reactive' | 'static'
    this.bindings = [];                  // Array of AttributeBinding
    this.children = [];                  // Parsed child elements
    this.context = null;                 // Context variables at this point
    this.isRegistrationPoint = false;    // Is this a custom element to register?
    this.isResumePoint = false;          // Should we resume parsing after this?
    this.loopConfig = null;              // LoopConfig (if type === 'loop')
    this.conditionalConfig = null;       // ConditionalConfig (if type === 'conditional')
  }
}

class AttributeBinding {
  constructor(name, expression, type) {
    this.name = name;           // 'text', 'class', 'value', etc.
    this.expression = expression; // 'item.name', 'items.length > 0', etc.
    this.type = type;           // 'property' | 'event' | 'attribute'
    this.dependencies = [];     // Which variables this depends on
  }
}

class LoopConfig {
  constructor(element, eachAttr) {
    const parsed = this._parseEachExpression(eachAttr);

    this.itemVar = parsed.itemVar;        // 'item'
    this.indexVar = parsed.indexVar;      // 'index' (optional)
    this.source = parsed.source;          // 'items'
    this.keyExpression = this._extractKey(element); // :key="item.id"

    // Template for cloning
    this.template = element.cloneNode(true);
    this.template.removeAttribute(':each');
    this.template.removeAttribute(':key');

    // Anchor point in DOM (comment node)
    this.anchor = document.createComment(`each: ${this.itemVar} in ${this.source}`);
    element.replaceWith(this.anchor);

    // Track rendered instances
    this.instances = [];  // Array of { key, element, data, context }
  }

  _parseEachExpression(expr) {
    // Support multiple syntaxes:
    // "item in items"
    // "item, index in items"
    // "(item, index) in items"

    const patterns = [
      // "(item, index) in items"
      /^\((\w+)\s*,\s*(\w+)\)\s+in\s+([\w.]+)$/,
      // "item, index in items"
      /^(\w+)\s*,\s*(\w+)\s+in\s+([\w.]+)$/,
      // "item in items"
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

    throw new Error(`Invalid :each syntax: "${expr}". Expected "item in items" or "item, index in items"`);
  }

  _extractKey(element) {
    // Check for :key attribute
    const keyAttr = element.getAttribute(':key');
    if (keyAttr) {
      return keyAttr;
    }

    // Fallback: use index as key (less efficient)
    return '$index';
  }
}

class ConditionalConfig {
  constructor(element) {
    this.branches = this._parseBranches(element);

    // Placeholder comment node
    this.anchor = document.createComment('if');

    // Track which branch is currently active
    this.activeBranch = null;
    this.activeElement = null;

    // Replace element with anchor
    element.replaceWith(this.anchor);
  }

  _parseBranches(element) {
    const branches = [];
    let current = element;

    // Primary :if branch
    if (current.hasAttribute(':if')) {
      const elem = current.cloneNode(true);
      elem.removeAttribute(':if');

      branches.push({
        type: 'if',
        expression: current.getAttribute(':if'),
        element: elem,
        parsed: null,  // Will be parsed lazily
        signals: null
      });
    }

    // Look for :else-if and :else siblings
    let sibling = element.nextElementSibling;
    while (sibling) {
      if (sibling.hasAttribute(':else-if')) {
        const elem = sibling.cloneNode(true);
        elem.removeAttribute(':else-if');

        branches.push({
          type: 'else-if',
          expression: sibling.getAttribute(':else-if'),
          element: elem,
          parsed: null,
          signals: null
        });

        const next = sibling.nextElementSibling;
        sibling.remove();
        sibling = next;

      } else if (sibling.hasAttribute(':else')) {
        const elem = sibling.cloneNode(true);
        elem.removeAttribute(':else');

        branches.push({
          type: 'else',
          expression: 'true',  // Always true
          element: elem,
          parsed: null,
          signals: null
        });

        sibling.remove();
        break; // :else must be last

      } else {
        break; // No more conditional siblings
      }
    }

    return branches;
  }
}

// ============================================================================
// MAIN PARSER
// ============================================================================

class ReactiveHTMLParser {
  constructor() {
    this.parsed = new Map();  // element -> ParsedElement
    this.customElements = new Set(); // Track custom element names
  }

  /**
   * Parse an element tree and return metadata about reactive bindings
   * @param {HTMLElement} rootElement - The root element to parse
   * @param {Array} contextStack - The current variable context stack
   * @returns {ParsedElement} - Parsed metadata tree
   */
  parse(rootElement, contextStack = []) {
    return this._parseElement(rootElement, contextStack);
  }

  /**
   * Get all custom elements discovered during parsing
   * @returns {Set<string>} - Set of custom element tag names
   */
  getCustomElements() {
    return this.customElements;
  }

  // ==========================================================================
  // CORE PARSING
  // ==========================================================================

  _parseElement(element, contextStack) {
    // Skip text nodes, comments
    if (element?.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const parsed = new ParsedElement(element);

    // LOOPS - Handle first (highest priority)
    if (element.hasAttribute(':each')) {
      parsed.type = 'loop';
      parsed.loopConfig = new LoopConfig(element, element.getAttribute(':each'));
      parsed.context = [...contextStack];
      parsed.isResumePoint = true;

      // Don't recurse into loop body here - will be done per-instance
      this.parsed.set(element, parsed);
      return parsed;
    }

    // CONDITIONALS - Handle second
    if (element.hasAttribute(':if')) {
      parsed.type = 'conditional';
      parsed.conditionalConfig = new ConditionalConfig(element);
      parsed.context = [...contextStack];
      parsed.isResumePoint = true;

      // Conditionals are lazy - don't parse branches until needed
      this.parsed.set(element, parsed);
      return parsed;
    }

    // Skip :else-if and :else (already handled by previous :if)
    if (element.hasAttribute(':else-if') || element.hasAttribute(':else')) {
      return null;
    }

    // REGULAR ELEMENTS
    parsed.type = this._classifyElement(element);
    parsed.context = [...contextStack];

    // Check if this is a custom element registration point
    if (this._isCustomElement(element)) {
      parsed.isRegistrationPoint = true;
      this.customElements.add(element.tagName.toLowerCase());
    }

    // Mark resume points
    if (parsed.type !== 'static') {
      parsed.isResumePoint = true;
    }

    // Parse reactive bindings (signal insertion points)
    parsed.bindings = this._parseBindings(element);

    // Recurse into children
    Array.from(element.children).forEach(child => {
      const childParsed = this._parseElement(child, contextStack);
      if (childParsed) {
        parsed.children.push(childParsed);
      }
    });

    this.parsed.set(element, parsed);
    return parsed;
  }

  // ==========================================================================
  // ELEMENT CLASSIFICATION
  // ==========================================================================

  _classifyElement(element) {
    // Priority order matters!

    // Already handled above, but double-check
    if (this._hasAttribute(element, ':each')) {
      return 'loop';
    }

    if (this._hasAttribute(element, ':if')) {
      return 'conditional';
    }

    // Custom element
    if (this._isCustomElement(element)) {
      return 'component';
    }

    // Has any reactive attributes?
    if (this._hasReactiveAttributes(element)) {
      return 'reactive';
    }

    // Check if children have reactive stuff
    const hasReactiveChildren = Array.from(element.children).some(child =>
      this._hasReactiveAttributes(child) ||
      this._isCustomElement(child) ||
      child.hasAttribute(':each') ||
      child.hasAttribute(':if')
    );

    if (hasReactiveChildren) {
      return 'reactive'; // Parent of reactive elements
    }

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

  // ==========================================================================
  // BINDING PARSING
  // ==========================================================================

  _parseBindings(element) {
    const bindings = [];

    Array.from(element.attributes).forEach(attr => {
      // Property bindings (:text, :class, :value, etc.)
      if (attr.name.startsWith(':')) {
        const propName = attr.name.slice(1); // Remove ':'
        const binding = new AttributeBinding(
          propName,
          attr.value,
          'property'
        );
        binding.dependencies = this._extractDependencies(attr.value);
        bindings.push(binding);
      }

      // Event bindings (@click, @input, etc.)
      else if (attr.name.startsWith('@')) {
        const eventName = attr.name.slice(1); // Remove '@'
        const binding = new AttributeBinding(
          eventName,
          attr.value,
          'event'
        );
        binding.dependencies = this._extractDependencies(attr.value);
        bindings.push(binding);
      }

      // Data model binding
      else if (attr.name === 'data-model') {
        const binding = new AttributeBinding(
          'model',
          attr.value,
          'property'
        );
        bindings.push(binding);
      }
    });

    return bindings;
  }

  // ==========================================================================
  // DEPENDENCY EXTRACTION
  // ==========================================================================

  _extractDependencies(expression) {
    // Simple regex to find variable references
    // Matches: item.name, items.length, cart.total, etc.
    const deps = [];
    const regex = /\b(\w+(?:\.\w+)*)\b/g;
    let match;

    while ((match = regex.exec(expression)) !== null) {
      const path = match[1];
      // Filter out JavaScript keywords and method names
      if (!this._isKeyword(path) && !this._isMethodCall(expression, match.index)) {
        deps.push(path);
      }
    }

    return [...new Set(deps)]; // Deduplicate
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
    // Check if this is a method call by looking ahead for '('
    const remaining = expression.slice(index);
    return /^\w+\s*\(/.test(remaining);
  }
}

// ============================================================================
// EXPORTS (if using modules)
// ============================================================================

// For browser usage:
if (typeof window !== 'undefined') {
  window.ReactiveHTMLParser = ReactiveHTMLParser;
  window.ParsedElement = ParsedElement;
  window.AttributeBinding = AttributeBinding;
  window.LoopConfig = LoopConfig;
  window.ConditionalConfig = ConditionalConfig;
}

// For Node.js/module usage:
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReactiveHTMLParser,
    ParsedElement,
    AttributeBinding,
    LoopConfig,
    ConditionalConfig
  };
}
