'use strict'

class LRUCache {
  #map = new Map()
  #maxItems

  constructor (maxItems) {
    this.#maxItems = maxItems
  }

  /**
   * Retrieve an entry by key.
   * Moves the entry to MRU position on access.
   * Returns undefined if not found.
   * @param {string} key
   * @returns {object|undefined}
   */
  get (key) {
    if (!this.#map.has(key)) return undefined
    const value = this.#map.get(key)
    this.#map.delete(key)
    this.#map.set(key, value)
    return value
  }

  /**
   * Store an entry. Evicts LRU entry if at capacity.
   * @param {string} key
   * @param {object} value - { body, statusCode, headers, etag, expiry }
   */
  set (key, value) {
    if (this.#map.has(key)) {
      this.#map.delete(key)
    } else if (this.#map.size >= this.#maxItems) {
      this.#map.delete(this.#map.keys().next().value)
    }
    this.#map.set(key, value)
  }

  /**
   * Delete an entry by key.
   * @param {string} key
   * @returns {boolean} true if the key existed
   */
  delete (key) {
    return this.#map.delete(key)
  }

  /**
   * Return an iterator over all keys (insertion order = LRU to MRU).
   * @returns {IterableIterator<string>}
   */
  keys () {
    return this.#map.keys()
  }

  /**
   * Remove all entries from the cache.
   */
  clear () {
    this.#map.clear()
  }

  /** @type {number} */
  get size () {
    return this.#map.size
  }

  /** @type {number} */
  get maxItems () {
    return this.#maxItems
  }
}

module.exports = LRUCache
