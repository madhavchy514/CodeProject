#pragma once

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef int (*btree_compare_t)(const void*, const void*, size_t, size_t);

typedef struct btree_node_t {
  void* key;
  size_t ksize;
  void* value;
  size_t vsize;
  size_t height;
  btree_node_t* left;
  btree_node_t* right;
} btree_node_t;

typedef struct {
  size_t size;
  btree_node_t* root;
  btree_compare_t compare;
} btree_t;

static inline size_t _btree_max(size_t a, size_t b) {
  return a > b ? a : b;
}

static inline btree_node_t* _btree_node_create(const void* key, const void* value, size_t ksize, size_t vsize) {
  if (!key || !value || ksize == 0 || vsize == 0) return NULL;

  btree_node_t* node = (btree_node_t*)malloc(sizeof(btree_node_t));
  if (!node) return NULL;

  node->value = (void*)malloc(vsize);
  node->vsize = vsize;
  if (!node->value) {
    free(node);
    return NULL;
  }

  node->key = (void*)malloc(ksize);
  node->ksize = ksize;
  if (!node->key) {
    free(node->value);
    free(node);
    return NULL;
  }

  node->height = 1;
  node->left = NULL;
  node->right = NULL;

  memcpy(node->key, key, ksize);
  memcpy(node->value, value, vsize);

  return node;
}

static void _btree_node_free(btree_node_t* node) {
  if (!node) return;
  _btree_node_free(node->left);
  _btree_node_free(node->right);
  free(node->key);
  free(node->value);
  free(node);
}

static inline size_t _btree_node_height(btree_node_t* node) {
  return node ? node->height : 0;
}

static inline int _btree_get_balance(btree_node_t* node) {
  return node ? (int)_btree_node_height(node->left) - (int)_btree_node_height(node->right) : 0;
}

static btree_node_t* _btree_min_node(btree_node_t* node) {
  btree_node_t* current = node;
  while (current->left) current = current->left;
  return current;
}

static btree_node_t* _btree_rotate_right(btree_node_t* node) {
  btree_node_t* x = node->left;
  btree_node_t* t2 = x->right;
  x->right = node;
  node->left = t2;
  node->height = _btree_max(_btree_node_height(node->left), _btree_node_height(node->right)) + 1;
  x->height = _btree_max(_btree_node_height(x->left), _btree_node_height(x->right)) + 1;
  return x;
}

static btree_node_t* _btree_rotate_left(btree_node_t* node) {
  btree_node_t* y = node->right;
  btree_node_t* t2 = y->left;
  y->left = node;
  node->right = t2;
  node->height = _btree_max(_btree_node_height(node->left), _btree_node_height(node->right)) + 1;
  y->height = _btree_max(_btree_node_height(y->left), _btree_node_height(y->right)) + 1;
  return y;
}

static btree_node_t* _btree_avl_insert(btree_t* tree, btree_node_t* node, const void* key, const void* value, size_t ksize, size_t vsize, int* status) {
  if (!node) {
    btree_node_t* new_node = _btree_node_create(key, value, ksize, vsize);
    if (!new_node) {
      if (status) *status = -1;
      return node;
    }
    tree->size++;
    if (status) *status = 1;
    return new_node;
  }

  int cmp = tree->compare(node->key, key, node->ksize, ksize);

  if (cmp > 0) {
    node->left = _btree_avl_insert(tree, node->left, key, value, ksize, vsize, status);
  } else if (cmp < 0) {
    node->right = _btree_avl_insert(tree, node->right, key, value, ksize, vsize, status);
  } else {
    if (node->vsize != vsize) {
      void* new_val = realloc(node->value, vsize);
      if (!new_val) {
        if (status) *status = -1;
        return node;
      }
      node->value = new_val;
      node->vsize = vsize;
    }
    memcpy(node->value, value, vsize);
    if (status) *status = 0;
    return node;
  }

  node->height = 1 + _btree_max(_btree_node_height(node->left), _btree_node_height(node->right));
  int balance = _btree_get_balance(node);

  if (balance > 1 && tree->compare(node->left->key, key, node->left->ksize, ksize) > 0) {
    return _btree_rotate_right(node);
  } else if (balance < -1 && tree->compare(node->right->key, key, node->right->ksize, ksize) < 0) {
    return _btree_rotate_left(node);
  } else if (balance > 1 && tree->compare(node->left->key, key, node->left->ksize, ksize) < 0) {
    node->left = _btree_rotate_left(node->left);
    return _btree_rotate_right(node);
  } else if (balance < -1 && tree->compare(node->right->key, key, node->right->ksize, ksize) > 0) {
    node->right = _btree_rotate_right(node->right);
    return _btree_rotate_left(node);
  }

  return node;
}

static btree_node_t* _btree_avl_remove(btree_t* tree, btree_node_t* root, const void* key, size_t ksize, int* status) {
  if (!root) {
    if (status) *status = 0;
    return root;
  }

  int cmp = tree->compare(root->key, key, root->ksize, ksize);
  if (cmp > 0) {
    root->left = _btree_avl_remove(tree, root->left, key, ksize, status);
  } else if (cmp < 0) {
    root->right = _btree_avl_remove(tree, root->right, key, ksize, status);
  } else {
    if (!root->left || !root->right) {
      btree_node_t* temp = root->left ? root->left : root->right;
      if (!temp) {
        temp = root;
        root = NULL;
      } else {
        btree_node_t* to_free = root;
        root = temp;
        temp = to_free;
      }
      free(temp->key);
      free(temp->value);
      free(temp);
      tree->size--;
      if (status) *status = 1;
    } else {
      btree_node_t* temp = _btree_min_node(root->right);

      if (root->ksize != temp->ksize) {
        void* new_key = realloc(root->key, temp->ksize);
        if (!new_key) {
          if (status) *status = -1;
          return root;
        }
        root->key = new_key;
        root->ksize = temp->ksize;
      }

      if (root->vsize != temp->vsize) {
        void* new_val = realloc(root->value, temp->vsize);
        if (!new_val) {
          if (status) *status = -1;
          return root;
        }
        root->value = new_val;
        root->vsize = temp->vsize;
      }

      memcpy(root->key, temp->key, temp->ksize);
      memcpy(root->value, temp->value, temp->vsize);

      root->right = _btree_avl_remove(tree, root->right, temp->key, temp->ksize, status);
    }
  }

  if (!root) return root;

  root->height = 1 + _btree_max(_btree_node_height(root->left), _btree_node_height(root->right));
  int balance = _btree_get_balance(root);

  if (balance > 1 && _btree_get_balance(root->left) >= 0) {
    return _btree_rotate_right(root);
  } else if (balance > 1 && _btree_get_balance(root->left) < 0) {
    root->left = _btree_rotate_left(root->left);
    return _btree_rotate_right(root);
  } else if (balance < -1 && _btree_get_balance(root->right) <= 0) {
    return _btree_rotate_left(root);
  } else if (balance < -1 && _btree_get_balance(root->right) > 0) {
    root->right = _btree_rotate_right(root->right);
    return _btree_rotate_left(root);
  }

  return root;
}

/** @returns [btree_t: success] [NULL: error] */
static inline btree_t* btree_create(btree_compare_t compare) {
  if (!compare) return NULL;
  btree_t* tree = (btree_t*)malloc(sizeof(btree_t));
  if (!tree) return NULL;
  tree->size = 0;
  tree->root = NULL;
  tree->compare = compare;
  return tree;
}

static inline void btree_free(btree_t* tree) {
  if (!tree) return;
  _btree_node_free(tree->root);
  free(tree);
}

/** @returns [-1: error] [0: updated] [1: inserted] */
static inline int btree_insert(btree_t* tree, const void* key, const void* value, size_t ksize, size_t vsize) {
  if (!tree || !key || !value || ksize == 0 || vsize == 0) return -1;
  int status;
  tree->root = _btree_avl_insert(tree, tree->root, key, value, ksize, vsize, &status);
  return status;
}

/** @warning status: [-1: error] [0: unknown] [1: found] */
static inline btree_node_t* btree_search(btree_t* tree, const void* key, size_t ksize, int* status) {
  if (status) *status = -1;
  if (!tree || !key || ksize == 0) return NULL;
  btree_node_t** cur = &(tree->root);
  while (1) {
    if (!(*cur)) {
      if (status) *status = 0;
      return NULL;
    }
    int compare = tree->compare((*cur)->key, key, (*cur)->ksize, ksize);
    if (compare > 0) {
      cur = &((*cur)->left);
      continue;
    } else if (compare < 0) {
      cur = &((*cur)->right);
      continue;
    } else {
      if (status) *status = 1;
      return *cur;
    }
  }
}

/** @returns [-1: error] [0: unknown] [1: removed] */
static inline int btree_remove(btree_t* tree, const void* key, size_t ksize) {
  if (!tree || !key || ksize == 0 || tree->size == 0) return -1;
  int status;
  tree->root = _btree_avl_remove(tree, tree->root, key, ksize, &status);
  return status;
}