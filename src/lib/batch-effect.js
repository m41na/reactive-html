/**
 * BatchScheduler - Batches DOM updates using requestAnimationFrame
 *
 * Design principles:
 * - Multiple signal changes = one DOM update
 * - Uses RAF for optimal rendering timing
 * - Microtask queue for immediate updates when needed
 * - Automatic deduplication (same effect doesn't run twice)
 *
 * Performance characteristics:
 * - Before: N changes = N DOM updates
 * - After: N changes = 1 DOM update (60fps)
 */
export class BatchScheduler {
    constructor() {
      this.pendingEffects = new Set();
      this.isScheduled = false;
      this.isFlushing = false;
    }
  
    /**
     * Schedule an effect to run in the next batch
     * @param {Effect} effect - The effect to schedule
     */
    schedule(effect) {
      // Add to pending queue
      this.pendingEffects.add(effect);
  
      // Schedule flush if not already scheduled
      if (!this.isScheduled && !this.isFlushing) {
        this.isScheduled = true;
        requestAnimationFrame(() => this.flush());
      }
    }
  
    /**
     * Flush all pending effects
     */
    flush() {
      if (this.isFlushing) return;
  
      this.isFlushing = true;
      this.isScheduled = false;
  
      // Copy and clear pending effects
      const effects = Array.from(this.pendingEffects);
      this.pendingEffects.clear();
  
      // Run all effects
      effects.forEach(effect => {
        if (effect.active) {
          effect.run();
        }
      });
  
      this.isFlushing = false;
  
      // If new effects were scheduled during flush, schedule another flush
      if (this.pendingEffects.size > 0 && !this.isScheduled) {
        this.isScheduled = true;
        requestAnimationFrame(() => this.flush());
      }
    }
  
    /**
     * Force immediate flush (for testing or critical updates)
     */
    flushSync() {
      this.flush();
    }
  }
  
  // Global scheduler instance
  export const batchScheduler = new BatchScheduler();
  
  /**
   * nextTick - Wait for next batch of DOM updates
   *
   * @param {Function} callback - Called after DOM updates
   * @returns {Promise} - Resolves after DOM updates
   *
   * @example
   * cart.items.push(newItem);
   * await nextTick();
   * console.log('DOM updated!', document.querySelector('.item:last-child'));
   */
  export function nextTick(callback) {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (callback) callback();
          resolve();
        });
      });
    });
  }
  
  /**
   * batch - Execute multiple updates in a single batch
   *
   * @param {Function} fn - Function containing multiple updates
   * @returns {*} - Return value of fn
   *
   * @example
   * batch(() => {
   *   cart.items.push(item1);
   *   cart.items.push(item2);
   *   cart.items.push(item3);
   * });
   * // Only one DOM update after all three pushes
   */
  export function batch(fn) {
    // Execute function
    const result = fn();
  
    // Force immediate flush
    batchScheduler.flushSync();
  
    return result;
  }