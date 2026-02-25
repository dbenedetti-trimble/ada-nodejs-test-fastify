'use strict'

class LRUCache {
  constructor (maxItems) {
    this.maxItems = maxItems
    this.map = new Map()
  }

  get (key) {
    const entry = this.map.get(key)
    if (entry === undefined) {
      return undefined
    }

    if (entry.expiry !== 0 && Date.now() > entry.expiry) {
      this.map.delete(key)
      return undefined
    }

    // Move to most-recent position
    this.map.delete(key)
    this.map.set(key, entry)
    return entry
  }

  set (key, value) {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxItems) {
      const oldestKey = this.map.keys().next().value
      this.map.delete(oldestKey)
    }
    this.map.set(key, value)
  }

  delete (key) {
    return this.map.delete(key)
  }

  clear () {
    this.map.clear()
  }

  get size () {
    return this.map.size
  }

  keys () {
    return this.map.keys()
  }
}

module.exports = LRUCache
