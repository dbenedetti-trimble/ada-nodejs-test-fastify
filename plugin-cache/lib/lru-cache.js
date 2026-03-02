'use strict'

class LRUCache {
  constructor (maxItems) {
    this.maxItems = maxItems
    this.map = new Map()
    this.hits = 0
    this.misses = 0
  }

  get (key) {
    const entry = this.map.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }

    if (entry.expiry <= Date.now()) {
      this.map.delete(key)
      this.misses++
      return undefined
    }

    // Move to most-recent position
    this.map.delete(key)
    this.map.set(key, entry)
    this.hits++
    return entry
  }

  set (key, value) {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxItems) {
      const lruKey = this.map.keys().next().value
      this.map.delete(lruKey)
    }
    this.map.set(key, value)
  }

  purge (key) {
    return this.map.delete(key)
  }

  purgeByPrefix (urlPrefix) {
    let count = 0
    for (const key of [...this.map.keys()]) {
      const pipeIdx = key.indexOf('|')
      if (pipeIdx === -1) continue
      const rest = key.slice(pipeIdx + 1)
      const secondPipe = rest.indexOf('|')
      const url = secondPipe === -1 ? rest : rest.slice(0, secondPipe)
      if (url.startsWith(urlPrefix)) {
        this.map.delete(key)
        count++
      }
    }
    return count
  }

  clear () {
    this.map.clear()
    this.hits = 0
    this.misses = 0
  }

  get size () {
    return this.map.size
  }
}

module.exports = LRUCache
