add_library(vk浮雕_renderer STATIC
    normal_map.cpp
    lighting_renderer.cpp
    relief_pipeline.cpp
)

target_link_libraries(vk浮雕_renderer
    vk浮雕_core
    vk浮雕_vulkan
    vk浮雕_edge
    vk浮雕_detection
    ${Vulkan_LIBRARIES}
)
