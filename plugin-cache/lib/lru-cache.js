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

  get size () {
    return this.#map.size
  }

  clear () {
    this.#map.clear()
  }
}

module.exports = LRUCache
