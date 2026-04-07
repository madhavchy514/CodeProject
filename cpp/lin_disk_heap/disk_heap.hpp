#pragma once

#include <cstdint>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdexcept>
#include <string>
#include <vector>

class app_error : public std::runtime_error {
  public:
    std::string m_msg;
    int m_code;
    explicit app_error(const std::string& msg, int code): std::runtime_error(msg) {
      m_msg = msg;
      m_code = code;
    }
};

class file {
  public:
    std::string m_file_path;
    int m_fd;

    struct flock m_fl;
    bool m_locked;

    explicit file(const std::string& file_path) {
      m_file_path = file_path;
      m_fd = -1;

      m_fl.l_whence = SEEK_SET;
      m_fl.l_start = 0;
      m_fl.l_len = 0;
      m_locked = false;

      open_fd();
      if (!S_ISREG(stat_fd().st_mode)) {
        throw app_error("given path is not file", 0);
      }
    }

    ~file() {
      close_fd();
    }

    void open_fd() {
      if (m_fd != -1) return;
      m_fd = open(m_file_path.c_str(), O_RDWR | O_CREAT, 0644);
      if (m_fd == -1) {
        m_locked = false;
        throw app_error("connect failed", 0);
      }
    }

    void close_fd() noexcept {
      m_locked = false;
      if (m_fd == -1) return;
      close(m_fd);
      m_fd = -1;
    }

    void lock_fd() {
      if (m_fd == -1) open_fd();
      m_fl.l_type = F_WRLCK;
      if (fcntl(m_fd, F_SETLKW, &m_fl) == -1) {
        throw app_error("lock failed", 0);
      }
      m_locked = true;
    }

    void unlock_fd() noexcept {
      if (m_fd == -1) return;
      m_fl.l_type = F_UNLCK;
      fcntl(m_fd, F_SETLK, &m_fl);
      m_locked = false;
    }

    void valid_fd(bool check_lock = false) {
      if (fcntl(m_fd, F_GETFL) == -1 && errno == EBADF) {
        throw app_error("file closed", 0);
      } else if (m_locked == false) {
        throw app_error("file unlocked", 0);
      }
    }

    struct stat stat_fd() {
      struct stat file_stat;
      if (fstat(m_fd, &file_stat) == -1) {
        throw app_error("file inaccessible", 0);
      }
      return file_stat;
    }

    uint64_t read_fd(void* buf, uint64_t len, uint64_t off, bool soft = false) {
      if (buf == NULL) throw app_error("null buf", 0);
      uint64_t readen = pread(m_fd, buf, len, off);
      if (readen == -1 || (!soft && len != readen)) {
        throw app_error("read failed", 0);
      }
      return readen;
    }

    uint64_t write_fd(const void* buf, uint64_t len, uint64_t off, bool flush = false, bool soft = false) {
      if (buf == NULL) throw app_error("null buf", 0);
      uint64_t written = pwrite(m_fd, buf, len, off);
      if (written == -1 || (!soft && len != written)) {
        throw app_error("write failed", 0);
      } else if (flush && fsync(m_fd) != 0) {
        throw app_error("sync failed", 0);
      }
      return written;
    }
};

class disk_heap: public file {
  public:
    struct BitLocation {
      uint64_t map_offset;
      uint64_t byte_offset;
      uint8_t bit_index;
    };

    uint64_t m_page_size;
    uint64_t m_max_page;

    explicit disk_heap(const std::string& file_path, uint64_t page_size = 4096ULL, uint64_t max_page = 1000000ULL):
      file(file_path), m_page_size(page_size), m_max_page(max_page) {
        if (page_size == 0 || max_page == 0) {
          throw app_error("page size cannot be 0", 0);
        }

        open_fd();
        if (!S_ISREG(stat_fd().st_mode)) {
          throw app_error("given path is not file", 0);
        }
      }

    uint64_t pointer_offset(uint64_t pointer) {
      uint64_t b = m_page_size * 8;
      uint64_t physical_index = pointer + 1 + (pointer / b);
      return physical_index * m_page_size;
    }

    BitLocation pointer_bitmap(uint64_t pointer) {
      uint64_t b = m_page_size * 8;
      uint64_t group = pointer / b;
      uint64_t relative = pointer % b;

      BitLocation loc;
      loc.map_offset = group * (b + 1) * m_page_size;
      loc.byte_offset = relative / 8;
      loc.bit_index = relative % 8;

      return loc;
    }

    void free_pointer(uint64_t pointer, bool flush = false) {
      BitLocation loc = pointer_bitmap(pointer);
      uint64_t offset = loc.map_offset + loc.byte_offset;
      uint8_t byte = 0;
      read_fd(&byte, 1, offset, true);
      byte &= ~(1 << loc.bit_index);
      write_fd(&byte, 1, offset, flush);
    }

    void allocate_pointer(uint64_t pointer, bool flush = false) {
      BitLocation loc = pointer_bitmap(pointer);
      uint64_t offset = loc.map_offset + loc.byte_offset;
      uint8_t byte = 0;
      read_fd(&byte, 1, offset, true);
      byte |= (1 << loc.bit_index);
      write_fd(&byte, 1, offset, flush);
    }

    uint64_t get_pointer() {
      uint64_t group = 0;
      uint64_t b = m_page_size * 8;
      std::vector<uint8_t> vector(m_page_size);
      while(true) {
        uint64_t map_off = group * (b + 1) * m_page_size;
        std::fill(vector.begin(), vector.end(), 0);
        read_fd(vector.data(), m_page_size, map_off, true);
        for (uint64_t j = 0; j < m_page_size; j++) {
          if (vector[j] == 0xFF) continue;
          for (uint8_t bit = 0; bit < 8; bit++) {
            if (!(vector[j] & (1 << bit))) {
              uint64_t pointer = (group * b) + (j * 8) + bit;
              return pointer;
            }
          }
        }
        if (m_max_page <= group) throw app_error("out of capacity", 0);
        group++;
      }
    }
};