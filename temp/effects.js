
/**
 * EffectTracker - Tracks which signals are accessed during effect execution
 *
 * This is the "invisible" part that makes reactivity automatic.
 * When an effect runs, any Signal.value access is recorded as a dependency.
 *
 * Design principles:
 * - Global tracking stack (handles nested effects)
 * - Automatic cleanup (clears old dependencies before re-run)
 * - Error handling (doesn't break if effect throws)
 */
export class EffectTracker {
  static current = null;  // Currently executing effect
  static stack = [];      // Stack for nested effects

  /**
   * Create a new effect
   * @param {Function} fn - The effect function to run
   * @returns {Effect} - The effect instance
   */
  static create(fn) {
    return new Effect(fn);
  }

  /**
   * Run a function with dependency tracking
   * @param {Effect} effect - The effect to track
   * @param {Function} fn - The function to execute
   */
  static track(effect, fn) {
    // Save previous effect (for nested effects)
    const previousEffect = EffectTracker.current;
    EffectTracker.stack.push(previousEffect);

    // Set as current effect
    EffectTracker.current = effect;

    try {
      return fn();
    } finally {
      // Restore previous effect
      EffectTracker.current = previousEffect;
      EffectTracker.stack.pop();
    }
  }
}

/**
 * Effect - A reactive computation that auto-updates when dependencies change
 *
 * Examples:
 * - Updating DOM when data changes
 * - Computing derived values
 * - Side effects (logging, analytics, etc.)
 */
class Effect {
  constructor(fn) {
    this.fn = fn;
    this.dependencies = new Set();  // Signals this effect depends on
    this.cleanups = [];             // Cleanup functions
    this.active = true;             // Is this effect still active?

    // Run immediately to establish dependencies
    this.run();
  }

  /**
   * Track a signal as a dependency
   * Called automatically when Signal.value is accessed during run()
   */
  track(signal) {
    if (!this.dependencies.has(signal)) {
      this.dependencies.add(signal);

      // Subscribe to this signal
      const unsubscribe = signal.subscribe(() => {
        if (this.active) {
          this.run();
        }
      });

      this.cleanups.push(unsubscribe);
    }
  }

  /**
   * Run the effect function
   * Clears old dependencies and tracks new ones
   */
  run() {
    if (!this.active) return;

    // Clear old subscriptions
    this.cleanup();
    this.dependencies.clear();

    // Run with tracking enabled
    try {
      EffectTracker.track(this, this.fn);
    } catch (error) {
      console.error('Error in effect:', error);
    }
  }

  /**
   * Clean up subscriptions
   */
  cleanup() {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
  }

  /**
   * Stop this effect (unsubscribe from all signals)
   */
  stop() {
    this.active = false;
    this.cleanup();
    this.dependencies.clear();
  }
}
