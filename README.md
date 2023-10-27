# resource-item

Provides configurable 'Item' class to wrap plain data object for data protection and sanitization. This is useful when you have a bunch of plain data objects and you don't want to write specific classes for each type, but you do want to protect and/or sanitize the data.

## Installation

```bash
npm i @liquid-labs/resource-item
```

## Usage

```javascript
import { Item } from '@liquid-labs/resource-item'

// declare your data-type specific class
const Person = class extends Item {} // you must sub-class Item and cannot create Item's directly

// configure the class you just declared
Item.bindCreationConfig({
  itemClass : Foo, // the class to configure
  itemName  : 'person', // how singular items should be named
  itemsName : 'people', // how multiple items shoud be named
  keyField  : 'email', // the key field
  allowSet  : ['nickname']
})

const person = new Person({ email: 'john@acme.com', givenName: 'John', nickname: 'Johnny Boy' })

// all Items have an ID
console.log(person.id) // john@acme.com
// you can access all data fields directly
console.log(person.givenName) // John
// you can set nickname because it's in tho 'allowSet' set
person.nickname = 'Johnny Johnny John John'
// the following, however, will raise an exeption becasue data is protected by default
person.email = 'johnathon@acme.com'
```

## Purpose and goals

The `Item` class is conceived of as the standard basis for a CRUD system dealing with multiple data types and user input data. The goals concrete of the of the `Item` class are:
1. Provide a simple way to quickly emulate custom data wrapper classes.
2. Protect the underlying data from change (default deny set operations and clone all object data in and out).
3. Provide a consistent 'id' field across all classes.
4. Provide a proxy layer to allow users to optionally inspect and intercept get/set operations.

## Reference

constructor/`new` `Item`s:\
`Item`s cannot be instantiated directly and must be sub-classed. Instantiating the subclass will result in the return of a `Proxy` object that wraps the underlying class. The proxy instance behaves just as the underlying class would in all cases except as noted in this documentation.

All 'get' operations:\
Can access properties defined directly on the object and also properties in the plain data object used to initialize the class. Propertise defined directly on the object will override/hide properties of the same name in the data object. Any 'object' values are cloned to protect the underlying data from inadvertent change.

All 'set' operations:\
Can only set properties directly defined on the object at instantiation or properties in the data object which have been configured writeble by `allowSet` in the [`Item.bindCreationConfig()`](#item-bindcreationconfig) configuration. You cannot add to or set properties on the underlying object that were not present at instaantiation. Object values are cloned so subsequent changes in the (now) external data will not affect the stored data.

<span id="item-bindcreationconfig">`Item.bindCreationConfig(config)`</span>:\
Takes a single object with the following fields:
- `itemClass`: _(req, Class)_ the class to bind the `itemConfig` configuration to
- `itemName`: _(req, string)_ how to refer to singular data items in user messages
- `itemsName`: _(req, string)_ how to refer to multiple data items in user messages
- `keyField:`: _(req, stirng)_ the name of the 'key field' in the data; if not 'id', an 'id' field will be created
- `dataCleaner` _(opt, function)_ a function to transforms data in preparation for display or export. E.g., to remove cached or ephemeral values. Signature: `(data)`
- `dataFlattener`: _(opt, function)_ a function to flatten nested data. E.g., when outputting data in a CSV (tabular) format. Signature: `(data)`
- `getWatchers`: _(opt, array of functions)_ an array of functions which are each executed at the proxy layer prior to returning from a get operation. Can be used to monitor access and also interrupt calls by raising an error. The function recieves a data object with fields: `data` (the underlying data objec), `target` (the target object), `property` (name or `Symbol` of the property to get), and `receiver` (either the proxy or an object that inherits from the proxy).
- `idNormalizer`: _(opt, function)_ a function taking a single argument—the unsatizide ID—and returns a "sanitized"/normalized ID. E.g., if we have a `keyField : 'email'` and we want all emails to be all lower case, then we would have `idNormizer : (email) => email.toLowerCase()`. Given email 'John@acme.com', then `item.email` would result in 'John@acme.com', but `item.id` would be 'john@acme.com'.
- `setWatchers`: _(opt, array of functions)_ an array of functions which are each executed at the proxy layer prior to updating data in a set operation. Can be used to monitor changes and also interrupt calls by raising an error. The function recieves a data object with fields: `data` (the underlying data objec), `target` (the target object), `property` (name or `Symbol` of the property to get), `value` (the new value), and `receiver` (either the proxy or an object that inherits from the proxy).
