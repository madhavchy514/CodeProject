#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

typedef int (*btree_compare_t)(const void*, const void*, size_t);

typedef struct btree_node_t {
  btree_node_t* left;
  btree_node_t* right;
  size_t height;
  size_t vsize;
  void* value;
  void* key;
  bool deleted;
} btree_node_t;

typedef struct {
  btree_compare_t compare;
  btree_node_t* root;
  size_t ksize;
  size_t size;
} btree_t;

static inline bool btree_fit_mul(size_t a, size_t b) {
  if (a == 0 || b == 0) return true;
  return a <= SIZE_MAX / b;
}

static inline bool btree_fit_add(size_t a, size_t b) {
  return a <= SIZE_MAX - b;
}

static inline size_t btree_max(size_t a, size_t b) {
  return (a > b) ? a : b;
}

static inline bool btree_invalid(btree_t* tree) {
  return !tree || tree->ksize == 0 || !tree->compare || ((tree->size == 0) != (!tree->root));
}

static inline btree_t* btree_create(btree_compare_t compare, size_t ksize) {
  if (ksize == 0 || !compare) return NULL;
  btree_t* tree = (btree_t*)malloc(sizeof(btree_t));
  if (!tree) return NULL;
  tree->compare = compare;
  tree->root = NULL;
  tree->ksize = ksize;
  tree->size = 0;
  return tree;
}

static inline btree_node_t* btree_node_create(const void* key, const void* value, size_t ksize, size_t vsize) {
  if (!key || !value) return NULL;

  btree_node_t* node = (btree_node_t*)malloc(sizeof(btree_node_t));
  if (!node) return NULL;

  node->left = NULL;
  node->right = NULL;
  node->height = 0;
  node->vsize = vsize;
  node->deleted = false;

  node->value = vsize == 0 ? NULL : (void*)malloc(vsize);
  if (vsize != 0 && !node->value) {
    free(node);
    return NULL;
  }

  node->key = (void*)malloc(ksize);
  if (!node->key) {
    free(node->value);
    free(node);
    return NULL;
  }

  return node;
}

static inline bool btree_insert(btree_t* tree, const void* key, const void* value, size_t vsize) {
  if (btree_invalid(tree) || !key || !value) return false;

  btree_node_t **cur = &(tree->root);
  while (true) {
    if (!(*cur)) {
      *cur = btree_node_create(key, value, tree->ksize, vsize);
      if (*cur == NULL) return false;
      tree->size += 1;
      return true;
    }
    int compare = tree->compare((*cur)->key, key, tree->ksize);
    if (compare > 0) {
      cur = &((*cur)->left);
      continue;
    } else if (compare < 0) {
      cur = &((*cur)->right);
      continue;
    } else {
      (*cur)->value = value;
      return true;
    }
  }
}

static inline btree_node_t* btree_search(const btree_t* tree, const void* key) {
  if (btree_invalid(tree) || !key) return NULL;

  btree_node_t** cur = &(tree->root);
  while (true) {
    if (!(*cur)) return NULL;
    int compare = tree->compare((*cur)->key, key, tree->ksize);
    if (compare > 0) {
      cur = &((*cur)->left);
      continue;
    } else if (compare < 0) {
      cur = &((*cur)->right);
      continue;
    } else {
      if ((*cur)->deleted) return NULL;
      return *cur;
    }
  }
}

static inline bool btree_delete(btree_t* tree, const void* key) {
  if (btree_invalid(tree) || !key) return false;
  btree_node_t* node = btree_search(tree, key);
  node->deleted = true;
  return true;
}