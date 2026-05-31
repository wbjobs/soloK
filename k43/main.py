import argparse
import sys
import os

from image_parser import ImageParser
from point_cloud_generator import PointCloudGenerator
from ascii_renderer import ASCIIRenderer
from animation_controller import AnimationController, _enable_windows_vt100


def _print_colored_static(frame: str) -> None:
    _enable_windows_vt100()
    sys.stdout.buffer.write(frame.encode('utf-8'))
    sys.stdout.buffer.write(b'\n\x1b[0m')
    sys.stdout.buffer.flush()


def main():
    parser = argparse.ArgumentParser(
        description='Convert images to ASCII 3D point clouds with optional rotation animation.'
    )
    parser.add_argument(
        'image_path',
        type=str,
        help='Path to the input image file'
    )
    parser.add_argument(
        '--sample-rate',
        type=float,
        default=0.1,
        help='Image downsampling rate (0.01 to 1.0, default: 0.1)'
    )
    parser.add_argument(
        '--mode',
        type=str,
        choices=['static', 'dynamic'],
        default='static',
        help='Output mode: static (single frame) or dynamic (rotation animation)'
    )
    parser.add_argument(
        '--fps',
        type=int,
        default=30,
        help='Frames per second for dynamic mode (default: 30)'
    )
    parser.add_argument(
        '--rotation-speed',
        type=float,
        default=0.1,
        help='Rotation speed in radians per frame (default: 0.1)'
    )
    parser.add_argument(
        '--duration',
        type=float,
        default=10.0,
        help='Animation duration in seconds for dynamic mode (default: 10.0)'
    )
    parser.add_argument(
        '--continuous',
        action='store_true',
        help='Play animation continuously until interrupted (Ctrl+C)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Path to output file for exporting the result'
    )
    parser.add_argument(
        '--width',
        type=int,
        default=None,
        help='Override output width (default: matches downsampled image width)'
    )
    parser.add_argument(
        '--height',
        type=int,
        default=None,
        help='Override output height (default: matches downsampled image height)'
    )
    parser.add_argument(
        '--color',
        action='store_true',
        help='Enable 16-color ANSI coloring based on point depth (bright colors for near points, dark for far)'
    )

    args = parser.parse_args()

    if not os.path.exists(args.image_path):
        print(f"Error: Image file '{args.image_path}' not found.", file=sys.stderr)
        sys.exit(1)

    try:
        print("Loading and processing image...", file=sys.stderr)
        image_parser = ImageParser(args.image_path, args.sample_rate)
        pixels, width, height = image_parser.process()

        print(f"Image processed: {len(pixels)} pixels at {width}x{height}", file=sys.stderr)

        point_cloud_gen = PointCloudGenerator(pixels, width, height)
        point_cloud_gen.generate()

        render_width = args.width if args.width else width
        render_height = args.height if args.height else height

        renderer = ASCIIRenderer(render_width, render_height, use_color=args.color)

        anim_controller = AnimationController(
            point_cloud_gen,
            renderer,
            frames_per_second=args.fps,
            rotation_speed=args.rotation_speed
        )

        if args.mode == 'static':
            print("Rendering static frame...", file=sys.stderr)
            frame = anim_controller.render_static_frame()

            if args.color:
                _print_colored_static(frame)
            else:
                print(frame)

            if args.output:
                renderer.export_frame(args.output)
                print(f"Static frame exported to '{args.output}'", file=sys.stderr)

        else:
            if args.continuous:
                print("Playing continuous animation (Ctrl+C to stop)...", file=sys.stderr)
                anim_controller.play_animation_continuous()
            else:
                print(f"Playing animation for {args.duration} seconds...", file=sys.stderr)
                frames = anim_controller.print_animation(args.duration)

            if args.output:
                anim_controller.export_animation(args.output, args.duration)
                print(f"Animation exported to '{args.output}'", file=sys.stderr)

    except KeyboardInterrupt:
        print("\nOperation cancelled by user.", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
