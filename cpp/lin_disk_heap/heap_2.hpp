#pragma once

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "error.hpp"
#include "file.hpp"

class heap {
  public:
    using blob_t = std::vector<uint8_t>;

    enum heap_error: int {
      ADD_OVERFLOW = 1000, MUL_OVERFLOW
    };

    enum byte_ops: int {
      FLIP = 1000, ZERO, ONE, READ, LSB0
    };

    enum block_type: int {
      SUPER = 1000, MAP, DATA
    };

    struct block_info {
      uint64_t id;
      block_type type;
    };

    struct bit_location {
      uint64_t block;
      uint64_t byte_offset;
      uint8_t bit_offset;
    };

    heap(const heap&) = delete;
    heap& operator=(const heap&) = delete;

    explicit heap(std::string file_path, uint64_t block_size): m_fl(std::move(file_path)) {
      m_block_size = block_size == 0 ? 4096: block_size;
      m_b[0] = mul(block_size, 8);
      m_b[1] = mul(m_b[0], m_b[0]);
      m_s[0] = add(m_b[0], 1);
      m_s[1] = add(m_b[1], m_s[0]);
      set_uint8_map();
    }

    uint64_t get_block(uint64_t id, block_type type) {
      switch (type) {
        case block_type::SUPER: return mul(m_s[0], id);
        case block_type::MAP: return add(add(1, mul(m_s[1], (id / m_b[0]))), mul(m_s[0], (id % m_b[0])));
        case block_type::DATA: default: return add(
          add(add(2, mul(m_s[1], id / m_b[1])),
          mul(m_s[0], ((id / m_b[0]) % m_b[0]))), id % m_b[0]
        );
      }
    }

    block_info get_block_info(uint64_t block) {
      block_info info;

      uint64_t super_block_idx = block / m_s[1];
      uint64_t internal_offset = block % m_s[1];
      if (internal_offset == 0) {
        info.id = super_block_idx;
        info.type = block_type::SUPER;
        return info;
      }

      uint64_t sub_offset = (internal_offset - 1) % m_s[0];
      uint64_t sub_idx = (internal_offset - 1) / m_s[0];
      if (sub_offset == 0) {
        info.type = block_type::MAP;
        info.id = add(mul(m_b[0], super_block_idx), sub_idx);
        return info;
      }

      info.type = block_type::DATA;
      info.id = add(add(mul(m_b[1], super_block_idx), mul(sub_idx, m_b[0])), (sub_offset - 1));
      return info;
    }

    bit_location get_bit_location(uint64_t id, block_type type) {
      // if (type == block_type::SUPER) type = block_type::DATA
      block_type parent = type == block_type::MAP ? block_type::SUPER : block_type::MAP;
      uint64_t bit_idx = id % m_b[0];
      uint64_t parent_block = get_block(id / m_b[0], parent);

      bit_location loc;
      loc.block = parent_block;
      loc.byte_offset = bit_idx / 8;
      loc.bit_offset = static_cast<uint8_t>(bit_idx % 8);
      return loc;
    }

    uint8_t get_byte(uint8_t byte, uint8_t index, byte_ops ops) {
      uint8_t mask = (1 << index);
      switch (ops) {
        case byte_ops::FLIP: return byte ^ mask;
        case byte_ops::ZERO: return byte & ~mask;
        case byte_ops::ONE: return byte | mask;
        case byte_ops::READ: default: return (byte >> index) & 1;
        case byte_ops::LSB0: return m_uint8_map[byte];
      }
    }

    uint64_t get_byte_offset(uint64_t id, block_type type) {
      return mul(get_block(id, type), m_block_size);
    }

    uint64_t find_free_data_id() {
      blob_t blob1(m_block_size);
      blob_t blob2(m_block_size);
      for (uint64_t i = 0;; i++) {
        std::memset(blob1.data(), 0, m_block_size);
        m_fl.read(blob1.data(), m_block_size, get_byte_offset(i, block_type::SUPER));
        for (uint64_t j = 0; j < m_block_size; j++) {
          if (blob1[j] == 0xFF) continue;
          std::memset(blob2.data(), 0, m_block_size);
          uint64_t map_id = add(mul(i, m_b[0]), add(mul(j, 8), get_byte(blob1[j], 0, byte_ops::LSB0)));
          m_fl.read(blob2.data(), m_block_size, get_byte_offset(map_id, block_type::MAP));
          for (uint64_t k = 0; k < m_block_size; k++) {
            if (blob2[k] == 0xFF) continue;
            uint64_t data_id = add(mul(map_id, m_b[0]), (k * 8 + get_byte(blob2[k], 0, byte_ops::LSB0)));
            return data_id;
          }
        }
      }
    }

    blob_t read_id(uint64_t id, block_type type) {
      uint64_t block = get_block(id, type);
      blob_t blob(m_block_size, 0);
      m_fl.read(blob.data(), m_block_size, mul(block, m_block_size));
      return blob;
    }

    bool set_data_id(uint64_t id, bool sync = false, bool free = false) {
      bit_location loc_m = get_bit_location(id, block_type::DATA);
      block_info info_m = get_block_info(loc_m.block);
      bit_location loc_s = get_bit_location(info_m.id, block_type::MAP);
      blob_t blob_m = read_id(info_m.id, block_type::MAP);

      uint8_t byte_m = 0;
      uint64_t off_m = add(loc_m.byte_offset, mul(loc_m.block, m_block_size));
      std::memcpy(&byte_m, blob_m.data() + loc_m.byte_offset, 1);
      uint8_t new_byte_m = get_byte(byte_m, loc_m.bit_offset, free ? byte_ops::ZERO : byte_ops::ONE);
      if (new_byte_m == byte_m) return false;
      m_fl.write(&new_byte_m, 1, off_m, sync);
      blob_m[loc_m.byte_offset] = new_byte_m;
      if (!free) for (uint64_t i = 0; i < m_block_size; i++) {
        if (blob_m[i] != 0xFF) return true;
      }

      uint8_t byte_s = 0;
      uint64_t off_s = add(loc_s.byte_offset, mul(loc_s.block, m_block_size));
      m_fl.read(&byte_s, 1, off_s);
      uint8_t new_byte_s = get_byte(byte_s, loc_s.bit_offset, free? byte_ops::ZERO : byte_ops::ONE);
      if (new_byte_s == byte_s) return true;
      m_fl.write(&new_byte_s, 1, off_s, sync);
      return true;
    }

  private:
    file m_fl;
    uint64_t m_b[2];
    uint64_t m_s[2];
    uint64_t m_block_size;
    uint8_t m_uint8_map[256];

    uint64_t add(uint64_t n1, uint64_t n2) {
      if (n1 <= UINT64_MAX - n2) return n1 + n2;
      throw error("Addition overflow occured", heap_error::ADD_OVERFLOW);
    }

    uint64_t mul(uint64_t n1, uint64_t n2) {
      if (n1 == 0 || n2 == 0) return 0;
      if (n1 <= UINT64_MAX / n2) return n1 * n2;
      throw error("Multiplication overflow occured", heap_error::MUL_OVERFLOW);
    }

    void set_uint8_map() {
      for (int i = 0; i < 256; i++) {
        uint8_t currentByte = static_cast<uint8_t>(i);
        m_uint8_map[i] = 8;
        for (uint8_t j = 0; j < 8; j++) {
          if (!(currentByte & (1 << j))) {
            m_uint8_map[i] = j;
            break;
          }
        }
      }
    }
};