'use strict'

class LRUCache {
  constructor (maxItems) {
    if (typeof maxItems !== 'number' || maxItems < 1 || !Number.isInteger(maxItems)) {
      throw new TypeError('maxItems must be a positive integer')
    }
    this._map = new Map()
    this._maxItems = maxItems
  }

  get (key) {
    const entry = this._map.get(key)
    if (!entry) return undefined
    if (entry.expiry <= Date.now()) {
      this._map.delete(key)
      return undefined
    }
    this._map.delete(key)
    this._map.set(key, entry)
    return entry
  }

  set (key, entry) {
    if (this._map.has(key)) {
      this._map.delete(key)
    } else if (this._map.size >= this._maxItems) {
      const oldest = this._map.keys().next().value
      this._map.delete(oldest)
    }
    this._map.set(key, entry)
  }

  delete (key) {
    return this._map.delete(key)
  }

  clear () {
    this._map.clear()
  }

  get size () {
    return this._map.size
  }

  keys () {
    return this._map.keys()
  }

  entries () {
    return this._map.entries()
  }
}

module.exports = LRUCache
