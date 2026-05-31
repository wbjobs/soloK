#pragma once

#include <string>
#include <sstream>
#include <iostream>

namespace vk浮雕 {

enum class LogLevel {
    DEBUG,
    INFO,
    WARNING,
    ERROR,
    FATAL
};

class Logger {
public:
    static Logger& instance();
    
    void setLevel(LogLevel level);
    LogLevel getLevel() const;
    
    void log(LogLevel level, const std::string& message);
    
private:
    Logger() = default;
    LogLevel m_level = LogLevel::INFO;
    
    const char* levelToString(LogLevel level) const;
};

class LogStream {
public:
    LogStream(LogLevel level, const char* file, int line);
    ~LogStream();
    
    std::ostream& stream() { return m_stream; }
    
private:
    LogLevel m_level;
    const char* m_file;
    int m_line;
    std::ostringstream m_stream;
};

#define LOG_DEBUG() vk浮雕::LogStream(vk浮雕::LogLevel::DEBUG, __FILE__, __LINE__).stream()
#define LOG_INFO() vk浮雕::LogStream(vk浮雕::LogLevel::INFO, __FILE__, __LINE__).stream()
#define LOG_WARNING() vk浮雕::LogStream(vk浮雕::LogLevel::WARNING, __FILE__, __LINE__).stream()
#define LOG_ERROR() vk浮雕::LogStream(vk浮雕::LogLevel::ERROR, __FILE__, __LINE__).stream()
#define LOG_FATAL() vk浮雕::LogStream(vk浮雕::LogLevel::FATAL, __FILE__, __LINE__).stream()

}
