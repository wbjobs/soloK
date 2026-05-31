add_library(vk浮雕_vulkan STATIC
    vulkan_context.cpp
    vulkan_utils.cpp
    offscreen_renderer.cpp
    compute_pipeline.cpp
)

target_link_libraries(vk浮雕_vulkan
    vk浮雕_core
    ${Vulkan_LIBRARIES}
)
