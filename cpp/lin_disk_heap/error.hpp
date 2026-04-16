#pragma once

#include <exception>
#include <string>

class error : public std::exception {
  public:
    explicit error(std::string msg, int code): m_msg(std::move(msg)), m_code(code) {}
    const char* what() const noexcept override { return m_msg.c_str(); }
    int code() const noexcept { return m_code; }
  private:
    std::string m_msg;
    int m_code;
};