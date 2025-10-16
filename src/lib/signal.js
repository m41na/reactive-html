import { EffectTracker } from "./effect";

/**
 * Signal - Observable value with subscriber notifications
 */
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
      console.log('🔶 [Signal.set] Signal ID:', this._id, 'old:', this._value, 'new:', newValue);
      
      if (this._value === newValue) {
        console.log('⚠️ [Signal.set] Value unchanged, skipping notification');
        return;
      }
      
      const oldValue = this._value;
      this._value = newValue;
      
      console.log('🔶 [Signal.set] Notifying', this._subscribers.size, 'subscribers');
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

  export default Signal;