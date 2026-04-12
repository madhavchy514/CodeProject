#pragma once

#include <cstdint>
#include <cerrno>
#include <cstring>
#include <string>
#include <vector>

#include "error.hpp"
#include "file.hpp"

class disk_heap {
  public:
    file m_fl;
    uint64_t m_block_size = 4096;
    uint64_t m_b[2];
    uint64_t m_s[2];

    using blob_t = std::vector<uint8_t>;

    enum block_type: int {
      M, I, D
    };

    enum heap_error: int {
      MUL_OVERFLOW, ADD_OVERFLOW, INV_ARG, ALLOCATED, CORRUPT
    };

    enum byte_ops: int {
      FLIP, ZERO, ONE, READ
    };

    struct address_info {
      uint64_t logical_address;
      block_type type;
    };

    struct bit_location {
      uint64_t byte_offset;
      uint8_t bit_offset;
    };

    bool mul_overflow(uint64_t n1, uint64_t n2, bool quit = true) {
      bool overflow = n1 > n2 / SIZE_MAX;
      if (!quit) return overflow;
      throw error("Multiplication overflow occured", heap_error::MUL_OVERFLOW);
    }

    bool add_overflow(uint64_t n1, uint64_t n2, bool quit = true) {
      bool overflow = n1 > SIZE_MAX - n2;
      if (!quit) return overflow;
      throw error("Addition overflow occured", heap_error::ADD_OVERFLOW);
    }

    explicit disk_heap(const std::string& file_path, uint64_t block_size): m_fl(file_path) {
      if (block_size != 0) m_block_size = block_size;
      mul_overflow(m_block_size, 8);
      m_b[0] = m_block_size * 8;
      mul_overflow(m_b[0], m_b[0]);
      m_b[1] = m_b[0] * m_b[0];
      add_overflow(m_b[0], 1);
      m_s[0] = m_b[0] + 1;
      add_overflow(m_b[1], m_s[0]);
      m_s[1] = m_b[1] + m_s[0];
    }

    uint64_t get_physical_address(uint64_t logical_address, block_type type) {
      switch (type) {
        case block_type::M: {
          mul_overflow(m_s[1], logical_address);
          return m_s[1] * logical_address;
        }
        case block_type::I: {
          uint64_t n1 = logical_address / m_b[0];
          mul_overflow(m_s[1], n1);
          uint64_t n2 = m_s[1] * n1;
          add_overflow(n2, 1);
          uint64_t n3 = n2 + 1;
          uint64_t n4 = logical_address % m_b[0];
          // logic: n4_max = m_b[0] - 1, m_s[0] = m_b[0] + 1, so n4 * m_s[0] = (m_b[0]^2 - 1) < m_b[1]
          uint64_t n5 = m_s[0] * n4;
          add_overflow(n3, n5);
          return n3 + n5;
        }
        case block_type::D: default: {
          uint64_t n1 = logical_address / m_b[1];
          mul_overflow(m_s[1], n1);
          uint64_t n2 = m_s[1] * n1;
          add_overflow(n2, 2);
          uint64_t n3 = n2 + 2;
          uint64_t n4 = (logical_address / m_b[0]) % m_b[0];
          // n4_max = m_b[0], m_s[0] = m_b[0] + 1, n4 * m_s[0] = (m_b[0]^2 - 1) < m_b[1]
          uint64_t n5 = (m_s[0] * n4);
          uint64_t n6 = logical_address % m_b[0];
          add_overflow(n3, n5);
          uint64_t n7 = n3 + n5;
          add_overflow(n7, n6);
          return n6 + n7;
        }
      }
    }

    address_info get_address_info(uint64_t physical_address) {
      address_info info;

      uint64_t super_block_idx = physical_address / m_s[1];
      uint64_t internal_offset = physical_address % m_s[1];

      if (internal_offset == 0) {
        info.type = block_type::M;
        info.logical_address = super_block_idx;
        return info;
      }

      uint64_t sub_offset = (internal_offset - 1) % m_s[0];
      uint64_t sub_idx = (internal_offset - 1) / m_s[0];

      if (sub_offset == 0) {
        info.type = block_type::I;
        // super_block_idx divided by m_s[1], bigger than m_b[0];
        uint64_t n1 = super_block_idx * m_b[0];
        add_overflow(n1, sub_idx);
        info.logical_address = n1 + sub_idx;
        return info;
      }

      info.type = block_type::D;
      // super_block_idx divided by m_s[1], bigger than m_b[1];
      uint64_t n1 = super_block_idx * m_b[1];
      // sub_idx is divided by m_s[0], bigger than m_b[0]
      uint64_t n2 = sub_idx * m_b[0];
      uint64_t n3 = sub_offset - 1;
      add_overflow(n1, n2);
      uint64_t n4 = n1 + n2;
      add_overflow(n4, n3);
      info.logical_address = n4 + n3;
      return info;
    }

    bit_location get_bit_location(uint64_t logical_address, block_type type) {
      if (type == block_type::M) throw error("block_type::M is top level block", heap_error::INV_ARG);
      block_type parent = type == block_type::I ? block_type::M : block_type::I;
      uint64_t bit_idx = logical_address % m_b[0];
      uint64_t parent_phys = get_physical_address(logical_address / m_b[0], parent);
      mul_overflow(parent_phys, m_block_size);
      uint64_t n1 = parent_phys * m_block_size;
      uint64_t n2 = (bit_idx / 8);
      add_overflow(n1, n2);
      return { n1 + n2, (uint8_t)(bit_idx % 8) };
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

    uint64_t get_data_block_offset(uint64_t logical_address) {
      uint64_t phyis = get_physical_address(logical_address, block_type::D);
      mul_overflow(phyis, m_block_size);
      return phyis * m_block_size;
    }

    blob_t read_block(uint64_t physical_address) {
      blob_t blob(m_block_size, 0);
      mul_overflow(physical_address, m_block_size);
      uint64_t block_offset = physical_address * m_block_size;
      m_fl.read_fd(blob.data(), m_block_size, block_offset);
      return blob;
    }

    void allocate_data_block(uint64_t logical_address, bool sync = false) {
      bit_location loc = get_bit_location(logical_address, block_type::D);
      uint64_t phyis = loc.byte_offset / m_block_size;
      uint64_t block_offset = phyis * m_block_size;
      uint8_t byte = 0;

      blob_t blob(m_block_size, 0);
      m_fl.read_fd(blob.data(), m_block_size, block_offset);
      std::memcpy(&byte, blob.data() + (loc.byte_offset - block_offset), 1);
      if (change_byte(byte, loc.bit_offset, byte_ops::READ) == 1) {
        throw error("Requested address is already allocated", heap_error::ALLOCATED);
      }

      uint8_t new_byte = change_byte(byte, loc.bit_offset, byte_ops::ONE);
      m_fl.write_fd(&new_byte, 1, loc.byte_offset, sync);
      for (uint64_t i = 0; i < m_block_size; i++) if (blob[i] != 0xFF) return;

      address_info i_logical_address = get_address_info(phyis);
      bit_location i_loc = get_bit_location(i_logical_address.logical_address, block_type::I);
      uint8_t M_byte = 0;
      m_fl.read_fd(&M_byte, 1, i_loc.byte_offset);
      uint8_t new_M_byte = change_byte(M_byte, i_loc.bit_offset, byte_ops::ONE);
      if (new_M_byte == M_byte) return;
      m_fl.write_fd(&new_M_byte, 1, i_loc.byte_offset, sync);
    }

    void free_data_block(uint64_t logical_address, bool sync = false) {
      bit_location i_location = get_bit_location(logical_address, block_type::D);
      uint64_t physical_address = i_location.byte_offset / m_block_size;
      uint64_t block_offset = physical_address * m_block_size;

      uint8_t byte = 0;
      blob_t blob(m_block_size, 0);
      m_fl.read_fd(blob.data(), m_block_size, block_offset);
      std::memcpy(&byte, blob.data() + (i_location.byte_offset - block_offset), 1);

      if (change_byte(byte, i_location.bit_offset, byte_ops::READ) == 0) return;
      uint8_t new_byte = change_byte(byte, i_location.bit_offset, byte_ops::ZERO);
      m_fl.write_fd(&new_byte, 1, i_location.byte_offset, sync);

      address_info M_logical_address = get_address_info(physical_address);
      bit_location M_location = get_bit_location(M_logical_address.logical_address, block_type::I);
      uint8_t M_byte = 0;
      m_fl.read_fd(&M_byte, 1, M_location.byte_offset);
      uint8_t new_M_byte = change_byte(M_byte, M_location.bit_offset, byte_ops::ZERO);
      if (new_M_byte == M_byte) return;
      m_fl.write_fd(&new_M_byte, 1, M_location.byte_offset, sync);
    }

    void find_data_block() {
      uint64_t M_logical_address = 0;
      while (true) {
        
      }
    }
};