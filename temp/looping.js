import {EffectTracker} from "./effects";
import {ExpressionEvaluator, BindingFactory, bindingRegistry} from "./binding";

/**
 * LoopBinding - Manages rendering of :each loops
 *
 * Responsibilities:
 * - Initial render of all items
 * - Watch for array mutations (push, pop, splice, sort)
 * - Keyed reconciliation (match old elements to new data)
 * - Minimal DOM updates (only add/remove/move what changed)
 * - Scoped context per item (item, index, parent)
 *
 * Algorithm:
 * 1. Build key map of existing instances
 * 2. Build key map of new data
 * 3. Determine what to add, remove, update, move
 * 4. Apply changes in optimal order
 *
 * Performance characteristics:
 * - O(n) keyed reconciliation (using Maps)
 * - Minimal DOM operations (only what changed)
 * - Element reuse (same key = same element)
 */
class LoopBinding {
  constructor(loopConfig, model, contextStack) {
    this.loopConfig = loopConfig;
    this.model = model;
    this.parentContext = contextStack;
    this.instances = [];  // Current rendered instances
    this.effect = null;

    // Create effect to watch source array
    this._createEffect();
  }

  /**
   * Create an effect that watches the source array
   */
  _createEffect() {
    this.effect = EffectTracker.create(() => {
      // Get the source array from context
      const sourceArray = this._getSourceArray();

      if (!Array.isArray(sourceArray)) {
        console.warn(`Loop source is not an array: ${this.loopConfig.source}`);
        return;
      }

      // Reconcile - update DOM to match new array
      this._reconcile(sourceArray);
    });
  }

  /**
   * Get the source array from the model context
   */
  _getSourceArray() {
    const expr = this.loopConfig.source;
    return ExpressionEvaluator.evaluate(expr, this.parentContext);
  }

  /**
   * Reconcile current DOM state with new array data
   * This is the heart of efficient loop updates
   */
  _reconcile(newData) {
    // Build maps for efficient lookup
    const oldByKey = this._buildKeyMap(this.instances);
    const newByKey = this._buildDataKeyMap(newData);

    // Determine operations needed
    const operations = this._planOperations(oldByKey, newByKey, newData);

    // Apply operations
    this._applyOperations(operations);

    // Update instances list
    this.instances = operations.finalInstances;
  }

  /**
   * Build map of existing instances by key
   */
  _buildKeyMap(instances) {
    const map = new Map();
    instances.forEach((instance, index) => {
      const key = this._computeKey(instance.data, instance.context);
      map.set(key, { instance, index });
    });
    return map;
  }

  /**
   * Build map of new data by key
   */
  _buildDataKeyMap(dataArray) {
    const map = new Map();
    dataArray.forEach((data, index) => {
      const context = this._createItemContext(data, index);
      const key = this._computeKey(data, context);
      map.set(key, { data, index, context });
    });
    return map;
  }

  /**
   * Compute key for an item
   * Uses :key expression or falls back to index
   */
  _computeKey(data, context) {
    if (this.loopConfig.keyExpression === '$index') {
      return context.$index;
    }

    try {
      return ExpressionEvaluator.evaluate(
        this.loopConfig.keyExpression,
        [context]
      );
    } catch (error) {
      console.warn('Error computing key:', error);
      return context.$index;
    }
  }

  /**
   * Create context object for a loop item
   */
  _createItemContext(data, index) {
    const context = {
      [this.loopConfig.itemVar]: data,
      $index: index,
      $parent: this.parentContext[this.parentContext.length - 1] || {}
    };

    // Add index variable if specified
    if (this.loopConfig.indexVar) {
      context[this.loopConfig.indexVar] = index;
    }

    return context;
  }

  /**
   * Plan what operations are needed to go from old state to new state
   */
  _planOperations(oldByKey, newByKey, newData) {
    const toRemove = [];
    const toUpdate = [];
    const toAdd = [];
    const toMove = [];

    // Find items to remove or update
    oldByKey.forEach((oldItem, key) => {
      if (newByKey.has(key)) {
        // Item still exists - might need update or move
        const newItem = newByKey.get(key);
        toUpdate.push({
          key,
          instance: oldItem.instance,
          newData: newItem.data,
          newIndex: newItem.index,
          oldIndex: oldItem.index,
          newContext: newItem.context
        });
      } else {
        // Item removed
        toRemove.push(oldItem.instance);
      }
    });

    // Find items to add
    newByKey.forEach((newItem, key) => {
      if (!oldByKey.has(key)) {
        toAdd.push({
          key,
          data: newItem.data,
          index: newItem.index,
          context: newItem.context
        });
      }
    });

    // Build final instances array
    const finalInstances = newData.map((data, index) => {
      const context = this._createItemContext(data, index);
      const key = this._computeKey(data, context);

      // Reuse existing instance if available
      if (oldByKey.has(key)) {
        const instance = oldByKey.get(key).instance;
        // Update instance data and context
        instance.data = data;
        instance.context = context;
        return instance;
      }

      // Will be created in toAdd
      return null;
    });

    return { toRemove, toUpdate, toAdd, finalInstances };
  }

  /**
   * Apply planned operations to the DOM
   */
  _applyOperations(operations) {
    // 1. Remove deleted items
    operations.toRemove.forEach(instance => {
      instance.element.remove();
      instance.cleanup();
    });

    // 2. Update existing items (data might have changed)
    operations.toUpdate.forEach(op => {
      // Update context - this will trigger reactive updates
      Object.assign(op.instance.context, op.newContext);
    });

    // 3. Create and insert new items
    operations.toAdd.forEach(op => {
      const instance = this._createInstance(op.data, op.context);

      // Insert at correct position
      const targetIndex = op.index;
      const anchor = this.loopConfig.anchor;

      if (targetIndex === 0) {
        // Insert at beginning (right after anchor)
        anchor.parentNode.insertBefore(instance.element, anchor.nextSibling);
      } else {
        // Insert after previous item
        const previousInstance = operations.finalInstances[targetIndex - 1];
        if (previousInstance && previousInstance.element) {
          previousInstance.element.parentNode.insertBefore(
            instance.element,
            previousInstance.element.nextSibling
          );
        }
      }

      // Add to final instances
      operations.finalInstances[op.index] = instance;
    });

    // 4. Reorder if necessary (move elements to match data order)
    this._reorderDOM(operations.finalInstances);
  }

  /**
   * Reorder DOM elements to match data order
   */
  _reorderDOM(instances) {
    const anchor = this.loopConfig.anchor;
    let currentNode = anchor.nextSibling;

    instances.forEach(instance => {
      if (!instance || !instance.element) return;

      // If element is not in the right position, move it
      if (instance.element !== currentNode) {
        anchor.parentNode.insertBefore(instance.element, currentNode);
      }

      currentNode = instance.element.nextSibling;
    });
  }

  /**
   * Create a new loop instance (clone template, create bindings)
   */
  _createInstance(data, context) {
    // Clone the template
    const element = this.loopConfig.template.cloneNode(true);

    // Parse the cloned element
    const parser = new ReactiveHTMLParser();
    const parsed = parser.parse(element, [...this.parentContext, context]);

    // Create bindings for this instance
    const bindings = this._createInstanceBindings(parsed, context);

    // Create instance object
    const instance = {
      element,
      data,
      context,
      parsed,
      bindings,
      cleanup: () => {
        bindings.forEach(binding => binding.destroy());
      }
    };

    return instance;
  }

  /**
   * Create all bindings for a loop instance
   */
  _createInstanceBindings(parsedElement, itemContext) {
    const bindings = [];
    const contextStack = [...this.parentContext, itemContext];

    // Create bindings for this element
    parsedElement.bindings.forEach(attributeBinding => {
      const binding = BindingFactory.create(
        parsedElement.element,
        attributeBinding,
        contextStack
      );
      bindings.push(binding);
      bindingRegistry.register(parsedElement.element, binding);
    });

    // Recurse into children
    parsedElement.children.forEach(child => {
      const childBindings = this._createInstanceBindings(child, itemContext);
      bindings.push(...childBindings);
    });

    return bindings;
  }

  /**
   * Clean up this loop binding
   */
  destroy() {
    if (this.effect) {
      this.effect.stop();
      this.effect = null;
    }

    this.instances.forEach(instance => {
      instance.cleanup();
    });

    this.instances = [];
  }
}

/**
 * LoopBindingFactory - Creates LoopBinding from parsed metadata
 */
export class LoopBindingFactory {
  /**
   * Create a loop binding from parsed element
   *
   * @param {ParsedElement} parsedElement - Element with type='loop'
   * @param {Object} model - The reactive model
   * @param {Array} contextStack - Parent context
   * @returns {LoopBinding}
   */
  static create(parsedElement, model, contextStack) {
    if (parsedElement.type !== 'loop') {
      throw new Error('Can only create loop binding from loop element');
    }

    // Create context that includes the model
    const enhancedContext = [...contextStack, model];

    // Create loop binding
    const loopBinding = new LoopBinding(
      parsedElement.loopConfig,
      model,
      enhancedContext
    );

    return loopBinding;
  }
}
