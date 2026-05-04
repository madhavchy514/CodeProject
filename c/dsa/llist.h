#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

typedef struct llist_node_t {
  struct llist_node_t* prev;
  struct llist_node_t* next;
  size_t size;
  void* data;
} llist_node_t;

typedef struct {
  llist_node_t* head;
  llist_node_t* tail;
  size_t size;
} llist_t;

llist_node_t* _llist_node_create(void* data, size_t size) {
  if ((!data) != (size == 0)) return NULL;
  llist_node_t* ln = malloc(sizeof(llist_node_t));
  if (!ln) return NULL;

  ln->prev = NULL;
  ln->next = NULL;
  ln->size = size;

  ln->data = NULL;
  if (size != 0) {
    ln->data = malloc(size);
    if (!ln->data) {
      free(ln);
      return NULL;
    }
    memcpy(ln->data, data, size);
  }

  return ln;
}

/** @returns [llist_t: success] [NULL: error] */
llist_t* llist_create() {
  llist_t* ll = malloc(sizeof(llist_t));
  if (!ll) return NULL;
  ll->head = NULL;
  ll->tail = NULL;
  ll->size = 0;
  return ll;
}

void llist_free(llist_t* ll) {
  if (!ll) return;
  llist_node_t* cur = ll->head;
  while (cur) {
    llist_node_t* next = cur->next;
    free(cur->data);
    free(cur);
    cur = next;
  }
  free(ll);
}

bool llist_push_front(llist_t* ll, void* data, size_t size) {
  if (!ll) return false;
  llist_node_t* ln = _llist_node_create(data, size);
  if (!ln) return false;

  if (ll->size == 0) {
    ll->head = ll->tail = ln;
  } else {
    ln->next = ll->head;
    ll->head->prev = ln;
    ll->head = ln;
  }

  ll->size++;
  return true;
}

llist_node_t* llist_get_front(llist_t* ll) {
  if (!ll || ll->size == 0) return NULL;
  return ll->head;
}

bool llist_pop_front(llist_t* ll) {
  if (!ll || ll->size == 0) return false;

  llist_node_t* to_free = ll->head;
  ll->head = to_free->next;

  if (ll->head) {
    ll->head->prev = NULL;
  } else {
    ll->tail = NULL;
  }

  free(to_free->data);
  free(to_free);
  ll->size--;
  return true;
}

bool llist_push_back(llist_t* ll, void* data, size_t size) {
  if (!ll) return false;
  llist_node_t* ln = _llist_node_create(data, size);
  if (!ln) return false;

  if (ll->size == 0) {
    ll->head = ll->tail = ln;
  } else {
    ln->prev = ll->tail;
    ll->tail->next = ln;
    ll->tail = ln;
  }

  ll->size++;
  return true;
}

llist_node_t* llist_get_back(llist_t* ll) {
  if (!ll || ll->size == 0) return NULL;
  return ll->tail;
}

bool llist_pop_back(llist_t* ll) {
  if (!ll || ll->size == 0) return false;

  llist_node_t* to_free = ll->tail;
  ll->tail = to_free->prev;

  if (ll->tail) {
    ll->tail->next = NULL;
  } else {
    ll->head = NULL;
  }

  free(to_free->data);
  free(to_free);
  ll->size--;
  return true;
}