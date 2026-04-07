#pragma once

#include <cstdint>
#include <cstring>
#include <cerrno>

#include <stdexcept>
#include <string>
#include <vector>

#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

class database_error : public std::runtime_error {
  public:
    std::string m_msg;
    int m_code;
    explicit database_error(const std::string& msg, int code):
      std::runtime_error(msg) {
        m_msg = msg;
        m_code = code;
      }
};

class database_storage {
  public:
    using m_blob_t = std::vector<uint8_t>;

    struct m_head_t {
      uint64_t key_size;
      uint64_t blob_size;
      uint64_t capacity;
    };

    struct m_wal_t {
      uint8_t marker;
      uint64_t index;
      m_blob_t blob;
    };

    m_head_t m_head;
    uint64_t m_head_size;
    uint64_t m_wal_size;
    uint64_t m_slot_size;

    std::string m_file_path;
    int m_fd;

    struct flock m_fl;
    bool m_locked;
};

class database: public database_storage {
  public:

    // ----- main -----

    explicit database(const std::string& file_path, const m_head_t& head) {
      _r(file_path, head);
    }

    ~database() {
      disconnect();
    }

    database(const database&) = delete;

    database& operator=(const database&) = delete;

    void _r(const std::string& file_path, const m_head_t& head) {
      if (head.key_size == 0 || head.blob_size == 0 || head.capacity == 0) {
        _e("invalid param", 0);
      }

      std::memset(&m_fl, 0, sizeof(m_fl));
      std::memcpy(&m_head, &head, sizeof(m_head));

      m_head_size = 8 + 8 + 8;
      m_wal_size = 1 + 8 + head.blob_size;
      m_slot_size = 1 + head.key_size + head.blob_size;

      m_file_path = file_path;
      m_fd = -1;

      m_fl.l_whence = SEEK_SET;
      m_fl.l_start = 0;
      m_fl.l_len = 0;
      m_locked = false;

      _init_head(head);
    }

    void _e(const std::string& msg, int code) {
      throw database_error(msg, code);
    }


    // ----- head ops -----

    m_head_t _read_head(const m_head_t& ideal) {
      m_head_t head;
      if (pread(m_fd, &head, m_head_size, 0) != m_head_size) {
        _e("corrupt read", 0);
      }

      bool invalid1 = head.key_size != ideal.key_size;
      bool invalid2 = head.blob_size != ideal.blob_size;
      bool invalid3 = head.capacity != ideal.capacity;
      if (invalid1 || invalid2 || invalid3) {
        _e("invalid properties", 0);
      }

      return head;
    }

    void _write_head(const m_head_t& head) {
      if (pwrite(m_fd, &head, m_head_size, 0) != m_head_size) {
        _e("corrupt write", 0);
      } else if (fsync(m_fd) == -1) {
        _e("corrupt sync", 0);
      }
    }

    void _init_head(const m_head_t& head) {
      connect();
      struct stat file_stat;
      if (fstat(m_fd, &file_stat) == -1) {
        _e("file inaccessible", 0);
      }

      (uint64_t)file_stat.st_size >= m_head_size
        ? (void)_read_head(head)
        : _write_head(head);
    }


    // ----- wal ops -----

    uint8_t read_wal_marker() {
      uint8_t marker = 0;
      switch (pread(m_fd, &marker, 1, m_head_size)) {
        case -1: _e("corrupt read", 0);
        case 0: return 0;
        default: return marker;
      }
    }

    m_wal_t _read_wal(bool soft = false) {
      uint8_t marker;
      uint64_t index;
      m_blob_t vec(m_head.blob_size, 0);

      uint64_t offset = m_head_size;
      uint64_t length = m_head.blob_size + 9;
      m_blob_t b(length, 0);

      ssize_t read_index = pread(m_fd, b.data(), length, offset);
      if (read_index == -1) {
        _e("corrupt read", 0);
      } else if (soft == false && (uint64_t)read_index != length) {
        _e("corrupt wal", 0);
      }

      std::memcpy(&marker, b.data(), 1);
      std::memcpy(&index, b.data() + 1, 8);
      std::memcpy(vec.data(), b.data() + 9, m_head.blob_size);
      return {marker, index, vec};
    }

    void _write_wal_marker(uint8_t marker, bool flush = false) {
      ssize_t written = pwrite(m_fd, &marker, 1, m_head_size);
      if (written != 1) {
        _e("corrupt write", 0);
      } else if (flush && fsync(m_fd) == -1) {
        _e("corrupt sync", 0);
      }
    }

    void _write_wal(uint64_t index, const m_blob_t& blob, bool flush = false) {
      m_blob_t vec(m_head.blob_size + 8, 0);
      std::memcpy(vec.data(), &index, 8);
      std::memcpy(vec.data() + 8, blob.data(), m_head.blob_size);

      uint64_t offset = m_head_size + 1;
      ssize_t written = pwrite(m_fd, vec.data(), vec.size(), offset);

      if (written != vec.size()) {
        _e("corrupt write", 0);
      } else if (flush && fsync(m_fd) == -1) {
        _e("corrupt sync", 0);
      }

      _write_wal_marker(1, flush);
    }

    void _fix_wal(bool flush = false) {
      uint8_t marker = read_wal_marker();
      if (marker == 0) return;
      m_wal_t wal = _read_wal();
      _write_blob(wal.index, wal.blob, flush);
      _write_wal_marker(0, flush);
    }


    // ----- slot ops -----

    uint8_t _read_marker(uint64_t index) {
      uint8_t marker = 0;
      switch (pread(m_fd, &marker, 1, _index_offset(index))) {
        case -1: _e("corrupt read", 0);
        case 0: return 0;
        default: return marker;
      }
    }

    m_blob_t _read_key(uint64_t index) {
      m_blob_t vec(m_head.key_size, 0);
      ssize_t read = pread(m_fd, vec.data(), vec.size(), _index_offset(index) + 1);
      if (read == vec.size()) return vec;
      _e("corrupt read", 0);
    }

    m_blob_t _read_blob(uint64_t index) {
      m_blob_t vec(m_head.blob_size, 0);
      ssize_t read = pread(m_fd, vec.data(), vec.size(), _index_offset(index) + 1 + m_head.key_size);
      if (read == vec.size()) return vec;
      _e("corrupt read", 0);
    }

    void _write_marker(uint64_t index, uint8_t marker, bool flush = false) {
      ssize_t written = pwrite(m_fd, &marker, 1, _index_offset(index));
      if (written != 1) {
        _e("corrupt write", 0);
      } else if (flush && fsync(m_fd) == -1) {
        _e("corrupt sync", 0);
      }
    }

    void _write_key(uint64_t index, const m_blob_t& key, bool flush = false) {
      uint64_t write_length = m_slot_size - 1 - m_head.blob_size;
      uint64_t write_offset = _index_offset(index) + 1;
      ssize_t written = pwrite(m_fd, key.data(), write_length, write_offset);
      if (written != write_length) {
        _e("corrupt write", 0);
      } else if (flush && fsync(m_fd) == -1) {
        _e("corrupt sync", 0);
      }
    }

    void _write_blob(uint64_t index, const m_blob_t& blob, bool flush = false) {
      uint64_t write_length = m_slot_size - 1 - m_head.key_size;
      uint64_t write_offset = _index_offset(index) + 1 + m_head.key_size;
      ssize_t written = pwrite(m_fd, blob.data(), write_length, write_offset);
      if (written != write_length) {
        _e("corrupt write", 0);
      } else if (flush && fsync(m_fd) == -1) {
        _e("corrupt sync", 0);
      }
    }


    // ----- math ops -----

    uint64_t _hash(const m_blob_t& blob, uint64_t capacity) noexcept {
      uint64_t mul = 10995116277761ULL;
      uint64_t hash = 14695981039346656037ULL;
      size_t i = 0;
      while (i < blob.size()) {
        hash = (hash ^ blob[i++]) * mul;
      }
      return hash % (uint64_t)capacity;
    }

    uint64_t _index_offset(uint64_t index) {
      return m_head_size + m_wal_size + (index * m_slot_size);
    }

    uint64_t _probe(const m_blob_t& key) {
      uint64_t index = _hash(key, m_head.capacity);
      uint64_t start = index;
      while (true) {
        uint8_t marker = _read_marker(index);
        if (marker == 0) _e("not found", 0);
        if (marker == 1 && _read_key(index) == key) return index;
        index = (index + 1) % m_head.capacity;
        if (index == start) {
          _e("not found", 0);
        }
      }
    }

    uint64_t _find(const m_blob_t& key) {
      uint64_t index = _hash(key, m_head.capacity);
      uint64_t start = index;
      bool tomb_found = false;
      uint64_t tomb_index = 0;
      while (true) {
        uint8_t marker = _read_marker(index);
        if (marker == 0) return tomb_found ? tomb_index : index;
        if (marker >= 2 && tomb_found == false) {
          tomb_found = true;
          tomb_index = index;
        } else if (marker == 1 && _read_key(index) == key) {
          _e("duplicate key", 0);
        }
        index = (index + 1) % m_head.capacity;
        if (index == start) {
          _e("database full", 0);
        }
      }
    }

    uint64_t _get_count() {
      uint64_t total = 0;
      uint64_t index = 0ULL;
      while (index < m_head.capacity) {
        uint8_t marker = _read_marker(index++);
        if (marker == 1) {
          total = total + 1;
        }
      }
      return total;
    }

    m_blob_t str_to_blob(const std::string& str, uint64_t size) {
      if (size == 0 || str.size() > size) {
        _e("invalid param", 0);
      }
      m_blob_t vec(size, 0);
      std::memcpy(vec.data(), str.data(), str.size());
      return vec;
    }


    // ----- file ops -----

    void connect() {
      if (m_fd != -1) return;
      m_fd = open(m_file_path.c_str(), O_RDWR | O_CREAT, 0644);
      if (m_fd == -1) {
        m_locked = false;
        _e("connect failed", 0);
      }
    }

    void disconnect() noexcept {
      m_locked = false;
      if (m_fd == -1) return;
      close(m_fd);
      m_fd = -1;
    }

    void lock() {
      if (m_fd == -1) connect();
      m_fl.l_type = F_WRLCK;
      if (fcntl(m_fd, F_SETLKW, &m_fl) == -1) {
        _e("lock failed", 0);
      }
      m_locked = true;
    }

    void unlock() noexcept {
      if (m_fd == -1) return;
      m_fl.l_type = F_UNLCK;
      fcntl(m_fd, F_SETLK, &m_fl);
      m_locked = false;
    }

    void _fd_valid() {
      if (fcntl(m_fd, F_GETFL) == -1 && errno == EBADF) {
        _e("file closed", 0);
      }
    }

    void _fl_valid() {
      if (m_locked == false) {
        _e("file unlocked", 0);
      }
    }


    // ----- dbs ops -----

    void insert(const m_blob_t& key, const m_blob_t& blob, bool flush = false) {
      _fd_valid();
      _fl_valid();
      if (key.size() != m_head.key_size || blob.size() != m_head.blob_size) {
        _e("invalid param", 0);
      }

      _fix_wal(flush);
      uint64_t index = _find(key);
      _write_key(index, key, flush);
      _write_blob(index, blob, flush);
      _write_marker(index, 1, flush);
    }

    void update(const m_blob_t& key, const m_blob_t& blob, bool flush = false) {
      _fd_valid();
      _fl_valid();
      if (key.size() != m_head.key_size || blob.size() != m_head.blob_size) {
        _e("invalid param", 0);
      }

      _fix_wal(flush);
      uint64_t index = _probe(key);
      _write_wal(index, blob, flush);
      _write_blob(index, blob, flush);
      _write_wal_marker(0, flush);
    }

    void remove(const m_blob_t& key, bool flush = false) {
      _fd_valid();
      _fl_valid();
      if (key.size() != m_head.key_size) {
        _e("invalid param", 0);
      }

      _fix_wal(flush);
      uint64_t index = _probe(key);
      _write_marker(index, 2, flush);
    }

    m_blob_t read(const m_blob_t& key) {
      _fd_valid();
      if (key.size() != m_head.key_size) {
        _e("invalid param", 0);
      }

      uint64_t index = _probe(key);
      m_wal_t wal = _read_wal(true);
      if (wal.marker != 0 && wal.index == index) return wal.blob;
      return _read_blob(index);
    }
};