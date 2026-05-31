find_package(pybind11 REQUIRED)

pybind11_add_module(vk浮雕_python
    vk浮雕_python.cpp
)

target_link_libraries(vk浮雕_python PRIVATE
    vk浮雕_core
    vk浮雕_vulkan
    vk浮雕_video
    vk浮雕_edge
    vk浮雕_detection
    vk浮雕_renderer
    ${Vulkan_LIBRARIES}
    ${FFMPEG_LIBRARIES}
)

set_target_properties(vk浮雕_python PROPERTIES
    OUTPUT_NAME "vk浮雕"
)
