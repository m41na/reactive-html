import { GlobalErrorHandler } from "./error-handling";
import { batchScheduler } from "./batch-effect";

/**
 * Effect - Reactive computation that re-runs when dependencies change
 */
export class Effect {
    constructor(fn) {
      this.fn = fn;
      this.dependencies = new Set();
      this.cleanups = [];
      this.active = true;
      this.scheduled = false;
  
      this.run();
    }
  
    track(signal) {
      if (!this.dependencies.has(signal)) {
        this.dependencies.add(signal);
  
        const unsubscribe = signal.subscribe(() => {
          if (this.active && !this.scheduled) {
            // Instead of running immediately, schedule via batch scheduler
            this.scheduled = true;
            batchScheduler.schedule(this);
          }
        });
  
        this.cleanups.push(unsubscribe);
      }
    }
  
    run() {
      if (!this.active) return;
  
      // Clear scheduled flag
      this.scheduled = false;
  
      this.cleanup();
      this.dependencies.clear();
  
      // Wrap in error boundary
      const safeRun = GlobalErrorHandler.wrap(() => {
        EffectTracker.track(this, this.fn);
      }, {
        type: 'effect',
        effect: this
      });
      
      safeRun();
    }
  
    cleanup() {
      this.cleanups.forEach(fn => fn());
      this.cleanups = [];
    }
  
    stop() {
      this.active = false;
      this.cleanup();
      this.dependencies.clear();
    }
  }

export class EffectTracker {
    static current = null;
    static stack = [];
  
    static create(fn) {
      return new Effect(fn);
    }
  
    static track(effect, fn) {
      const previousEffect = EffectTracker.current;
      EffectTracker.stack.push(previousEffect);
      EffectTracker.current = effect;
  
      try {
        return fn();
      } finally {
        EffectTracker.current = previousEffect;
        EffectTracker.stack.pop();
      }
    }
  }

