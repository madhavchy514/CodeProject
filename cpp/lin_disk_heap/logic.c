--


uint64_t block_size = 1
uint64_t b = block_size * 8
uint64_t b0 = b = 8
uint64_t b1 = b^2 = 64
uint64_t s0 = b + 1 = 9
uint64_t s1 = s0 + b1 = 73

pattern = 
"GIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDGIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDDIDDDDDDDD"

uint64_t
physical_address(type: type::G/I/D, logical: uint64_t) {
  type == G: return s1 * logical
  type == I: return (s1 * (logical / b0)) + (1) + (s0 * (logical % b0))
  type == D: return
              + (s1 * (logical_d / b1)) + (1)
              + (s0 * ((logical_d / b0) % b0)) + (1)
              + (logical_d % b0)
}

{type: type::G/I/D, logical: uint64_t}
logical_address(physical: uint64_t) {
  g_idx = physical / s1;
  g_offset = physical % s1;

  if (g_offset == 0) return {
    type: type::G
    logical: g_idx
  }

  i_idx = (g_offset - 1) / s0;
  i_offset = (g_offset - 1) % s0;

  if (i_offset == 0) return {
    type: type::I
    logical: (g_idx * b0) + i_idx;
  }

  return {
    type: type::D
    logical: (g_idx * b1) + (i_offset - 1) + (i_idx * b0)
  }
}

{physical: uint64_t, byte_offset: uint64_t, bit_offset: uint8_t(0-7)}
controller_info(type: type::G/I/D, logical: uint64_t) {
  if (type == G) throw("G IS MASTER")
  bit_idx = logical % b0
  type parent = type == type::I ? type::M : type::I
  block_num = physical_address(parent, logical / b0)
  return {
    physical: (block_num)
    byte_offset: (block_num * block_size) + (bit_idx / 8)
    bit_offset: (bit_idx % 8)
  }
}

int8_t get_msb_0_index(uint8_t byte) {
  if (byte == 0xFF) return -1;
  for (int8_t i = 0; i < 8; i++) {
    if ((byte & (1 << i))) continue;
    return i;
  }
}

uint8_t change_byte(uint8_t byte, uint8_t index, byte_ops ops) {
  uint8_t mask = (1 << index);
  switch (ops) {
    case byte_ops::FLIP: return byte ^ mask;
    case byte_ops::ZERO: return byte & ~mask;
    case byte_ops::ONE: return byte | mask;
    case byte_ops::READ: default: return (byte >> index) & 1;
  }
}