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
    // TODO: implement in features pass
    // 1. Check if key exists
    // 2. Check expiry; delete and return undefined if expired
    // 3. Move to tail (delete + re-insert)
    // 4. Return value
    return undefined
  }

  /**
   * @param {string} key
   * @param {{ body, statusCode, headers, etag, expiry }} value
   */
  set (key, value) {
    // TODO: implement in features pass
    // 1. If key already exists, delete it (re-insert at tail)
    // 2. If at capacity, evict head (oldest)
    // 3. Insert key → value
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
