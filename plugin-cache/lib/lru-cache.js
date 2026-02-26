'use strict'

class LRUCache {
  constructor (maxItems) {
    this.maxItems = maxItems
    this._map = new Map()
  }

  get (key) {
    const entry = this._map.get(key)
    if (!entry) return null
    if (Date.now() >= entry.expiry) {
      this._map.delete(key)
      return null
    }
    this._map.delete(key)
    this._map.set(key, entry)
    return entry
  }

  set (key, value) {
    if (this._map.has(key)) {
      this._map.delete(key)
    } else if (this._map.size >= this.maxItems) {
      this._map.delete(this._map.keys().next().value)
    }
    this._map.set(key, value)
  }

  delete (key) {
    return this._map.delete(key)
  }

  keys () {
    return this._map.keys()
  }

  get size () {
    return this._map.size
  }
}

module.exports = LRUCache
