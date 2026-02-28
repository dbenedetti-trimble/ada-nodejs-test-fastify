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
    // TODO: implement — check map, move to MRU, return entry or undefined
  }

  /**
   * Store an entry. Evicts LRU entry if at capacity.
   * @param {string} key
   * @param {object} value - { body, statusCode, headers, etag, expiry }
   */
  set (key, value) {
    // TODO: implement — evict LRU if needed, insert at MRU position
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
