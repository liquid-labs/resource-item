/**
* An extensible Proxy object which allows Proxys to play nice with classes. This opens up a world of possibilities that
* are compatible with classes. I.e., it is no longer necessary to create proxies for objects as a separate step:
* ```
* // the old way
* const Foo = class { ... }
* const foo = new Foo()
* const fooProxy = new Proxy(foo)
* // with Item
* const Bar = class extends Item { ... }
* const bar = new Bar() // and you're done! Bar is a proxy which also behaves (mostly) like a regular class.
* ```
*
* By default, Item ensures that incoming and outgoing data is safely copied. E.g.:
* ```
* const Foo = class extends Item { field }
* const data = { a: 1 }
* const foo = new Foo()
* foo.a = data
* data.a = 2
* console.log(`${data.a} - ${foo.a}`) // prints: '2 - 1'
* ```
*
* Attempts to set a value for an existing property will fail. Attempts to create
*
* ## Implementation notes
*
* - If we just wrap and return the 'this' in the Item constructor, it will not find any sub-class functions. It would
*   be good to understand exactly why that is
*
* ## Next steps
*
* - Support configuration allowing support for non-copied incoming and/or outgoing data on a field by field basis.
* - Support configuration allowing custom transformation of incoming and/or outgoing data on a field by field basis.
*
* ## Known issues
*
* - `object.bar = new Function(...)` may mean "remember this function", but is treated as "callable function"; need to
*   implement configuration to avoid. The current workaround is to define a getter and/or setter for such a field,
*   which will force it to be treated like a field property rather than a function property.
*
* ## Credits
*
* The basic Proxy technique came from [this post](https://stackoverflow.com/a/40714458/929494) by
* [John L.](https://stackoverflow.com/users/2437716/john-l). I'm blown away this technique isn't more widely cited.
*/

/**
* Index to map proxies to underlying objects. We use a weak map so that once the proxy goes out of scope, the
* underlying object can also be garbage collected.
*/
const thisMapper = new WeakMap()

// TODO: more robust to build from 'Object.prototype'?
const SKIP_METHODS = ['constructor', '__defineGetter__', '__defineSetter__', 'hasOwnProperty', '__lookupGetter__', '__lookupSetter__', '__proto__', 'isPrototypeOf']

const indexAllProperties = (obj) => {
  const propIndex = {}
  const methodIndex = {}

  // the while loop walks up our prototype ancestry
  while (obj/* && obj !== Object.prototype <- any use for hiding? */) {
    const propDescriptors = Object.getOwnPropertyDescriptors(obj)
    // eslint-disable-next-line guard-for-in
    for (const propKey in propDescriptors) {
      const descriptor = propDescriptors[propKey]
      const propValue = descriptor.value
      const isFunction = !!(propValue && (typeof propValue === 'function'))
      const getter = descriptor.get
      const hasGetter = !!getter
      const setter = descriptor.set
      const hasSetter = !!setter
      const isField = hasGetter || hasSetter
      // probably not necessary, but to keep from confusion we don't override the Proxy functions
      if (!isField && propValue && obj !== Object && isFunction && !SKIP_METHODS.includes(propKey)) {
        methodIndex[propKey] = descriptor/* {
          func: propValue,
          descriptor:
        } */
      }
      else if (isField) {
        propIndex[propKey] = Object.assign({
          getter,
          hasGetter,
          setter,
          hasSetter
        }, descriptor)
      }
    }
    obj = Object.getPrototypeOf(obj)
  }

  return [propIndex, methodIndex]
}

const handler = ({ allowSet, data, propIndex, methodIndex }) => ({
  get : (object, key, receiver) => {
    if (key === 'isProxy') return true
    // object method calls go through the get handler first to retrieve the function itself
    // TODO: the 'private' thing is a workaround for a Babel bug (?) that messes up private calls **I wonder if the
    // new catalyst-scripts-node-project fixes this? Since we don't bother to target ancient platforms
    else if (methodIndex[key] || propIndex[key] || key.match?.(/private/)) {
      try { // TODO: see note on catch below
        return receiver
          ? Reflect.get(object, key, receiver)
          : Reflect.get(object, key)
      }
      catch (e) {
        // So, it's not clear to me what's happening. We seem to be able to access private fields in the first instance,
        // but at some point in the function chain, it breaks down. But, the workaround is pretty simple, we just go to
        // the underlying object directly.
        if (e instanceof TypeError) { // assume private field access error
          /* Needs further testing, but I believe trying to use the reciever was causing 'TypeErrors'.
          return receiver
            ? Reflect.get(thisMapper[object].deref(), key, receiver)
            : Reflect.get(thisMapper[object].deref(), key) */
          return Reflect.get(thisMapper[object], key)
        }
        else {
          throw e
        }
      }
    }
    else {
      const value = data[key]
      return value && typeof value === 'object'
        ? structuredClone(value)
        : value
    }
  },
  set : (object, key, value) => {
    // propIndex of object (not data) are allowed to be set
    if (propIndex[key] || key.match(/private/)) {
      object[key] = value
      return true
    }
    else if (allowSet && allowSet.indexOf(key) !== -1) {
      const setValue = value && typeof value === 'object'
        ? structuredClone(value)
        : value
      return Reflect.set(data, key, setValue)
    }
    /* TODO: suppport 'setXXX' style?
    else if (methodIndex[`set${key.ucfirst()`]) {
      object[key] = value
    } */
    else throw new Error(`Setting '${key}' is not supported.`)
  },
  ownKeys : (target) => {
    return Reflect.ownKeys(target).concat(Reflect.ownKeys(data))
  },
  has : (target, key) => {
    return (key in target) || (key in data)
  },
  getOwnPropertyDescriptor : (target, key) => {
    // TODO: really, theh property as percieved by the user is not configurable; but if we set that false, the proxy complains that it doesn't match the underlying data property...
    return Object.getOwnPropertyDescriptor(target, key)
      || Object.getOwnPropertyDescriptor(data, key)
      // TODO: we want to do something like below, because it's not true that the data keys are writable, in general, but '@fast-csv/format' was running into errors
      // || Object.assign(Object.getOwnPropertyDescriptor(data, key), { writable : false, configurable : true })
  }
})

const defaultIdNormalizer = (id) => typeof id === 'string' ? id.toLowerCase() : id

const Item = class {
  #data
  #self

  constructor(data) {
    if (Object.getPrototypeOf(this) === Item.prototype) {
      throw new Error("'Item's cannot be created directly. You must create a sub-class and configure it via 'Item.bindCreationConfig'.")
    }

    if (this.keyField === undefined) {
      throw new Error('Key field must be specified. '
        + "Note, 'Item' is not typically created directly. Create a subclass or specify 'options.keyField' directly.")
    }
    this.#data = data

    if (!data[this.keyField]) {
      throw new Error(`Key field '${this.keyField}' value '${data[this.keyField]}' is non-truthy!`)
    }

    if (data.id === undefined) {
      data.id = this.idNormalizer(data[this.keyField])
    }

    const [propIndex, methodIndex] = indexAllProperties(this)
    const proxy = new Proxy(this, handler({
      data     : this.#data,
      propIndex,
      methodIndex,
      allowSet : this.allowSet
    }))

    // since we return the proxy, we save the real underlying object internally
    thisMapper[proxy] = new WeakRef(this)

    return proxy // Note, this overrides the default + implicit 'return this'
  } // end constructor

  // get id() { return this.#data.id || this.#idNormalizer(this.#data[this.#keyField]) }

  get allowSet() { return structuredClone(this.constructor.itemConfig.allowSet) }

  get data() { return structuredClone(this.#data) }

  get dataCleaned() {
    const data = this.data
    return this.dataCleaner ? this.dataCleaner(data) : data
  }

  // item config convenience accessors
  get dataCleaner() { return this.constructor.itemConfig.dataCleaner }

  get dataFlattener() { return this.constructor.itemConfig.dataFlattener }

  /**
  * Used to transform incoming ID into a standard format. Must be a function that takes a single argument of the raw ID
  * and returns a normalized ID. The default normalizer expects a string and will lowercase it.
  */
  get idNormalizer() { return this.constructor.itemConfig.idNormalizer }

  get itemClass() { return this.constructor.itemConfig.itemClass }

  get itemName() { return this.constructor.itemConfig.itemName }

  /**
  * Our 'keyField'. We will always annotate incoming objcts with 'id', but the ItemManager may use another field for
  * it's canonical ID.
  */
  get keyField() { return this.constructor.itemConfig.keyField }

  get itemsName() { return this.constructor.itemConfig.itemsName }
}

const requiredItemConfig = ['itemClass', 'itemName', 'keyField', 'itemsName']
/**
* Creates a frozen 'itemConfig' and immutably binds it to the Item sub-class.
*
* #### Parameters
*
* - `itemClass`: The class used to create new items. This is also where the class `itemConfig' is bound.
* - `itemName`: The name by which to refer items.
* - `keyField`: The key field used as or to generate an ID.
* - `itemsName`: The name by which to refer to the multple items.
* - `dataFlattener`: (opt) A function which flattens nested data. E.g., when outputting data in a CSV (tabular) format.
* - `dataCleaner`: (opt) A function which removes or otherwise transforms data in preparation for display or export.
*      E.g., to remove cached or ephemeral values.
* - `idNormalizer`: (opt) A function used to normalize the key field when creating implied IDs. Will default to the
*     `defaultIdNormalizer` if not specified.
*/
Item.bindCreationConfig = (itemConfig = {}) => { // TODO: just take itemConfig as part of the constructor
  // verify required items
  const missingFields = []
  for (const requiredConfig of requiredItemConfig) {
    if (itemConfig[requiredConfig] === undefined) {
      missingFields.push(requiredConfig)
    }
  }
  if (missingFields.length > 0) {
    throw new Error(`Error creating Item configuration; missing required field(s): '${missingFields.join("', '")}'; got: ${JSON.stringify(itemConfig, null, '  ')}}`)
  }

  if (itemConfig.idNormalizer === undefined) {
    itemConfig.idNormalizer = defaultIdNormalizer
  }
  // lock it down
  Object.freeze(itemConfig)
  // bind it to the item class
  Object.defineProperty(itemConfig.itemClass, 'itemConfig', {
    value        : itemConfig,
    writable     : false,
    enumerable   : true,
    configurable : false
  })

  return itemConfig
}

export { Item }
