/**
 * ConditionalBinding - Manages :if/:else-if/:else branches
 *
 * Responsibilities:
 * - Evaluate branch conditions in order
 * - Show first truthy branch (or hide all)
 * - Lazy parse branches (only when first shown)
 * - Use comment anchor (preserve DOM position)
 * - Clean up when element removed
 *
 * Key difference from loops:
 * - Loops: many instances, all visible
 * - Conditionals: one branch, conditionally visible
 *
 * Algorithm:
 * 1. Evaluate conditions top to bottom
 * 2. Stop at first true condition
 * 3. Show that branch (parse if needed)
 * 4. Hide current branch if different
 * 5. If no conditions true, hide all
 */
class ConditionalBinding {
    constructor(conditionalConfig, model, contextStack) {
      this.conditionalConfig = conditionalConfig;
      this.model = model;
      this.contextStack = contextStack;
      this.effect = null;
  
      // Create effect to watch all conditions
      this._createEffect();
    }
  
    /**
     * Create an effect that evaluates conditions and shows appropriate branch
     */
    _createEffect() {
      this.effect = EffectTracker.create(() => {
        // Evaluate each branch condition in order
        for (let i = 0; i < this.conditionalConfig.branches.length; i++) {
          const branch = this.conditionalConfig.branches[i];
  
          // Evaluate condition
          const condition = this._evaluateCondition(branch.expression);
  
          // If true, show this branch and stop
          if (condition) {
            this._showBranch(i);
            return;
          }
        }
  
        // No condition was true - hide all
        this._hideAll();
      });
    }
  
    /**
     * Evaluate a branch condition
     */
    _evaluateCondition(expression) {
      try {
        return ExpressionEvaluator.evaluate(expression, this.contextStack);
      } catch (error) {
        console.warn(`Error evaluating condition: "${expression}"`, error);
        return false;
      }
    }
  
    /**
     * Show a specific branch
     */
    _showBranch(branchIndex) {
      const config = this.conditionalConfig;
  
      if (config.activeBranch === branchIndex) {
        return;
      }
  
      // Clean up current branch
      if (config.activeElement) {
        config.activeElement.remove();
  
        const oldBranch = config.branches[config.activeBranch];
        if (oldBranch && oldBranch.bindings) {
          oldBranch.bindings.forEach(binding => binding.destroy());
          oldBranch.bindings = [];
        }
  
        config.activeElement = null;
      }
  
      const branch = config.branches[branchIndex];
  
      // Clone from template fresh each time!
      branch.element = branch.template.cloneNode(true);
  
      // Parse and bind the fresh clone
      this._parseBranch(branch);
  
      // Insert into DOM
      config.anchor.parentNode.insertBefore(
        branch.element,
        config.anchor.nextSibling
      );
  
      config.activeElement = branch.element;
      config.activeBranch = branchIndex;
    }
  
    /**
     * Hide all branches
     */
    _hideAll() {
      const config = this.conditionalConfig;
  
      if (config.activeElement) {
        config.activeElement.remove();
        config.activeElement = null;
        config.activeBranch = null;
      }
    }
  
    /**
     * Parse a branch (lazy - only done once per branch)
     */
    _parseBranch(branch) {
      // Clean up existing bindings if any
      if (branch.bindings && branch.bindings.length > 0) {
        branch.bindings.forEach(binding => binding.destroy());
        branch.bindings = [];
      }
  
      // Re-parse the branch element
      const parser = new ReactiveHTMLParser();
      branch.parsed = parser.parse(branch.element, this.contextStack);
  
      // Create fresh bindings
      branch.bindings = [];
      this._createBranchBindings(branch.parsed, branch.bindings);
    }
  
    /**
     * Create bindings for a branch
     */
    _createBranchBindings(parsedElement, bindingsArray) {
      // Handle loops within conditional branches
      if (parsedElement.type === 'loop') {
        const loopBinding = LoopBindingFactory.create(
          parsedElement,
          this.model,
          this.contextStack
        );
        bindingsArray.push(loopBinding);
        bindingRegistry.register(parsedElement.loopConfig.anchor, loopBinding);
        return;
      }
  
      // Handle nested conditionals
      if (parsedElement.type === 'conditional') {
        const nestedConditional = ConditionalBindingFactory.create(
          parsedElement,
          this.model,
          this.contextStack
        );
        bindingsArray.push(nestedConditional);
        bindingRegistry.register(parsedElement.conditionalConfig.anchor, nestedConditional);
        return;
      }
  
      // Create regular bindings
      parsedElement.bindings.forEach(attributeBinding => {
        const binding = BindingFactory.create(
          parsedElement.element,
          attributeBinding,
          this.contextStack
        );
        bindingsArray.push(binding);
        bindingRegistry.register(parsedElement.element, binding);
      });
  
      // Recurse into children
      parsedElement.children.forEach(child => {
        this._createBranchBindings(child, bindingsArray);
      });
    }
  
    /**
     * Clean up this conditional binding
     */
    destroy() {
      if (this.effect) {
        this.effect.stop();
        this.effect = null;
      }
  
      // Clean up all parsed branches
      this.conditionalConfig.branches.forEach(branch => {
        if (branch.bindings) {
          branch.bindings.forEach(binding => binding.destroy());
        }
      });
  
      this._hideAll();
    }
  }
  
  /**
   * ConditionalBindingFactory - Creates ConditionalBinding from parsed metadata
   */
  class ConditionalBindingFactory {
    /**
     * Create a conditional binding from parsed element
     *
     * @param {ParsedElement} parsedElement - Element with type='conditional'
     * @param {Object} model - The reactive model
     * @param {Array} contextStack - Parent context
     * @returns {ConditionalBinding}
     */
    static create(parsedElement, model, contextStack) {
      if (parsedElement.type !== 'conditional') {
        throw new Error('Can only create conditional binding from conditional element');
      }
  
      return new ConditionalBinding(
        parsedElement.conditionalConfig,
        model,
        contextStack
      );
    }
  }

  export {ConditionalBinding, ConditionalBindingFactory};