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

static inline bool hashmap_fit_mul(size_t a, size_t b) {
  if (a == 0 || b == 0) return true;
  return a <= SIZE_MAX / b;
}

static inline bool hashmap_invalid(const hashmap_t* map) {
  return !map || map->size > map->cap || ((map->cap == 0) != (!map->bucket));
}

static inline size_t hashmap_hash(const void* key, size_t ksize, size_t cap) {
  if (cap == 0 || ksize == 0 || !key) return 0;

  const uint8_t* data = (const uint8_t*)key;
  uint64_t hash = 14695981039346656037ULL;

  for (size_t i = 0; i < ksize; i++) {
    hash = hash ^ data[i];
    hash = hash * 1099511628211ULL;
  }

  return (size_t)(hash % cap);
}

static inline hashmap_t* hashmap_create(size_t cap) {
  if (!hashmap_fit_mul(cap, sizeof(hashmap_node_t*))) return NULL;

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

static inline hashmap_node_t* hashmap_node_create(const void* key, const void* value, size_t ksize, size_t vsize) {
  hashmap_node_t* node = (hashmap_node_t*)malloc(sizeof(hashmap_node_t));
  if (!node) return NULL;

  if (!key || ksize == 0) {
    node->key = NULL;
    node->ksize = 0;
  } else {
    node->ksize = ksize;
    node->key = (void*)malloc(ksize);
    if (!node->key) {
      free(node);
      return NULL;
    } else {
      memcpy(node->key, key, ksize);
    }
  }

  if (!value || vsize == 0) {
    node->value = NULL;
    node->vsize = 0;
  } else {
    node->vsize = vsize;
    node->value = (void*)malloc(vsize);
    if (!node->value) {
      free(node->key);
      free(node);
      return NULL;
    } else {
      memcpy(node->value, value, vsize);
    }
  }

  node->deleted = false;
  return node;
}

static inline void hashmap_node_free(hashmap_node_t* node) {
  if (!node) return;
  free(node->key);
  free(node->value);
  free(node);
}

static inline void hashmap_free(hashmap_t* map) {
  if (hashmap_invalid(map)) return;
  for (size_t i = 0; i < map->cap; i++) hashmap_node_free(map->bucket[i]);
  free(map->bucket);
  free(map);
}

static inline bool hashmap_reserve(hashmap_t* map, size_t cap) {
  if (hashmap_invalid(map) || cap < map->size || !hashmap_fit_mul(cap, sizeof(hashmap_node_t*))) return false;

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
      hashmap_node_free(node);
      continue;
    } else {
      size_t index = hashmap_hash(node->key, node->ksize, cap);
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
  if (hashmap_invalid(map) || !hashmap_fit_mul(map->cap, 2)) return false;
  size_t i_cap = HASHMAP_INITIAL_CAPACITY;
  size_t n_cap = map->cap < i_cap ? i_cap : map->cap * 2;
  return hashmap_reserve(map, n_cap);
}

static inline bool hashmap_insert(hashmap_t* map, const void* key, const void* value, size_t ksize, size_t vsize, bool* update) {
  if (hashmap_invalid(map) || !hashmap_fit_mul(map->cap, 3)) return false;
  if ((map->cap == 0 || map->size >= (map->cap * 3) / 4) && !hashmap_grow(map)) return false;

  hashmap_node_t* node = hashmap_node_create(key, value, ksize, vsize);
  if (!node) return false;
  if (update) *update = false;

  size_t index = hashmap_hash(key, ksize, map->cap);
  size_t start = index;

  while (true) {
    if (!map->bucket[index]) {
      map->bucket[index] = node;
      map->size++;
      return true;
    } else if (map->bucket[index]->deleted) {
      hashmap_node_free(map->bucket[index]);
      map->bucket[index] = node;
      map->size++;
      return true;
    } else if (map->bucket[index]->ksize == ksize && memcmp(map->bucket[index]->key, key, ksize) == 0) {
      hashmap_node_free(map->bucket[index]);
      map->bucket[index] = node;
      if (update) *update = true;
      return true;
    } else {
      index = (index + 1) % map->cap;
      if (start != index) continue;
      hashmap_node_free(node);
      return false;
    }
  }
}

static inline hashmap_node_t* hashmap_at(const hashmap_t* map, const void* key, size_t ksize) {
  if (hashmap_invalid(map) || map->cap == 0 || map->size == 0) return NULL;

  size_t index = hashmap_hash(key, ksize, map->cap);
  size_t start = index;

  while (true) {
    hashmap_node_t* node = map->bucket[index];
    if (!node) {
      return NULL;
    } else if (!node->deleted && node->ksize == ksize &&  memcmp(node->key, key, ksize) == 0) {
      return node;
    } else {
      index = (index + 1) % map->cap;
      if (start == index) return NULL;
    }
  }
}

static inline bool hashmap_remove(hashmap_t* map, const void* key, size_t ksize) {
  if (hashmap_invalid(map) || map->cap == 0) return false;

  hashmap_node_t* node = hashmap_at(map, key, ksize);
  if (!node) return false;

  free(node->key);
  free(node->value);

  node->key = NULL;
  node->value = NULL;
  node->ksize = 0;
  node->vsize = 0;
  node->deleted = true;
  map->size = map->size - 1;
  return true;
}