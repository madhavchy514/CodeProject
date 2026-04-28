#pragma once

#include <stdexcept>
#include <string>
#include <vector>

#include <cstring>
#include <cstdint>
#include <cerrno>

#include <sys/file.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

class AppError: public std::runtime_error {
  private:
    int code_;

  public:
    explicit AppError(const std::string& msg, int code)
      : std::runtime_error(msg), code_(code) {}

    std::string msg() const {
      return std::string(what());
    }

    int code() const {
      return code_;
    }
};

class File {
  private:
    int fd_;
    std::string path_;

    bool lock_;
    struct flock fl_;

    void _e(const std::string& msg, int code) {
      throw AppError(msg, code);
    }

  public:
    enum FileError {
      PARTIAL_WRITE = 1000,
      STORAGE_SYNC
    };

    File(const File&) = delete;
    File& operator=(const File&) = delete;

    explicit File(const std::string& path): path_(path), fd_(-1), lock_(false) {
      fl_.l_len = 0;
      fl_.l_start = 0;
      fl_.l_whence = SEEK_SET;
    }

    ~File() {
      close();
    }

    void open() {
      if (fd_ == -1) {
        fd_ = ::open(path_.c_str(), (O_RDWR | O_CREAT), 0644);
        if (fd_ == -1) {
          lock_ = false;
          _e("Failed to open file", errno);
        }
      }
    }

    void close() {
      lock_ = false;
      if (fd_ != -1) {
        ::close(fd_);
        fd_ = -1;
      }
    }

    void lock() {
      open();
      if (!lock_) {
        fl_.l_type = F_WRLCK;
        if (fcntl(fd_, F_SETLKW, &fl_) == -1) {
          _e("Failed to lock file", errno);
        } else {
          lock_ = true;
        }
      }
    }

    void unlock() {
      if (lock_) {
        fl_.l_type = F_UNLCK;
        if (fcntl(fd_, F_SETLK, &fl_) == -1) {
          _e("Failed to unlock file", errno);
        } else {
          lock_ = false;
        }
      }
    }

    void sync() {
      open();
      if (::fsync(fd_) == -1) {
        _e("Failed to sync file", FileError::STORAGE_SYNC);
      }
    }

    uint64_t read(void* buf, uint64_t len, uint64_t off) {
      open();
      ssize_t result = pread(fd_, buf, len, off);
      if (result == -1) {
        _e("Failed to read file", errno);
      } else {
        return static_cast<uint64_t>(result);
      }
    }

    void write(const void* buf, uint64_t len, uint64_t off, bool flush = false) {
      open();
      ssize_t result = pwrite(fd_, buf, len, off);
      if (result == -1) {
        _e("Failed to write file", errno);
      } else if (result != len) {
        _e("Failed to write full length in file", FileError::PARTIAL_WRITE);
      } else if (flush) {
        sync();
      }
    }

    struct stat info() {
      open();
      struct stat st;
      if (::fstat(fd_, &st) == -1) {
        _e("Failed to stat file", errno);
      } else {
        return st;
      }
    }

    void rename(const std::string& path) {
      open();
      if (::rename(path_.c_str(), path.c_str()) == -1) {
        _e("Failed to rename file", errno);
      } else {
        path_ = path;
      }
    }
};

class Database {
  protected:
    File f_;

    void _e(const std::string& msg, int code) {
      throw AppError(msg, code);
    }

    uint64_t add(uint64_t a, uint64_t b) {
      if (a <= UINT64_MAX - b) return a + b;
      _e("Add overflow occured", DatabaseError::ADD_OVERFLOW);      
    }

    uint64_t mul(uint64_t a, uint64_t b) {
      if (a == 0 || b == 0 || a <= UINT64_MAX / b) return a * b;
      _e("Multiplication overflow occured", DatabaseError::MUL_OVERFLOW);      
    }

  public:
    using blob_t = std::vector<uint8_t>;

    enum DatabaseError: int {
      ADD_OVERFLOW = 1000, MUL_OVERFLOW, INV_ARG
    };

    struct block_marker_key_t {
      uint8_t marker;
      blob_t key;
    };

    struct basic_info_t {
      uint64_t capacity;
      uint64_t key_size;
      uint64_t blob_size;
    };

    struct size_info_t {
      uint64_t block_size_;
      uint64_t marker_key_size_;
      uint64_t key_blob_size_;
      uint64_t wal_size_;
    };

    struct wal_t {
      uint8_t size_marker;
      int8_t size_direction;
      uint64_t size;
      uint8_t block_marker;
      uint64_t block;
      blob_t key;
      blob_t blob;
    };

    basic_info_t basic_info_;
    size_info_t size_info_;

    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    explicit Database(const std::string& path, basic_info_t basic_info): f_(path), basic_info_(basic_info) {
      if (basic_info.capacity == 0 || basic_info.key_size == 0 || basic_info.blob_size == 0) {
        throw AppError("Invalid info given", DatabaseError::INV_ARG);
      }
      size_info_.block_size_ = add(1, add(basic_info_.key_size, basic_info_.blob_size));
      size_info_.wal_size_ = add(1 + 1 + 1 + 8 + 8, add(basic_info_.blob_size, basic_info_.key_size));
      size_info_.marker_key_size_ = 1 + basic_info_.key_size;
      size_info_.key_blob_size_ = basic_info_.key_size + basic_info_.blob_size;
    }


    // ----- block operations -----

    uint64_t get_block_offset(uint64_t block, uint64_t extra = 0) {
      return add(add(size_info_.wal_size_, mul(size_info_.block_size_, block)), extra);
    }

    block_marker_key_t read_block_marker_key(uint64_t block) {
      blob_t vec(size_info_.marker_key_size_, 0);
      f_.read(vec.data(), size_info_.marker_key_size_, get_block_offset(block));
      block_marker_key_t b;
      b.marker = vec[0];
      b.key = blob_t(basic_info_.key_size);
      std::memcpy(b.key.data(), vec.data() + 1, basic_info_.key_size);
      return b;
    }

    blob_t read_block_blob(uint64_t block) {
      blob_t vec(basic_info_.blob_size, 0);
      f_.read(vec.data(), basic_info_.blob_size, get_block_offset(block, size_info_.marker_key_size_));
      return vec;
    }

    void write_block_marker(uint64_t block, uint8_t value, bool flush = false) {
      f_.write(&value, 1, get_block_offset(block), flush);
    }

    void write_block_key_blob(uint64_t block, blob_t key, blob_t blob, bool flush = false) {
      blob_t vec(size_info_.key_blob_size_);
      std::memcpy(vec.data(), key.data(), basic_info_.key_size);
      std::memcpy(vec.data() + basic_info_.key_size, blob.data(), basic_info_.blob_size);
      f_.write(vec.data(), size_info_.key_blob_size_, get_block_offset(block, 1), flush);
    }
};