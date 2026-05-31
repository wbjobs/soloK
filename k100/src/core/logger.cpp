#include "vk浮雕/logger.h"
#include <chrono>
#include <iomanip>
#include <ctime>

namespace vk浮雕 {

Logger& Logger::instance() {
    static Logger instance;
    return instance;
}

void Logger::setLevel(LogLevel level) {
    m_level = level;
}

LogLevel Logger::getLevel() const {
    return m_level;
}

void Logger::log(LogLevel level, const std::string& message) {
    if (level < m_level) return;
    
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    
    std::tm tm;
    localtime_s(&tm, &time);
    
    std::cerr << "[" << std::put_time(&tm, "%Y-%m-%d %H:%M:%S") 
              << "." << std::setfill('0') << std::setw(3) << ms.count()
              << "] [" << levelToString(level) << "] " 
              << message << std::endl;
    
    if (level == LogLevel::FATAL) {
        abort();
    }
}

const char* Logger::levelToString(LogLevel level) const {
    switch (level) {
        case LogLevel::DEBUG: return "DEBUG";
        case LogLevel::INFO: return "INFO";
        case LogLevel::WARNING: return "WARNING";
        case LogLevel::ERROR: return "ERROR";
        case LogLevel::FATAL: return "FATAL";
        default: return "UNKNOWN";
    }
}

LogStream::LogStream(LogLevel level, const char* file, int line)
    : m_level(level), m_file(file), m_line(line) {
}

LogStream::~LogStream() {
    std::string message = m_stream.str();
    Logger::instance().log(m_level, message);
}

}
