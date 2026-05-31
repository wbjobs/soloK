add_executable(vk浮雕_cli
    main.cpp
    cli_parser.cpp
)

target_link_libraries(vk浮雕_cli
    vk浮雕_core
    vk浮雕_vulkan
    vk浮雕_video
    vk浮雕_edge
    vk浮雕_detection
    vk浮雕_renderer
    ${Vulkan_LIBRARIES}
    ${FFMPEG_LIBRARIES}
)
