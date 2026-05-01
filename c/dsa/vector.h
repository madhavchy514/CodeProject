#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define VECTOR_INITIAL_CAPACITY 16

typedef struct {
  void* data;
  size_t size;
  size_t cap;
  size_t unit;
} vector_t;

static inline bool _vector_fit_mul(size_t a, size_t b) {
  if (a == 0 || b == 0) return true;
  return a <= SIZE_MAX / b;
}

static inline bool _vector_add_mul(size_t a, size_t b) {
  return a <= SIZE_MAX - b;
}

/** @returns [vector_t: success] [NULL: error] */
static inline vector_t* vector_create(size_t cap, size_t unit) {
  if (unit == 0 || !_vector_fit_mul(cap, unit)) return NULL;

  vector_t* v = (vector_t*)malloc(sizeof(vector_t));
  if (!v) return NULL;

  v->data = NULL;
  if (cap != 0) {
    size_t bytes = cap * unit;
    v->data = (void*)malloc(bytes);
    if (!v->data) {
      free(v);
      return NULL;
    }
  }

  v->size = 0;
  v->cap = cap;
  v->unit = unit;
  return v;
}

static inline void vector_free(vector_t* v) {
  if (!v) return;
  free(v->data);
  free(v);
}

static inline vector_t* vector_clone(const vector_t* v) {
  if (!v) return NULL;

  vector_t* nv = vector_create(v->cap, v->unit);
  if (!nv) return NULL;

  if (v->size != 0) {
    size_t bytes = v->size * v->unit;
    memcpy(nv->data, v->data, bytes);
  }

  nv->size = v->size;
  return nv;
}

static inline bool vector_reserve(vector_t* v, size_t cap, const void* data) {
  if (!v || cap < v->size || !_vector_fit_mul(cap, v->unit)) return false;
  if (cap == v->cap) return true;

  if (cap == 0) {
    free(v->data);
    v->data = NULL;
  } else {
    size_t bytes = cap * v->unit;
    void* nd = (void*)realloc(v->data, bytes);
    if (!nd) return false;
    v->data = nd;
    if (data) for (size_t i = 0; i < cap - v->size; i++) {
      size_t off = (v->size + i) * v->unit;
      memcpy((uint8_t*)nd + off, data, v->unit);
    }
  }

  v->cap = cap;
  return true;
}

static inline bool vector_grow(vector_t* v) {
  if (!v || !_vector_add_mul(v->cap, v->cap / 2)) return false;
  size_t i_cap = VECTOR_INITIAL_CAPACITY;
  size_t n_cap = v->cap < i_cap ? i_cap : v->cap + (v->cap / 2);
  return vector_reserve(v, n_cap, NULL);
}

static inline bool vector_insert(vector_t* v, size_t i, const void* data) {
  if (!data || !v || i > v->size || !_vector_add_mul(v->size, 1) || !_vector_fit_mul((v->size + 1), v->unit)) return false;

  if (v->size >= v->cap)
    if (!vector_grow(v)) 
      return false;

  if (i < v->size) {
    void* dst = (uint8_t*)v->data + ((i + 1) * v->unit);
    void* src = (uint8_t*)v->data + (i * v->unit);
    size_t len = (v->size - i) * v->unit;
    memmove(dst, src, len);
  }

  void* dst = (uint8_t*)v->data + (i * v->unit);
  memcpy(dst, data, v->unit);
  v->size++;
  return true;
}

static inline bool vector_update(vector_t* v, size_t i, const void* data) {
  if (!data || !v || i >= v->size) return false;
  void* dst  = (uint8_t*)v->data + (i * v->unit);
  memcpy(dst, data, v->unit);
  return true;
}

static inline void* vector_at(const vector_t* v, size_t i) {
  if (!v || i >= v->size) return NULL;
  return (uint8_t*)v->data + (i * v->unit);
}

static inline bool vector_remove(vector_t* v, size_t i) {
  if (!v || v->size == 0 || i >= v->size || !_vector_fit_mul(v->size, v->unit)) return false;

  if (i < v->size - 1) {
    void* dst = (uint8_t*)v->data + (i * v->unit);
    void* src = (uint8_t*)v->data + ((i + 1) * v->unit);
    size_t len = (v->size - i - 1) * v->unit;
    memmove(dst, src, len);
  }

  v->size--;
  return true;
}