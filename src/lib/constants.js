/**
 * Constants - Centralized configuration and magic values
 */

// Directive Prefixes
export const DIRECTIVE_PREFIX = {
    PROPERTY: ':',
    EVENT: '@',
    MODEL: ':model'
  };
  
  // Special Directives
  export const DIRECTIVE = {
    EACH: ':each',
    IF: ':if',
    ELSE_IF: ':else-if',
    ELSE: ':else',
    KEY: ':key',
    MODEL: 'data-model'
  };
  
  // Reserved Property Names
  export const RESERVED_PROPS = {
    IS_REACTIVE: '__isReactive',
    RAW: '__raw',
    SIGNALS: '__signals'
  };
  
  // Component Definition Keys
  export const COMPONENT_KEYS = {
    DATA: 'data',
    SETUP: 'setup',
    PROPS: 'props',
    METHODS: 'methods'
  };
  
  // Lifecycle Hook Names
  export const LIFECYCLE_HOOKS = {
    ON_MOUNT: 'onMount',
    ON_UNMOUNT: 'onUnmount',
    WATCH: 'watch',
    WATCH_EFFECT: 'watchEffect'
  };
  
  // DOM Element Types
  export const ELEMENT_TYPE = {
    STATIC: 'static',
    REACTIVE: 'reactive',
    LOOP: 'loop',
    CONDITIONAL: 'conditional',
    COMPONENT: 'component'
  };
  
  // Conditional Branch Types
  export const BRANCH_TYPE = {
    IF: 'if',
    ELSE_IF: 'else-if',
    ELSE: 'else'
  };
  
  // Binding Types
  export const BINDING_TYPE = {
    PROPERTY: 'property',
    EVENT: 'event',
    MODEL: 'model'
  };
  
  // Special Tags to Skip
  export const SKIP_TAGS = new Set(['TEMPLATE', 'SCRIPT', 'STYLE']);
  
  // JavaScript Reserved Words
  export const JS_KEYWORDS = new Set([
    'true', 'false', 'null', 'undefined',
    'this', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'function',
    'var', 'let', 'const', 'new', 'typeof', 'instanceof',
    'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean',
    'console', 'window', 'document'
  ]);
  
  // Event Context Properties
  export const EVENT_CONTEXT = {
    EVENT: '$event',
    ELEMENT: '$element',
    TARGET: '$target'
  };
  
  // Error Types
  export const ERROR_TYPE = {
    BINDING: 'binding',
    EVENT: 'event',
    EFFECT: 'effect',
    COMPONENT: 'component',
    PARSE: 'parse'
  };
  
  // Loop Config Keys
  export const LOOP_CONFIG = {
    ITEM_NAME: 'itemName',
    INDEX_NAME: 'indexName',
    SOURCE: 'source',
    KEY_EXPRESSION: 'keyExpression'
  };

