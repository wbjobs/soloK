add_library(vk浮雕_edge STATIC
    edge_detector.cpp
    sobel_detector.cpp
)

target_link_libraries(vk浮雕_edge
    vk浮雕_core
    vk浮雕_vulkan
    ${Vulkan_LIBRARIES}
)
