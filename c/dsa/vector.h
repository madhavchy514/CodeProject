#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define VECTOR_INIT_CAP 16

typedef struct {
  void* data;
  size_t size;
  size_t capacity;
  size_t value_size;
} vector_t;

static inline bool vector_mul_overflow(size_t a, size_t b) {
  return b == 0 ? false : a > SIZE_MAX / b;
}

static inline bool vector_add_overflow(size_t a, size_t b) {
  return a > SIZE_MAX - b;
}

static inline bool vector_invalid(const vector_t* v) {
  return v == NULL || v->value_size == 0 || v->size > v->capacity || ((v->capacity == 0) != (v->data == NULL));
}

static inline vector_t* vector_create(size_t initial_capacity, size_t value_size) {
  if (value_size == 0 || vector_mul_overflow(initial_capacity, value_size)) {
    return NULL;
  }

  vector_t* vector = (vector_t*)malloc(sizeof(vector_t));
  if (vector == NULL) {
    return NULL;
  }

  size_t bytes = initial_capacity * value_size;

  if (initial_capacity == 0) {
    vector->data = NULL;
  } else {
    vector->data = (void*)malloc(bytes);
    if (vector->data == NULL) {
      free(vector);
      return NULL;
    }
  }

  vector->size = 0;
  vector->capacity = initial_capacity;
  vector->value_size = value_size;

  return vector;
}

static inline vector_t* vector_clone(const vector_t* vector) {
  if (vector_invalid(vector) || vector_mul_overflow(vector->size, vector->value_size)) {
    return NULL;
  }

  vector_t* new_vector = vector_create(vector->capacity, vector->value_size);
  if (new_vector == NULL) {
    return NULL;
  }

  if (vector->capacity != 0) {
    memcpy(new_vector->data, vector->data, vector->size * vector->value_size);
  }

  new_vector->size = vector->size;
  return new_vector;
}

static inline void vector_free(vector_t* vector) {
  if (vector != NULL) {
    free(vector->data);
    free(vector);
  }
}

static inline bool vector_capacity_change(vector_t* vector, size_t new_capacity) {
  if (vector_invalid(vector) || new_capacity < vector->size || vector_mul_overflow(new_capacity, vector->value_size)) {
    return false;
  }

  if (new_capacity == vector->capacity) {
    return true;
  }

  size_t bytes = new_capacity * vector->value_size;
  void* new_data;

  if (new_capacity == 0) {
    free(vector->data);
    new_data = NULL;
  } else {
    new_data = (void*)realloc(vector->data, bytes);
    if (new_data == NULL) {
      return false;
    }
  }

  vector->data = new_data;
  vector->capacity = new_capacity;

  return true;
}

static inline bool vector_capacity_grow(vector_t* vector) {
  if (vector_invalid(vector) || vector_add_overflow(vector->capacity, vector->capacity / 2)) {
    return false;
  }

  size_t new_capacity = vector->capacity < VECTOR_INIT_CAP ? VECTOR_INIT_CAP : vector->capacity + vector->capacity / 2;
  return vector_capacity_change(vector, new_capacity);
}

static inline bool vector_insert(vector_t* vector, size_t index, const void* value) {
  if (vector_invalid(vector) || value == NULL || index > vector->size) {
    return false;
  }

  if (vector->size >= vector->capacity && vector_capacity_grow(vector) == false) {
    return false;
  }

  if (index < vector->size) {
    if (vector_add_overflow(vector->size, 1) || vector_mul_overflow(vector->size + 1, vector->value_size)) {
      return false;
    }

    void* dst = (uint8_t*)vector->data + ((index + 1) * vector->value_size);
    void* src = (uint8_t*)vector->data + (index * vector->value_size);
    memmove(dst, src, (vector->size - index) * vector->value_size);
  }

  memcpy((uint8_t*)vector->data + (index * vector->value_size), value, vector->value_size);
  vector->size = vector->size + 1;

  return true;
}

static inline void* vector_get(const vector_t* vector, size_t index) {
  if (vector_invalid(vector) || index >= vector->size) {
    return NULL;
  }

  return (uint8_t*)vector->data + (index * vector->value_size);
}

static inline bool vector_copy_get(const vector_t* vector, size_t index, void* dst) {
  if (dst == NULL) {
    return false;
  }

  void* value = vector_get(vector, index);
  if (value == NULL) {
    return false;
  }

  memcpy(dst, value, vector->value_size);
  return true;
}

static inline bool vector_delete(vector_t* vector, size_t index) {
  if (vector_invalid(vector) || index >= vector->size) {
    return false;
  }

  if (index < vector->size - 1) {
    if (vector_mul_overflow(vector->size, vector->value_size)) {
      return false;
    }

    void* dst = (uint8_t*)vector->data + (index * vector->value_size);
    void* src = (uint8_t*)vector->data + ((index + 1) * vector->value_size);
    memmove(dst, src, (vector->size - index - 1) * vector->value_size);
  }

  vector->size = vector->size - 1;
  return true;
}