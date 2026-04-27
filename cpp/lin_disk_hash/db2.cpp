#include <stdexcept>
#include <string>
#include <vector>

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
    enum class FileError {
      PARTIAL_WRITE = 1000,
      SYNC_FAILED
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
        int code = static_cast<int>(FileError::SYNC_FAILED);
        _e("Failed to sync file", code);
      }
    }

    void write(const void* buf, uint64_t len, uint64_t off, bool flush = false) {
      open();
      ssize_t result = pwrite(fd_, buf, len, off);
      if (result == -1) {
        _e("Failed to write file", errno);
      } else if (result != len) {
        int code = static_cast<int>(FileError::PARTIAL_WRITE);
        _e("Failed to write full length in file", code);
      } else if (flush) {
        sync();
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
    uint64_t capacity_;
    uint64_t block_;
    File f_;

    void _e(const std::string& msg, int code) {
      throw AppError(msg, code);
    }

    uint64_t add(uint64_t a, uint64_t b) {
      if (a <= UINT64_MAX - b) return a + b;
      int code = static_cast<int>(DatabaseError::ADD_OVERFLOW);
      _e("Add overflow occured", code);      
    }

    uint64_t mul(uint64_t a, uint64_t b) {
      if (a == 0 || b == 0 || a <= UINT64_MAX / b) return a * b;
      int code = static_cast<int>(DatabaseError::MUL_OVERFLOW);
      _e("Multiplication overflow occured", code);      
    }

    void read_block(uint64_t block, void* buf) {
      f_.read(buf, add(block_, 1), mul(block, block_));
    }

  public:

    enum class DatabaseError {
      ADD_OVERFLOW, MUL_OVERFLOW
    };

    using byte_t = uint8_t;
    using blob_t = std::vector<byte_t>;

    struct db_info {
      uint64_t block;
      uint64_t key_size;
      uint64_t capacity;
    };

    db_info info_;

    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    explicit Database(const std::string& path, db_info info): f_(path) {
      info_.capacity = info.capacity == 0 ? 10000 : info.capacity;
      info_.block = info.block == 0 ? 4096 : info.block;
    }


};