#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define STACK_INITIAL_CAPACITY 16

typedef struct {
  void* data;
  size_t unit;
  size_t size;
  size_t cap;
} stack_t;

bool _stack_fit_mul(size_t a, size_t b) {
  return a == 0 || b == 0 || a <= SIZE_MAX / b;
}

bool _stack_fit_add(size_t a, size_t b) {
  return a <= SIZE_MAX - b;
}

/** @returns [stack_t: success] [NULL: error] */
stack_t* stack_make(size_t unit) {
  stack_t* st = malloc(sizeof(stack_t));
  if (!st || unit == 0) return NULL;
  st->data = NULL;
  st->unit = unit;
  st->size = 0;
  st->cap = 0;
  return st;
}

void stack_free(stack_t* st) {
  if (!st) return;
  free(st->data);
  free(st);
}

bool stack_reserve(stack_t* st, size_t cap) {
  if (!st || st->size > cap || !_stack_fit_mul(cap, st->unit)) return false;
  if (st->cap == cap) return true;

  if (cap == 0) {
    free(st->data);
    st->data = NULL;
    st->cap = 0;
    return true;
  }

  size_t bytes = cap * st->unit;
  void* nd = realloc(st->data, bytes);
  if (!nd) return false;

  st->data = nd;
  st->cap = cap;
  return true;
}

bool stack_grow(stack_t* st) {
  if (!st || !_stack_fit_add(st->cap, (st->cap / 2))) return false;
  size_t i_cap = STACK_INITIAL_CAPACITY;
  size_t n_cap = st->cap < i_cap ? i_cap : st->cap + (st->cap / 2);
  return stack_reserve(st, n_cap);
}

bool stack_push(stack_t* st, void* data) {
  if (!st || !data) return false;
  if (st->size >= st->cap && !stack_grow(st)) return false;

  size_t off = st->size * st->unit;
  void* dst = (uint8_t*)st->data + off;
  memcpy(dst, data, st->unit);

  st->size++;
  return true;
}

bool stack_pop(stack_t* st) {
  if (!st || st->size == 0) return false;
  st->size--;
  return true;
}

void* stack_top(stack_t* st) {
  if (!st || st->size == 0) return NULL;
  size_t off = (st->size - 1) * st->unit;
  return (uint8_t*)st->data + off;
}

bool stack_top_copy(stack_t* st, void* dst) {
  void* top = stack_top(st);
  if (!top || !dst) return false;
  memcpy(dst, top, st->unit);
  return true;
}

bool stack_clear(stack_t* st) {
  if (!st) return false;
  st->size = 0;
  return true;
}