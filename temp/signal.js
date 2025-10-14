import {EffectTracker} from "./effects";

/**
 * Signal - A reactive value container
 *
 * The fundamental building block of the reactivity system.
 * A Signal holds a value and notifies subscribers when it changes.
 *
 * Design principles:
 * - Minimal API surface (get, set, subscribe)
 * - No magic - explicit subscriptions
 * - Efficient - uses Set for O(1) add/remove
 * - Memory safe - returns unsubscribe function
 */
export class Signal {
  constructor(initialValue) {
    this._value = initialValue;
    this._subscribers = new Set();
    this._id = Signal._nextId++;
  }

  static _nextId = 0;

  /**
   * Get the current value
   * If accessed during effect tracking, automatically subscribes
   */
  get value() {
    // If we're inside an effect, register this signal as a dependency
    if (EffectTracker.current) {
      EffectTracker.current.track(this);
    }
    return this._value;
  }

  /**
   * Set a new value
   * Only notifies if value actually changed (reference equality)
   */
  set value(newValue) {
    if (this._value === newValue) {
      return; // No change, don't notify
    }

    const oldValue = this._value;
    this._value = newValue;
    this._notify(newValue, oldValue);
  }

  /**
   * Subscribe to changes
   * @param {Function} callback - Called with (newValue, oldValue)
   * @returns {Function} - Unsubscribe function
   */
  subscribe(callback) {
    this._subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this._subscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of a change
   * @private
   */
  _notify(newValue, oldValue) {
    // Copy subscribers to avoid issues if subscriber modifies the set
    const subscribers = Array.from(this._subscribers);

    subscribers.forEach(callback => {
      try {
        callback(newValue, oldValue);
      } catch (error) {
        console.error('Error in signal subscriber:', error);
      }
    });
  }

  /**
   * Get number of active subscriptions (for debugging)
   */
  get subscriberCount() {
    return this._subscribers.size;
  }

  /**
   * Dispose of this signal (cleanup all subscribers)
   */
  dispose() {
    this._subscribers.clear();
  }

  toString() {
    return `Signal(${this._value})`;
  }
}
