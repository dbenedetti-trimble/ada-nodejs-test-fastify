'use strict'

class LRUCache {
  #map = new Map()
  #maxItems

  constructor (maxItems) {
    this.#maxItems = maxItems
  }

  get (key) {
    // TODO(features): implement LRU get with TTL expiry check and MRU promotion
    // - if key not in map, return undefined
    // - if entry.expiry > 0 and Date.now() > entry.expiry, delete and return undefined
    // - delete + re-insert to move to MRU position
    // - return entry
    throw new Error('not implemented')
  }

  set (key, value) {
    // TODO(features): implement LRU set with eviction
    // - if key already exists, delete it first
    // - else if size >= maxItems, evict LRU (map.keys().next().value)
    // - insert new entry at end
    throw new Error('not implemented')
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
