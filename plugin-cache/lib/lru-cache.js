'use strict'

/**
 * Map-based LRU cache with lazy TTL expiry.
 * Uses insertion-order iteration for O(1) LRU tracking:
 *   - On access: delete + re-insert to move entry to the "most recent" tail
 *   - On evict: map.keys().next().value yields the oldest (head) key
 */
class LRUCache {
  constructor (maxItems) {
    this._max = maxItems
    this._map = new Map()
  }

  get size () {
    return this._map.size
  }

  /**
   * @param {string} key
   * @returns {{ body, statusCode, headers, etag, expiry } | undefined}
   */
  get (key) {
    if (!this._map.has(key)) return undefined
    const value = this._map.get(key)
    if (value.expiry !== undefined && Date.now() > value.expiry) {
      this._map.delete(key)
      return undefined
    }
    this._map.delete(key)
    this._map.set(key, value)
    return value
  }

  /**
   * @param {string} key
   * @param {{ body, statusCode, headers, etag, expiry }} value
   */
  set (key, value) {
    if (this._map.has(key)) {
      this._map.delete(key)
    } else if (this._map.size >= this._max) {
      this._map.delete(this._map.keys().next().value)
    }
    this._map.set(key, value)
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  delete (key) {
    return this._map.delete(key)
  }

  clear () {
    this._map.clear()
  }

  /**
   * Iterate over all entries (used by purgeByPrefix).
   * @returns {IterableIterator<[string, object]>}
   */
  entries () {
    return this._map.entries()
  }

  /**
   * Iterate over all keys.
   * @returns {IterableIterator<string>}
   */
  keys () {
    return this._map.keys()
  }
}

module.exports = LRUCache
