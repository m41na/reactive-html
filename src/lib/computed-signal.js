import Signal from "./signal";

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
export class ComputedSignal extends Signal {
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
  export function asyncComputed(getter, defaultValue = null) {
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
  export function computed(getter, context = null) {
    return new ComputedSignal(getter, context);
  }
