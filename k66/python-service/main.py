import os
import time
import sys
import platform
import logging
import subprocess
import threading
import uuid
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import requests

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:3001')
PYAUTOGUI_FAILSAFE = os.getenv('PYAUTOGUI_FAILSAFE', 'true').lower() == 'true'
PYAUTOGUI_PAUSE = float(os.getenv('PYAUTOGUI_PAUSE', '0.1'))

SYSTEM = platform.system()
IS_MACOS = SYSTEM == 'Darwin'
IS_WINDOWS = SYSTEM == 'Windows'
IS_LINUX = SYSTEM == 'Linux'

NODE_ID = os.getenv('NODE_ID', f'node_{uuid.uuid4().hex[:8]}')
NODE_NAME = os.getenv('NODE_NAME', f'Edge Node {NODE_ID}')
NODE_LOCATION = os.getenv('NODE_LOCATION', 'local')
HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '10000'))

pyautogui = None
input_method = 'pyautogui'
has_accessibility_permission = False


def init_pyautogui():
    global pyautogui, has_accessibility_permission
    try:
        import pyautogui as pg
        pyautogui = pg
        pyautogui.FAILSAFE = PYAUTOGUI_FAILSAFE
        pyautogui.PAUSE = PYAUTOGUI_PAUSE
        return True
    except ImportError:
        logger.warning('pyautogui not available')
        return False
    except Exception as e:
        logger.warning(f'pyautogui initialization failed: {e}')
        return False


def check_macos_accessibility_permission():
    if not IS_MACOS:
        return True
    try:
        script = '''
        tell application "System Events"
            return "System Events is running"
        end tell
        '''
        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True,
            timeout=2
        )
        return result.returncode == 0
    except Exception:
        return False


def init_input_method():
    global input_method, has_accessibility_permission
    
    if IS_MACOS:
        has_accessibility_permission = check_macos_accessibility_permission()
        if has_accessibility_permission and init_pyautogui():
            input_method = 'pyautogui'
            logger.info('Using pyautogui for input simulation')
        else:
            input_method = 'applescript'
            logger.info('Using AppleScript for input simulation (Accessibility permission required)')
            if not has_accessibility_permission:
                logger.warning('⚠️  Accessibility permission not granted!')
                logger.warning('   Please go to System Preferences > Security & Privacy > Privacy > Accessibility')
                logger.warning('   and add your terminal / Python application to the list')
    else:
        if init_pyautogui():
            input_method = 'pyautogui'
            logger.info('Using pyautogui for input simulation')
        else:
            input_method = 'none'
            logger.error('No input method available')


def confirm_event(event_id, python_timestamp):
    try:
        response = requests.post(
            f'{BACKEND_URL}/api/events/confirm',
            json={
                'eventId': str(event_id),
                'pythonTimestamp': python_timestamp
            },
            timeout=5
        )
        if response.status_code != 200:
            logger.warning(f'Failed to confirm event {event_id}: {response.status_code}')
    except Exception as e:
        logger.warning(f'Error confirming event {event_id}: {e}')


def handle_mouse_click_pyautogui(data):
    x = data.get('x')
    y = data.get('y')
    button = data.get('button', 'left')
    screen_width = data.get('screenWidth', 1920)
    screen_height = data.get('screenHeight', 1080)

    host_width, host_height = pyautogui.size()
    
    scaled_x = int((x / screen_width) * host_width)
    scaled_y = int((y / screen_height) * host_height)

    pyautogui.click(scaled_x, scaled_y, button=button)
    logger.info(f'Mouse click (pyautogui): {button} at ({scaled_x}, {scaled_y})')


def handle_mouse_click_applescript(data):
    x = data.get('x')
    y = data.get('y')
    button = data.get('button', 'left')
    screen_width = data.get('screenWidth', 1920)
    screen_height = data.get('screenHeight', 1080)
    
    try:
        host_width, host_height = get_screen_size_applescript()
        scaled_x = int((x / screen_width) * host_width)
        scaled_y = int((y / screen_height) * host_height)
        
        script = f'''
        tell application "System Events"
            click at {{{scaled_x}, {scaled_y}}}
        end tell
        '''
        
        subprocess.run(['osascript', '-e', script], capture_output=True)
        logger.info(f'Mouse click (AppleScript): {button} at ({scaled_x}, {scaled_y})')
    except Exception as e:
        logger.error(f'AppleScript mouse click failed: {e}')


def get_screen_size_applescript():
    try:
        script = '''
        tell application "Finder"
            set screenSize to bounds of window of desktop
            return screenSize
        end tell
        '''
        result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
        if result.returncode == 0:
            parts = result.stdout.strip().split(', ')
            return int(parts[2]), int(parts[3])
    except:
        pass
    return 1920, 1080


def handle_key_press_pyautogui(data):
    key = data.get('key')
    code = data.get('code', '')
    
    ctrl_key = data.get('ctrlKey', False)
    shift_key = data.get('shiftKey', False)
    alt_key = data.get('altKey', False)
    meta_key = data.get('metaKey', False)

    modifiers = []
    if ctrl_key:
        modifiers.append('ctrl')
    if shift_key:
        modifiers.append('shift')
    if alt_key:
        modifiers.append('alt')
    if meta_key:
        modifiers.append('command')

    py_key = map_key_to_pyautogui(key, code)
    
    if modifiers:
        with pyautogui.hold(modifiers):
            pyautogui.press(py_key)
        logger.info(f'Key press with modifiers (pyautogui): {modifiers} + {py_key}')
    else:
        pyautogui.press(py_key)
        logger.info(f'Key press (pyautogui): {py_key}')


def handle_key_press_applescript(data):
    key = data.get('key')
    code = data.get('code', '')
    
    ctrl_key = data.get('ctrlKey', False)
    shift_key = data.get('shiftKey', False)
    alt_key = data.get('altKey', False)
    meta_key = data.get('metaKey', False)
    
    py_key = map_key_to_applescript(key, code)
    
    using = []
    if ctrl_key:
        using.append('control down')
    if shift_key:
        using.append('shift down')
    if alt_key:
        using.append('option down')
    if meta_key:
        using.append('command down')
    
    using_str = ', '.join(using) if using else ''
    
    try:
        if using_str:
            script = f'''
            tell application "System Events"
                keystroke "{py_key}" using {{{using_str}}}
            end tell
            '''
        else:
            script = f'''
            tell application "System Events"
                keystroke "{py_key}"
            end tell
            '''
        
        subprocess.run(['osascript', '-e', script], capture_output=True)
        logger.info(f'Key press (AppleScript): {py_key}')
    except Exception as e:
        logger.error(f'AppleScript key press failed: {e}')


def handle_key_release_pyautogui(data):
    key = data.get('key')
    code = data.get('code', '')
    py_key = map_key_to_pyautogui(key, code)
    logger.info(f'Key release (pyautogui): {py_key}')


def handle_key_release_applescript(data):
    key = data.get('key')
    code = data.get('code', '')
    py_key = map_key_to_applescript(key, code)
    logger.info(f'Key release (AppleScript): {py_key}')


def map_key_to_pyautogui(key, code):
    key_map = {
        'Enter': 'enter',
        'Escape': 'esc',
        'Tab': 'tab',
        'Backspace': 'backspace',
        'Delete': 'delete',
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right',
        ' ': 'space',
        'Control': 'ctrl',
        'Shift': 'shift',
        'Alt': 'alt',
        'Meta': 'command',
        'CapsLock': 'capslock',
        'F1': 'f1',
        'F2': 'f2',
        'F3': 'f3',
        'F4': 'f4',
        'F5': 'f5',
        'F6': 'f6',
        'F7': 'f7',
        'F8': 'f8',
        'F9': 'f9',
        'F10': 'f10',
        'F11': 'f11',
        'F12': 'f12',
    }
    
    if key in key_map:
        return key_map[key]
    
    if code.startswith('Digit'):
        return code[-1]
    
    if code.startswith('Key'):
        return key.lower()
    
    return key.lower() if len(key) == 1 else key


def map_key_to_applescript(key, code):
    key_map = {
        'Enter': 'return',
        'Escape': 'escape',
        'Tab': 'tab',
        'Backspace': 'delete',
        'Delete': 'forward delete',
        'ArrowUp': 'up arrow',
        'ArrowDown': 'down arrow',
        'ArrowLeft': 'left arrow',
        'ArrowRight': 'right arrow',
        ' ': 'space',
    }
    
    if key in key_map:
        return key_map[key]
    
    if code.startswith('Digit'):
        return code[-1]
    
    return key


def handle_mouse_click(data):
    if input_method == 'pyautogui' and pyautogui:
        handle_mouse_click_pyautogui(data)
    elif input_method == 'applescript':
        handle_mouse_click_applescript(data)
    else:
        logger.warning('No input method available for mouse click')


def handle_key_press(data):
    if input_method == 'pyautogui' and pyautogui:
        handle_key_press_pyautogui(data)
    elif input_method == 'applescript':
        handle_key_press_applescript(data)
    else:
        logger.warning('No input method available for key press')


def handle_key_release(data):
    if input_method == 'pyautogui' and pyautogui:
        handle_key_release_pyautogui(data)
    elif input_method == 'applescript':
        handle_key_release_applescript(data)
    else:
        logger.warning('No input method available for key release')


def register_with_backend():
    try:
        url = f'{BACKEND_URL}/api/nodes/register'
        response = requests.post(url, json={
            'nodeId': NODE_ID,
            'name': NODE_NAME,
            'url': f'http://{platform.node()}:{os.getenv("PORT", "5000")}',
            'location': NODE_LOCATION,
            'system': SYSTEM
        }, timeout=5)
        if response.status_code == 200:
            logger.info(f'Registered with backend as {NODE_ID}')
            return True
    except Exception as e:
        logger.warning(f'Failed to register with backend: {e}')
    return False


def send_heartbeat():
    while True:
        try:
            if IS_MACOS:
                if input_method == 'applescript':
                    screen_size = get_screen_size_applescript()
                elif pyautogui:
                    screen_size = pyautogui.size()
                else:
                    screen_size = (0, 0)
            else:
                screen_size = pyautogui.size() if pyautogui else (0, 0)
            
            health_data = {
                'screen_size': screen_size,
                'input_method': input_method,
                'accessibility_permission': has_accessibility_permission
            }
            response = requests.post(
                f'{BACKEND_URL}/api/nodes/heartbeat',
                json={'nodeId': NODE_ID, **health_data},
                timeout=3
            )
            if response.status_code != 200:
                register_with_backend()
        except Exception as e:
            logger.debug(f'Heartbeat failed: {e}')
        time.sleep(HEARTBEAT_INTERVAL / 1000)


def start_heartbeat_thread():
    thread = threading.Thread(target=send_heartbeat, daemon=True)
    thread.start()
    logger.info('Heartbeat thread started')


@app.route('/event', methods=['POST'])
def receive_event():
    python_timestamp = int(time.time() * 1000)
    
    try:
        event_data = request.get_json()
        event_id = event_data.get('eventId')
        event_type = event_data.get('type')
        data = event_data.get('data', {})

        logger.info(f'Received event: {event_type}')

        if event_type == 'mouse_click':
            handle_mouse_click(data)
        elif event_type == 'mouse_move':
            pass
        elif event_type == 'key_press':
            handle_key_press(data)
        elif event_type == 'key_release':
            handle_key_release(data)
        else:
            logger.warning(f'Unknown event type: {event_type}')
            return jsonify({'error': 'Unknown event type'}), 400

        confirm_event(event_id, python_timestamp)

        return jsonify({'success': True, 'pythonTimestamp': python_timestamp})

    except Exception as e:
        logger.error(f'Error processing event: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    try:
        if IS_MACOS:
            if input_method == 'applescript':
                screen_size = get_screen_size_applescript()
            elif pyautogui:
                screen_size = pyautogui.size()
            else:
                screen_size = (0, 0)
        else:
            screen_size = pyautogui.size() if pyautogui else (0, 0)
        
        return jsonify({
            'status': 'healthy',
            'system': SYSTEM,
            'input_method': input_method,
            'accessibility_permission': has_accessibility_permission,
            'screen_size': {
                'width': screen_size[0],
                'height': screen_size[1]
            },
            'timestamp': int(time.time() * 1000)
        })
    except Exception as e:
        return jsonify({
            'status': 'degraded',
            'error': str(e),
            'input_method': input_method
        }), 500


@app.route('/permission', methods=['GET'])
def permission_info():
    return jsonify({
        'system': SYSTEM,
        'input_method': input_method,
        'accessibility_permission': has_accessibility_permission,
        'setup_needed': IS_MACOS and not has_accessibility_permission,
        'instructions': [
            'Open System Preferences',
            'Go to Security & Privacy > Privacy',
            'Select Accessibility from the left list',
            'Click the lock to make changes',
            'Check the box next to your terminal/Python'
        ] if IS_MACOS else []
    })


if __name__ == '__main__':
    init_input_method()
    port = int(os.getenv('PORT', 5000))
    logger.info(f'Starting Python edge service on port {port}')
    logger.info(f'Node ID: {NODE_ID}')
    logger.info(f'System: {SYSTEM}')
    logger.info(f'Input method: {input_method}')
    if IS_MACOS:
        logger.info(f'Accessibility permission: {has_accessibility_permission}')
    
    register_with_backend()
    start_heartbeat_thread()
    
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
