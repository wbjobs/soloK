#include "vk浮雕/common.h"

namespace vk浮雕 {

Frame::Frame(uint32_t w, uint32_t h) {
    allocate(w, h);
}

void Frame::allocate(uint32_t w, uint32_t h) {
    width = w;
    height = h;
    data.resize(w * h * 4);
}

FrameFloat::FrameFloat(uint32_t w, uint32_t h) {
    allocate(w, h);
}

void FrameFloat::allocate(uint32_t w, uint32_t h) {
    width = w;
    height = h;
    data.resize(w * h);
}

}
