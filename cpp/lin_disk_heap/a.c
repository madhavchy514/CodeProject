#include <stdint.h>
#include <stdio.h>
#include <inttypes.h>

enum byte_ops: int {
  FLIP, ZERO, ONE, READ
};

int8_t get_msb_0_index(uint8_t byte) {
  if (byte == 0xFF) return -1;
  for (int8_t i = 0; i < 8; i++) {
    if ((byte & (1 << i))) continue;
    return i;
  }
}

uint8_t change_byte(uint8_t byte, uint8_t index, int ops) {
  uint8_t mask = (1 << index);
  switch (ops) {
    case FLIP: return byte ^ mask;
    case ZERO: return byte & ~mask;
    case ONE: return byte | mask;
    case READ: default: return (byte >> index) & 1;
  }
}

int main() {
  uint8_t dd = 0b01010101;
  uint8_t byte = change_byte(dd, 4, READ);
  printf("%" PRIu8 "\n", byte);
}