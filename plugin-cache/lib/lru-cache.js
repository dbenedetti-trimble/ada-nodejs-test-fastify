'use strict'

class LRUCache {
  #map = new Map()
  #maxItems

  constructor (maxItems) {
    this.#maxItems = maxItems
  }

  get (key) {
    if (!this.#map.has(key)) return undefined
    const entry = this.#map.get(key)
    if (entry.expiry > 0 && Date.now() > entry.expiry) {
      this.#map.delete(key)
      return undefined
    }
    this.#map.delete(key)
    this.#map.set(key, entry)
    return entry
  }

  set (key, value) {
    if (this.#map.has(key)) {
      this.#map.delete(key)
    } else if (this.#map.size >= this.#maxItems) {
      this.#map.delete(this.#map.keys().next().value)
    }
    this.#map.set(key, value)
  }

  delete (key) {
    return this.#map.delete(key)
  }

  keys () {
    return this.#map.keys()
  }

  clear () {
    this.#map.clear()
  }

  get size () {
    return this.#map.size
  }

  get maxItems () {
    return this.#maxItems
  }
}

module.exports = LRUCache
