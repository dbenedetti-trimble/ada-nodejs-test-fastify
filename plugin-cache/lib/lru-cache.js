'use strict'

class LRUCache {
  constructor (maxItems) {
    this._maxItems = maxItems
    this._map = new Map()
    this._hits = 0
    this._misses = 0
  }

  get (key) {
    if (!this._map.has(key)) {
      this._misses++
      return undefined
    }
    const entry = this._map.get(key)
    if (Date.now() > entry.expiry) {
      this._map.delete(key)
      this._misses++
      return undefined
    }
    // Move to end (most recently used)
    this._map.delete(key)
    this._map.set(key, entry)
    this._hits++
    return entry
  }

  set (key, value) {
    if (this._map.has(key)) {
      this._map.delete(key)
    } else if (this._map.size >= this._maxItems) {
      // Evict LRU (first key in insertion order)
      const lruKey = this._map.keys().next().value
      this._map.delete(lruKey)
    }
    this._map.set(key, value)
  }

  delete (key) {
    return this._map.delete(key)
  }

  clear () {
    this._map.clear()
    this._hits = 0
    this._misses = 0
  }

  keys () {
    return this._map.keys()
  }

  get size () {
    return this._map.size
  }

  get hits () {
    return this._hits
  }

  get misses () {
    return this._misses
  }
}

module.exports = LRUCache
