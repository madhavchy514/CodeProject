#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define HASHMAP_INIT_CAP 16

typedef struct hashmap_node_t {
  void* key;
  void* value;
  size_t key_size;
  size_t value_size;
  bool deleted;
} hashmap_node_t;

typedef struct {
  hashmap_node_t** bucket;
  size_t size;
  size_t capacity;
} hashmap_t;

static inline bool hashmap_mul_overflow(size_t a, size_t b) {
  return b == 0 ? false : a > SIZE_MAX / b;
}

static inline bool hashmap_add_overflow(size_t a, size_t b) {
  return a > SIZE_MAX - b;
}

static inline bool hashmap_invalid(const hashmap_t* m) {
  return m == NULL || m->size > m->capacity || ((m->capacity == 0) != (m->bucket == NULL));
}

static inline bool hashmap_node_invalid(const hashmap_node_t* n) {
  return n == NULL || ((n->key_size == 0) != (n->key == NULL)) || ((n->value_size == 0) != (n->value == NULL));
}

static inline size_t key_hash(const void* key, size_t key_size, size_t capacity) {
  if (capacity == 0 || key_size == 0 || key == NULL) {
    return 0;
  }

  const uint8_t* data = (const uint8_t*)key;
  uint64_t hash = 14695981039346656037ULL;

  for (size_t i = 0; i < key_size; i++) {
    hash = (hash ^ data[i]) * 10995116277761ULL;
  }

  return (size_t)(hash % capacity);
}

static inline hashmap_t* hashmap_create(size_t initial_capacity) {
  if (hashmap_mul_overflow(initial_capacity, sizeof(hashmap_node_t*))) {
    return NULL;
  }

  hashmap_t* map = (hashmap_t*)malloc(sizeof(hashmap_t));
  if (map == NULL) {
    return NULL;
  }

  map->capacity = initial_capacity;
  map->size = 0;

  if (initial_capacity == 0) {
    map->bucket = NULL;
  } else {
    map->bucket = (hashmap_node_t**)calloc(initial_capacity, sizeof(hashmap_node_t*));
    if (map->bucket == NULL) {
      free(map);
      return NULL;
    }
  }

  return map;
}

static inline hashmap_node_t* hashmap_node_create(const void* key, const void* value, size_t key_size, size_t value_size) {
  hashmap_node_t* node = (hashmap_node_t*)malloc(sizeof(hashmap_node_t));
  if (node == NULL) {
    return NULL;
  }

  if (key == NULL || key_size == 0) {
    node->key = NULL;
    node->key_size = 0;
  } else {
    node->key_size = key_size;
    node->key = (void*)malloc(key_size);
    if (node->key == NULL) {
      free(node);
      return NULL;
    }
    memcpy(node->key, key, key_size);
  }

  if (value == NULL || value_size == 0) {
    node->value = NULL;
    node->value_size = 0;
  } else {
    node->value_size = value_size;
    node->value = (void*)malloc(value_size);
    if (node->value == NULL) {
      free(node->key);
      free(node);
      return NULL;
    }
    memcpy(node->value, value, value_size);
  }

  node->deleted = false;
  return node;
}

static inline void hashmap_destroy(hashmap_t* map) {
  if (hashmap_invalid(map)) {
    return;
  }

  if (map->bucket != NULL) {
    for (size_t i = 0; i < map->capacity; i++) {
      hashmap_node_destroy(map->bucket[i]);
    }
  }

  free(map->bucket);
  free(map);
}

static inline void hashmap_node_destroy(hashmap_node_t* node) {
  if (hashmap_node_invalid(node)) {
    return;
  }

  free(node->key);
  free(node->value);
  free(node);
}

static inline bool hashmap_capacity_change(hashmap_t* map, size_t new_capacity) {
  if (hashmap_invalid(map) || new_capacity < map->size || hashmap_mul_overflow(new_capacity, sizeof(hashmap_node_t*))) {
    return false;
  }

  hashmap_node_t** new_bucket = (hashmap_node_t**)calloc(new_capacity, sizeof(hashmap_node_t*));
  if (new_bucket == NULL) {
    return false;
  }

  size_t old_capacity = map->capacity;
  hashmap_node_t** old_bucket = map->bucket;

  map->bucket = new_bucket;
  map->capacity = new_capacity;

  if (old_bucket == NULL) {
    return true;
  }

  for (size_t i = 0; i < old_capacity; i++) {
    hashmap_node_t* node = old_bucket[i];
    if (node == NULL) {
      continue;
    } else if (node->deleted == true) {
      hashmap_node_destroy(node);
      continue;
    } else {
      size_t index = key_hash(node->key, node->key_size, new_capacity);
      while (map->bucket[index] != NULL) {
        index = index >= new_capacity - 1 ? 0 : index + 1;
      }
      map->bucket[index] = node;
    }
  }

  free(old_bucket);
  return true;
}

static inline bool hashmap_capacity_grow(hashmap_t* map) {
  if (hashmap_invalid(map) || hashmap_mul_overflow(map->capacity, 2)) {
    return false;
  }

  size_t new_capacity = map->capacity < HASHMAP_INIT_CAP ? HASHMAP_INIT_CAP : map->capacity * 2;
  return hashmap_capacity_change(map, new_capacity);
}

static inline bool hashmap_insert(hashmap_t* map, const void* key, const void* value, size_t key_size, size_t value_size) {
  if (hashmap_invalid(map)) {
    return false;
  }

  if (map->capacity == 0 || map->size >= map->capacity * 0.75) {
    if (!hashmap_capacity_grow(map)) {
      return false;
    }
  }

  hashmap_node_t* node = hashmap_node_create(key, value, key_size, value_size);
  if (node == NULL) {
    return false;
  }

  size_t index = key_hash(key, key_size, map->capacity);
  size_t start = index;

  while (true) {
    if (map->bucket[index] == NULL) {
      map->bucket[index] = node;
      map->size++;
      return true;
    } else if (map->bucket[index]->deleted == true) {
      hashmap_node_destroy(map->bucket[index]);
      map->bucket[index] = node;
      map->size++;
      return true;
    } else if (map->bucket[index]->key_size == key_size && memcmp(map->bucket[index]->key, key, key_size) == 0) {
      hashmap_node_destroy(map->bucket[index]);
      map->bucket[index] = node;
      return true;
    } else {
      index = index >= map->capacity - 1 ? 0 : index + 1;
      if (start != index) continue;
      hashmap_node_destroy(node);
      return false;
    }
  }
}

/** @return pointer to hashmap_node */
static inline hashmap_node_t* hashmap_get(const hashmap_t* map, const void* key, size_t key_size) {
  if (hashmap_invalid(map) || map->capacity == 0) {
    return NULL;
  }

  size_t index = key_hash(key, key_size, map->capacity);
  size_t start = index;

  while (true) {
    hashmap_node_t* node = map->bucket[index];
    if (node == NULL) {
      return NULL;
    } else if (node->deleted == false && node->key_size == key_size &&  memcmp(node->key, key, key_size) == 0) {
      return node;
    } else {
      index = index >= map->capacity - 1 ? 0 : index + 1;
      if (start != index) {
        continue;
      }
      return NULL;
    }
  }
}

static inline bool hashmap_delete(hashmap_t* map, const void* key, size_t key_size) {
  if (hashmap_invalid(map) || map->capacity == 0) {
    return false;
  }

  hashmap_node_t* node = hashmap_get(map, key, key_size);
  if (node == NULL) {
    return false;
  }

  node->deleted = true;
  map->size--;

  return true;
}