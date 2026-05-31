add_executable(example_basic
    example_basic.cpp
)

target_link_libraries(example_basic
    vk浮雕_core
    vk浮雕_vulkan
    vk浮雕_video
    vk浮雕_edge
    vk浮雕_renderer
    ${Vulkan_LIBRARIES}
    ${FFMPEG_LIBRARIES}
)

add_executable(example_custom_edge
    example_custom_edge.cpp
)

target_link_libraries(example_custom_edge
    vk浮雕_core
    vk浮雕_vulkan
    vk浮雕_video
    vk浮雕_edge
    vk浮雕_renderer
    ${Vulkan_LIBRARIES}
    ${FFMPEG_LIBRARIES}
)
