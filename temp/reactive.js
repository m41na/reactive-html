import {Signal} from "./signal";

/**
 * ReactiveModel - Wraps objects in Proxies to make them reactive
 *
 * Design principles:
 * - Deep reactivity (nested objects are automatically reactive)
 * - Transparent (works like normal objects)
 * - Array support (push/pop/splice trigger reactivity)
 * - Efficient (uses WeakMap to cache Proxies)
 *
 * @param {Object} target - The object to make reactive
 * @returns {Proxy} - Reactive version of the object
 */
function reactiveObject(target) {
  // Already reactive? Return as-is
  if (ReactiveModel._reactiveMap.has(target)) {
    return ReactiveModel._reactiveMap.get(target);
  }

  // Primitives can't be proxied
  if (typeof target !== 'object' || target === null) {
    return target;
  }

  // Create signals for this object's properties
  const signals = ReactiveModel._getSignals(target);

  const proxy = new Proxy(target, {
    get(target, property, receiver) {
      // Special properties
      if (property === '__isReactive') return true;
      if (property === '__raw') return target;
      if (property === '__signals') return signals;

      // Get the value
      const value = Reflect.get(target, property, receiver);

      // Track access to this property
      const signal = signals.get(property);
      if (signal) {
        signal.value; // Trigger dependency tracking
      }

      // If value is an object, make it reactive too (deep reactivity)
      if (typeof value === 'object' && value !== null) {
        return reactive(value);
      }

      return value;
    },

    set(target, property, value, receiver) {
      const oldValue = target[property];

      // Set the new value
      const result = Reflect.set(target, property, value, receiver);

      // Notify if changed
      if (oldValue !== value) {
        let signal = signals.get(property);
        if (!signal) {
          signal = new Signal(value);
          signals.set(property, signal);
        } else {
          signal.value = value;
        }
      }

      return result;
    },

    deleteProperty(target, property) {
      const hadProperty = property in target;
      const result = Reflect.deleteProperty(target, property);

      if (hadProperty) {
        // Trigger reactivity on deletion
        const signal = signals.get(property);
        if (signal) {
          signal.value = undefined;
        }
      }

      return result;
    }
  });

  // Cache the proxy
  ReactiveModel._reactiveMap.set(target, proxy);
  ReactiveModel._rawMap.set(proxy, target);

  return proxy;
}

/**
 * ReactiveModel - Static utilities and caches
 */
class ReactiveModel {
  // Map from raw object -> reactive proxy
  static _reactiveMap = new WeakMap();

  // Map from reactive proxy -> raw object
  static _rawMap = new WeakMap();

  // Map from raw object -> Map of property signals
  static _signalsMap = new WeakMap();

  /**
   * Get or create signal map for an object
   */
  static _getSignals(target) {
    let signals = this._signalsMap.get(target);
    if (!signals) {
      signals = new Map();
      this._signalsMap.set(target, signals);
    }
    return signals;
  }

  /**
   * Check if an object is reactive
   */
  static isReactive(obj) {
    return obj && obj.__isReactive === true;
  }

  /**
   * Get the raw (non-reactive) version of an object
   */
  static toRaw(obj) {
    return this._rawMap.get(obj) || obj;
  }
}

/**
 * Enhanced reactive array with detailed change tracking
 *
 * Emits special signals for different mutation types:
 * - push/unshift: items added
 * - pop/shift: items removed
 * - splice: items added/removed
 * - sort/reverse: items reordered
 */
function reactiveArray(arr) {
  const signals = ReactiveModel._getSignals(arr);

  // Create special change signal
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

  const proxy = new Proxy(arr, {
    get(target, property, receiver) {
      // Intercept array mutation methods
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
        return function(...args) {
          const oldLength = target.length;

          // Call original method
          const result = Array.prototype[property].apply(target, args);

          // Update length signal
          lengthSignal.value = target.length;

          // Emit change event with details
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
        lengthSignal.value; // Trigger tracking
      }

      const value = Reflect.get(target, property, receiver);

      // Make nested objects reactive
      if (typeof value === 'object' && value !== null) {
        return reactive(value);
      }

      return value;
    },

    set(target, property, value, receiver) {
      const oldValue = target[property];
      const result = Reflect.set(target, property, value, receiver);

      // Update length signal if needed
      if (property === 'length' || !isNaN(property)) {
        lengthSignal.value = target.length;

        // Emit change for index assignment
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

export function reactive(target) {
  if (Array.isArray(target)) {
    return reactiveArray(target);
  }
  return reactiveObject(target);
}

