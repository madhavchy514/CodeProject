#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#define QUEUE_INITIAL_CAPACITY 16

typedef struct {
  void* data;
  size_t unit;
  size_t size;
  size_t cap;
  size_t start;
} queue_t;

bool _queue_fit_mul(size_t a, size_t b) {
  return a == 0 || b == 0 || a <= SIZE_MAX / b;
}

bool _queue_fit_add(size_t a, size_t b) {
  return a <= SIZE_MAX - b;
}

/** @returns [queue_t: success] [NULL: error] */
queue_t* queue_make(size_t unit) {
  queue_t* qe = malloc(sizeof(queue_t));
  if (!qe || unit == 0) return NULL;
  qe->data = NULL;
  qe->unit = unit;
  qe->size = 0;
  qe->cap = 0;
  qe->start = 0;
  return qe;
}

void queue_free(queue_t* qe) {
  if (!qe) return;
  free(qe->data);
  free(qe);
}

bool queue_reserve(queue_t* qe, size_t cap) {
  if (!qe || qe->size > cap || !_queue_fit_mul(cap, qe->unit)) return false;
  if (cap == qe->cap) return true;

  if (cap == 0) {
    free(qe->data);
    qe->data = NULL;
    qe->cap = 0;
    qe->start = 0;
    return true;
  }

  size_t bytes = cap * qe->unit;
  void* nd = malloc(bytes);
  if (!nd) return false;

  if (qe->data) {
    size_t off_right = qe->start * qe->unit;
    size_t end = qe->start + qe->size;
    size_t len_right, len_left;
    if (end <= qe->cap) {
      len_right = qe->size * qe->unit;
      len_left  = 0;
    } else {
      len_left  = (end % qe->cap) * qe->unit;
      len_right = qe->size * qe->unit - len_left;
    }
    memcpy(nd, (uint8_t*)qe->data + off_right, len_right);
    memcpy((uint8_t*)nd + len_right, qe->data, len_left);
  }

  free(qe->data);
  qe->data = nd;
  qe->cap = cap;
  qe->start = 0;
  return true;
}

bool queue_grow(queue_t* qe) {
  if (!qe || !_queue_fit_add(qe->cap, (qe->cap / 2))) return false;
  size_t i_cap = QUEUE_INITIAL_CAPACITY;
  size_t n_cap = qe->cap < i_cap ? i_cap : qe->cap + (qe->cap / 2);
  return queue_reserve(qe, n_cap);
}

bool queue_push(queue_t* qe, void* data) {
  if (!qe || !data || !_queue_fit_add(qe->start, qe->size)) return false;
  if (qe->size >= qe->cap && !queue_grow(qe)) return false;

  size_t off = ((qe->start + qe->size) % qe->cap) * qe->unit;
  void* dst = (uint8_t*)qe->data + off;
  memcpy(dst, data, qe->unit);

  qe->size++;
  return true;
}

bool queue_shift(queue_t* qe) {
  if (!qe || qe->size == 0) return false;
  qe->start = (qe->start + 1) % qe->cap;
  qe->size--;
  return true;
}

void* queue_top(queue_t* qe) {
  if (!qe || qe->size == 0) return NULL;
  size_t off = qe->start * qe->unit;
  return (uint8_t*)qe->data + off;
}

bool queue_top_copy(queue_t* qe, void* dst) {
  void* top = queue_top(qe);
  if (!top || !dst) return false;
  memcpy(dst, top, qe->unit);
  return true;
}

bool queue_clear(queue_t* qe) {
  if (!qe) return false;
  qe->size = 0;
  qe->start = 0;
  return true;
}