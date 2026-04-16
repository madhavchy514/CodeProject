#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "error.hpp"
#include "file.hpp"

class heap {
  public:
    struct bit_location {
      uint64_t map_offset;
      uint64_t byte_offset;
      uint8_t bit_index;
    };

    heap(const heap&) = delete;
    heap& operator=(const heap&) = delete;

    explicit heap(const std::string& file_path, uint64_t page_size): m_fl(file_path) {
      m_page_size = page_size == 0 ? 4096 : page_size;
    }

    uint64_t pointer_offset(uint64_t pointer) {
      uint64_t b = m_page_size * 8;
      uint64_t physical_index = pointer + 1 + (pointer / b);
      return physical_index * m_page_size;
    }

    bit_location pointer_bitmap(uint64_t pointer) {
      uint64_t b = m_page_size * 8;
      uint64_t group = pointer / b;
      uint64_t relative = pointer % b;
      bit_location loc;
      loc.map_offset = group * (b + 1) * m_page_size;
      loc.byte_offset = relative / 8;
      loc.bit_index = relative % 8;
      return loc;
    }

    void free_pointer(uint64_t pointer, bool sync = false) {
      bit_location loc = pointer_bitmap(pointer);
      uint64_t offset = loc.map_offset + loc.byte_offset;
      uint8_t byte = 0;
      m_fl.read(&byte, 1, offset);
      byte &= ~(1 << loc.bit_index);
      m_fl.write(&byte, 1, offset, sync);
    }

    void allocate_pointer(uint64_t pointer, bool sync = false) {
      bit_location loc = pointer_bitmap(pointer);
      uint64_t offset = loc.map_offset + loc.byte_offset;
      uint8_t byte = 0;
      m_fl.read(&byte, 1, offset);
      byte |= (1 << loc.bit_index);
      m_fl.write(&byte, 1, offset, sync);
    }

    uint64_t get_pointer() {
      uint64_t b = m_page_size * 8;
      std::vector<uint8_t> vector(m_page_size);
      for (uint64_t group = 0;; group++) {
        uint64_t map_off = group * (b + 1) * m_page_size;
        std::fill(vector.begin(), vector.end(), 0);
        m_fl.read(vector.data(), m_page_size, map_off);
        for (uint64_t j = 0; j < m_page_size; j++) {
          if (vector[j] == 0xFF) continue;
          for (uint8_t bit = 0; bit < 8; bit++) {
            if (!(vector[j] & (1 << bit))) {
              uint64_t pointer = (group * b) + (j * 8) + bit;
              return pointer;
            }
          }
        }
      }
    }

  private:
    file m_fl;
    uint64_t m_page_size;
};