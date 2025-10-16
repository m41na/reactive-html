import { RESERVED_PROPS } from './constants.js';
import Signal from './signal.js';

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
        if (property === RESERVED_PROPS.IS_REACTIVE) return true;
        if (property === RESERVED_PROPS.RAW) return target;
        if (property === RESERVED_PROPS.SIGNALS) return signals;
  
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
        }
  
        signal.value; // Trigger tracking
  
        if (typeof value === 'object' && value !== null) {
          return reactive(value);
        }
  
        return value;
      },
  
      set(target, property, value, receiver) {
        if (property === 'count') {
          console.log('🔶 [Reactive.set] Setting count to:', value);
        }
        
        const oldValue = target[property];
        
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
              console.log('🔶 [Reactive.set] Updating signal for count');
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

  export {reactive, ReactiveModel};