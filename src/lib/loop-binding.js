import { EffectTracker } from "./effect";

class LoopConfig {
    constructor(element, eachAttr) {
      const parsed = this._parseEachExpression(eachAttr);
  
      this.itemVar = parsed.itemVar;
      this.indexVar = parsed.indexVar;
      this.source = parsed.source;
      this.keyExpression = this._extractKey(element);
  
      this.template = element.cloneNode(true);
      this.template.removeAttribute(':each');
      this.template.removeAttribute(':key');
  
      this.anchor = document.createComment(`each: ${this.itemVar} in ${this.source}`);
      element.replaceWith(this.anchor);
  
      this.instances = [];
    }
  
    _parseEachExpression(expr) {
      const patterns = [
        /^\((\w+)\s*,\s*(\w+)\)\s+in\s+([\w.]+)$/,
        /^(\w+)\s*,\s*(\w+)\s+in\s+([\w.]+)$/,
        /^(\w+)\s+in\s+([\w.]+)$/
      ];
  
      for (const pattern of patterns) {
        const match = expr.match(pattern);
        if (match) {
          return {
            itemVar: match[1],
            indexVar: match[2] || null,
            source: match[match.length - 1]
          };
        }
      }
  
      throw new Error(`Invalid :each syntax: "${expr}"`);
    }
  
    _extractKey(element) {
      const keyAttr = element.getAttribute(':key');
      return keyAttr || '$index';
    }
  }

class LoopBinding {
    constructor(loopConfig, model, contextStack) {
      this.loopConfig = loopConfig;
      this.model = model;
      this.parentContext = contextStack;
      this.instances = [];
      this.effect = null;
      this._createEffect();
    }
  
    _createEffect() {
      this.effect = EffectTracker.create(() => {
        const sourceArray = this._getSourceArray();
  
        if (!Array.isArray(sourceArray)) {
          console.warn(`Loop source is not an array: ${this.loopConfig.source}`);
          return;
        }
  
        this._reconcile(sourceArray);
      });
    }
  
    _getSourceArray() {
      console.log('📍 _getSourceArray called');
      console.log('   EffectTracker.current:', EffectTracker.current ? 'YES (inside effect)' : 'NO (outside effect)');
  
      const expr = this.loopConfig.source;
  
      console.log('   Evaluating expression:', expr);
      const array = ExpressionEvaluator.evaluate(expr, this.parentContext);
      console.log('   Got array, length:', array ? array.length : 'null');
  
      if (array && typeof array.__version !== 'undefined') {
        console.log('   Accessing array.__version');
        array.__version;
      }
  
      return array;
    }
  
    _reconcile(newData) {
      const oldByKey = this._buildKeyMap(this.instances);
      const newByKey = this._buildDataKeyMap(newData);
      const operations = this._planOperations(oldByKey, newByKey, newData);
      this._applyOperations(operations);
      this.instances = operations.finalInstances;
    }
  
    _buildKeyMap(instances) {
      const map = new Map();
      instances.forEach((instance, index) => {
        const key = this._computeKey(instance.data, instance.context);
        map.set(key, {instance, index});
      });
      return map;
    }
  
    _buildDataKeyMap(dataArray) {
      const map = new Map();
      dataArray.forEach((data, index) => {
        const context = this._createItemContext(data, index);
        const key = this._computeKey(data, context);
        map.set(key, {data, index, context});
      });
      return map;
    }
  
    _computeKey(data, context) {
      if (this.loopConfig.keyExpression === '$index') {
        return context.$index;
      }
  
      try {
        return ExpressionEvaluator.evaluate(this.loopConfig.keyExpression, [context]);
      } catch (error) {
        console.warn('Error computing key:', error);
        return context.$index;
      }
    }
  
    _createItemContext(data, index) {
      const context = {
        [this.loopConfig.itemVar]: data,
        $index: index,
        $parent: this.parentContext[this.parentContext.length - 1] || {}
      };
  
      if (this.loopConfig.indexVar) {
        context[this.loopConfig.indexVar] = index;
      }
  
      return context;
    }
  
    _planOperations(oldByKey, newByKey, newData) {
      const toRemove = [];
      const toUpdate = [];
      const toAdd = [];
  
      oldByKey.forEach((oldItem, key) => {
        if (newByKey.has(key)) {
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
          toRemove.push(oldItem.instance);
        }
      });
  
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
  
      const finalInstances = newData.map((data, index) => {
        const context = this._createItemContext(data, index);
        const key = this._computeKey(data, context);
  
        if (oldByKey.has(key)) {
          const instance = oldByKey.get(key).instance;
          instance.data = data;
          instance.context = context;
          return instance;
        }
  
        return null;
      });
  
      return {toRemove, toUpdate, toAdd, finalInstances};
    }
  
    _applyOperations(operations) {
      operations.toRemove.forEach(instance => {
        instance.element.remove();
        instance.cleanup();
      });
  
      operations.toUpdate.forEach(op => {
        Object.assign(op.instance.context, op.newContext);
      });
  
      operations.toAdd.forEach(op => {
        const instance = this._createInstance(op.data, op.context);
  
        const targetIndex = op.index;
        const anchor = this.loopConfig.anchor;
  
        if (targetIndex === 0) {
          anchor.parentNode.insertBefore(instance.element, anchor.nextSibling);
        } else {
          const previousInstance = operations.finalInstances[targetIndex - 1];
          if (previousInstance && previousInstance.element) {
            previousInstance.element.parentNode.insertBefore(
              instance.element,
              previousInstance.element.nextSibling
            );
          }
        }
  
        operations.finalInstances[op.index] = instance;
      });
  
      this._reorderDOM(operations.finalInstances);
    }
  
    _reorderDOM(instances) {
      const anchor = this.loopConfig.anchor;
      let currentNode = anchor.nextSibling;
  
      instances.forEach(instance => {
        if (!instance || !instance.element) return;
  
        if (instance.element !== currentNode) {
          anchor.parentNode.insertBefore(instance.element, currentNode);
        }
  
        currentNode = instance.element.nextSibling;
      });
    }
  
    _createInstance(data, context) {
      const element = this.loopConfig.template.cloneNode(true);
      const parser = new ReactiveHTMLParser();
      const parsed = parser.parse(element, [...this.parentContext, context]);
      const bindings = this._createInstanceBindings(parsed, context);
  
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
  
    _createInstanceBindings(parsedElement, itemContext) {
      const bindings = [];
      const contextStack = [...this.parentContext, itemContext];
  
      parsedElement.bindings.forEach(attributeBinding => {
        const binding = BindingFactory.create(parsedElement.element, attributeBinding, contextStack);
        bindings.push(binding);
        bindingRegistry.register(parsedElement.element, binding);
      });
  
      parsedElement.children.forEach(child => {
        const childBindings = this._createInstanceBindings(child, itemContext);
        bindings.push(...childBindings);
      });
  
      return bindings;
    }
  
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

  export {LoopBinding, LoopConfig};