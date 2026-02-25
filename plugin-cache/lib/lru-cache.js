'use strict'

class LRUCache {
  constructor (maxItems = 1000) {
    this.maxItems = maxItems
    this.cache = new Map()
    this.hits = 0
    this.misses = 0
  }

  get (key) {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    this.cache.delete(key)
    this.cache.set(key, entry)
    this.hits++
    return entry
  }

  set (key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    if (this.cache.size >= this.maxItems) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, value)
  }

  has (key) {
    return this.cache.has(key)
  }

  delete (key) {
    return this.cache.delete(key)
  }

  clear () {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  stats () {
    return {
      items: this.cache.size,
      maxItems: this.maxItems,
      hits: this.hits,
      misses: this.misses
    }
  }

  entries () {
    return this.cache.entries()
  }
}

module.exports = LRUCache
