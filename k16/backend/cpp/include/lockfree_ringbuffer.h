#pragma once

#include <vector>
#include <atomic>
#include <cstddef>
#include <new>

template <typename T>
class LockFreeRingBuffer {
public:
    explicit LockFreeRingBuffer(size_t capacity)
        : capacity_(capacity),
          buffer_(static_cast<T*>(std::malloc(sizeof(T) * capacity))),
          head_(0),
          tail_(0) {}

    ~LockFreeRingBuffer() {
        while (head_.load() != tail_.load()) {
            buffer_[head_.load() % capacity_].~T();
            head_.fetch_add(1);
        }
        std::free(buffer_);
    }

    LockFreeRingBuffer(const LockFreeRingBuffer&) = delete;
    LockFreeRingBuffer& operator=(const LockFreeRingBuffer&) = delete;

    template <typename... Args>
    bool emplace(Args&&... args) {
        size_t head = head_.load(std::memory_order_relaxed);
        size_t tail = tail_.load(std::memory_order_acquire);
        
        if (head - tail >= capacity_) {
            return false;
        }

        new (&buffer_[head % capacity_]) T(std::forward<Args>(args)...);
        head_.store(head + 1, std::memory_order_release);
        return true;
    }

    bool pop(T& item) {
        size_t tail = tail_.load(std::memory_order_relaxed);
        size_t head = head_.load(std::memory_order_acquire);
        
        if (tail == head) {
            return false;
        }

        item = std::move(buffer_[tail % capacity_]);
        buffer_[tail % capacity_].~T();
        tail_.store(tail + 1, std::memory_order_release);
        return true;
    }

    size_t size() const {
        return head_.load(std::memory_order_acquire) - tail_.load(std::memory_order_acquire);
    }

    bool empty() const {
        return head_.load(std::memory_order_acquire) == tail_.load(std::memory_order_acquire);
    }

    size_t capacity() const {
        return capacity_;
    }

private:
    const size_t capacity_;
    T* buffer_;
    std::atomic<size_t> head_;
    std::atomic<size_t> tail_;
};
