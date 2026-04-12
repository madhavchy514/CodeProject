#pragma once

#include <stdexcept>
#include <string>

class error : public std::runtime_error {
  public:
    std::string m_msg;
    int m_code;
    explicit error(const std::string& msg, int code):
      std::runtime_error(msg) {
        m_msg = msg;
        m_code = code;
      }
};