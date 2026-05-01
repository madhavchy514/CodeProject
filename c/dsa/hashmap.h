#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define HASHMAP_INITIAL_CAPACITY 16

typedef struct {
  void* key;
  void* value;
  size_t ksize;
  size_t vsize;
  bool deleted;
} hashmap_node_t;

typedef struct {
  hashmap_node_t** bucket;
  size_t size;
  size_t cap;
} hashmap_t;

static inline bool _hashmap_fit_mul(size_t a, size_t b) {
  if (a == 0 || b == 0) return true;
  return a <= SIZE_MAX / b;
}

static inline size_t _hashmap_hash(const void* key, size_t ksize, size_t cap) {
  if (cap == 0 || !key || ksize == 0) return 0;

  const uint8_t* data = (const uint8_t*)key;
  uint64_t hash = 14695981039346656037ULL;

  for (size_t i = 0; i < ksize; i++) {
    hash = hash ^ data[i];
    hash = hash * 1099511628211ULL;
  }

  return (size_t)(hash % cap);
}

static inline hashmap_node_t* _hashmap_node_create(const void* key, const void* value, size_t ksize, size_t vsize) {
  if (!key || !value || ksize == 0 || vsize == 0) return NULL;

  hashmap_node_t* node = (hashmap_node_t*)malloc(sizeof(hashmap_node_t));
  if (!node) return NULL;

  node->key = (void*)malloc(ksize);
  if (!node->key) {
    free(node);
    return NULL;
  }

  node->value = (void*)malloc(vsize);
  if (!node->value) {
    free(node->key);
    free(node);
    return NULL;
  }

  memcpy(node->key, key, ksize);
  memcpy(node->value, value, vsize);

  node->ksize = ksize;
  node->vsize = vsize;
  node->deleted = false;
  return node;
}

static inline void _hashmap_node_free(hashmap_node_t* node) {
  if (!node) return;
  free(node->key);
  free(node->value);
  free(node);
}

/** @returns [hashmap_t: success] [NULL: error] */
static inline hashmap_t* hashmap_create(size_t cap) {
  if (!_hashmap_fit_mul(cap, sizeof(hashmap_node_t*))) return NULL;

  hashmap_t* map = (hashmap_t*)malloc(sizeof(hashmap_t));
  if (!map) return NULL;

  if (cap == 0) {
    map->bucket = NULL;
  } else {
    map->bucket = (hashmap_node_t**)calloc(cap, sizeof(hashmap_node_t*));
    if (!map->bucket) {
      free(map);
      return NULL;
    }
  }

  map->cap = cap;
  map->size = 0;
  return map;
}

static inline void hashmap_free(hashmap_t* map) {
  if (!map) return;
  for (size_t i = 0; i < map->cap; i++) _hashmap_node_free(map->bucket[i]);
  free(map->bucket);
  free(map);
}

static inline bool hashmap_reserve(hashmap_t* map, size_t cap) {
  if (!map || cap < map->size || !_hashmap_fit_mul(cap, sizeof(hashmap_node_t*))) return false;

  if (cap == 0) {
    free(map->bucket);
    map->bucket = NULL;
    map->cap = 0;
    return true;
  }

  hashmap_node_t** nb = (hashmap_node_t**)calloc(cap, sizeof(hashmap_node_t*));
  if (!nb) return false;

  if (map->bucket) for (size_t i = 0; i < map->cap; i++) {
    hashmap_node_t* node = map->bucket[i];
    if (!node) continue;
    if (node->deleted) {
      _hashmap_node_free(node);
      continue;
    } else {
      size_t index = _hashmap_hash(node->key, node->ksize, cap);
      while (nb[index]) index = (index + 1) % cap;
      nb[index] = node;
    }
  }

  free(map->bucket);
  map->bucket = nb;
  map->cap = cap;
  return true;
}

static inline bool hashmap_grow(hashmap_t* map) {
  if (!map || !_hashmap_fit_mul(map->cap, 2)) return false;
  size_t i_cap = HASHMAP_INITIAL_CAPACITY;
  size_t n_cap = map->cap < i_cap ? i_cap : map->cap * 2;
  return hashmap_reserve(map, n_cap);
}

/** @returns [-1: error] [0: updated] [1: inserted] */
static inline int hashmap_insert(hashmap_t* map, const void* key, const void* value, size_t ksize, size_t vsize) {
  if (!map || !_hashmap_fit_mul(map->cap, 3) || !key || !value || ksize == 0 || vsize == 0) return -1;
  if ((map->cap == 0 || map->size >= (map->cap * 3) / 4) && !hashmap_grow(map)) return -1;

  hashmap_node_t* node = _hashmap_node_create(key, value, ksize, vsize);
  if (!node) return -1;

  size_t index = _hashmap_hash(key, ksize, map->cap);
  size_t start = index;

  while (true) {
    if (!map->bucket[index]) {
      map->bucket[index] = node;
      map->size++;
      return 1;
    } else if (map->bucket[index]->deleted) {
      _hashmap_node_free(map->bucket[index]);
      map->bucket[index] = node;
      map->size++;
      return 1;
    } else if (map->bucket[index]->ksize == ksize && memcmp(map->bucket[index]->key, key, ksize) == 0) {
      _hashmap_node_free(map->bucket[index]);
      map->bucket[index] = node;
      return 0;
    } else {
      index = (index + 1) % map->cap;
      if (start != index) continue;
      // likely to not reach
      _hashmap_node_free(node);
      return -1;
    }
  }
}

/** @warning status: [-1: error] [0: unknown] [1: found] */
static inline hashmap_node_t* hashmap_at(const hashmap_t* map, const void* key, size_t ksize, int* status) {
  if (status) *status = -1;
  if (!map || map->cap == 0 || map->size == 0 || !key || ksize == 0) return NULL;

  size_t index = _hashmap_hash(key, ksize, map->cap);
  size_t start = index;

  while (true) {
    hashmap_node_t* node = map->bucket[index];
    if (!node) {
      if (status) *status = 0;
      return NULL;
    } else if (!node->deleted && node->ksize == ksize && memcmp(node->key, key, ksize) == 0) {
      if (status) *status = 1;
      return node;
    } else {
      index = (index + 1) % map->cap;
      if (start == index) {
        if (status) *status = 0;
        return NULL;
      }
    }
  }
}

/** @returns [-1: error] [0: unknown] [1: removed] */
static inline int hashmap_remove(hashmap_t* map, const void* key, size_t ksize) {
  if (!map || map->cap == 0) return -1;

  int status;
  hashmap_node_t* node = hashmap_at(map, key, ksize, &status);
  if (!node) return status;

  free(node->key);
  free(node->value);

  node->key = NULL;
  node->value = NULL;
  node->ksize = 0;
  node->vsize = 0;
  node->deleted = true;
  map->size = map->size - 1;
  return 1;
}