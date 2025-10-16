/**
 * GlobalErrorHandler - Singleton for framework-wide error handling
 */
export class GlobalErrorHandler {
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
export class ErrorBoundary {
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
  
  
  // Initialize with default options
  export const errorBoundary = GlobalErrorHandler.initialize();
