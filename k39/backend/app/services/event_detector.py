import math
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.event import Event as EventModel
from app.schemas.event import EventCreate
from app.utils import (
    PassDetector,
    ShotDetector,
    TackleDetector,
    OffsideDetector,
    FoulDetector
)


class EventDetector:
    def __init__(
        self,
        db: Optional[Session] = None,
        match_id: Optional[int] = None,
        left_goal_position: Optional[Dict[str, float]] = None,
        right_goal_position: Optional[Dict[str, float]] = None,
        field_length: float = 105.0,
        field_width: float = 68.0
    ):
        self.db = db
        self.match_id = match_id
        self.field_length = field_length
        self.field_width = field_width

        self.left_goal_position = left_goal_position or {'x': 0.0, 'y': field_width / 2}
        self.right_goal_position = right_goal_position or {'x': field_length, 'y': field_width / 2}

        self.pass_detector = PassDetector()
        self.shot_detector_left = ShotDetector(
            goal_width=7.32,
            field_length=field_length,
            field_width=field_width
        )
        self.shot_detector_right = ShotDetector(
            goal_width=7.32,
            field_length=field_length,
            field_width=field_width
        )
        self.tackle_detector = TackleDetector()
        self.offside_detector_left = OffsideDetector(
            field_length=field_length,
            field_width=field_width
        )
        self.offside_detector_right = OffsideDetector(
            field_length=field_length,
            field_width=field_width
        )
        self.foul_detector = FoulDetector(
            field_length=field_length,
            field_width=field_width
        )

        self.ball_trajectory: List[Dict[str, Any]] = []
        self.ball_position_history: List[Dict[str, Any]] = []
        self.frame_count = 0

    def detect_events(
        self,
        tracking_data: List[Dict[str, Any]],
        frame_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        events = []
        self.frame_count += 1

        timestamp = frame_data.get('timestamp', self.frame_count * 0.04)
        frame_number = frame_data.get('frame_number', self.frame_count)

        player_positions = self._extract_player_positions(tracking_data)
        ball_position = self._extract_ball_position(tracking_data, frame_data)

        if ball_position:
            self.ball_trajectory.append({
                **ball_position,
                'timestamp': timestamp,
                'frame_number': frame_number
            })
            self.ball_position_history.append({
                **ball_position,
                'timestamp': timestamp,
                'frame_number': frame_number
            })
            if len(self.ball_trajectory) > 20:
                self.ball_trajectory.pop(0)
            if len(self.ball_position_history) > 10:
                self.ball_position_history.pop(0)

        player_velocities = self._calculate_player_velocities(player_positions, timestamp)

        ball_owner = self._find_ball_owner(ball_position, player_positions)

        prev_frame = self._get_previous_frame()
        curr_frame = {
            'player_positions': player_positions,
            'ball_position': ball_position,
            'player_velocities': player_velocities,
            'ball_owner': ball_owner,
            'timestamp': timestamp,
            'frame_number': frame_number
        }

        pass_event = self.detect_pass(prev_frame, curr_frame)
        if pass_event:
            pass_event = self._add_frame_info(pass_event, frame_number)
            events.append(pass_event)

        shot_event = self.detect_shot(prev_frame, curr_frame)
        if shot_event:
            shot_event = self._add_frame_info(shot_event, frame_number)
            events.append(shot_event)

        tackle_event = self.detect_tackle(prev_frame, curr_frame)
        if tackle_event:
            tackle_event = self._add_frame_info(tackle_event, frame_number)
            events.append(tackle_event)

        offside_event = self.detect_offside(prev_frame, curr_frame)
        if offside_event:
            offside_event = self._add_frame_info(offside_event, frame_number)
            events.append(offside_event)

        foul_event = self.detect_foul(prev_frame, curr_frame)
        if foul_event:
            foul_event = self._add_frame_info(foul_event, frame_number)
            events.append(foul_event)

        for event in events:
            if self.db and self.match_id:
                self.save_event(event)

        self._save_current_frame(curr_frame)

        return events

    def detect_pass(
        self,
        prev_frame: Optional[Dict[str, Any]],
        curr_frame: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if not self.ball_position_history or len(self.ball_position_history) < 2:
            return None

        player_positions = curr_frame.get('player_positions', [])
        timestamp = curr_frame.get('timestamp', 0)

        pass_event = self.pass_detector.detect(
            self.ball_position_history,
            player_positions,
            timestamp
        )

        return pass_event

    def detect_shot(
        self,
        prev_frame: Optional[Dict[str, Any]],
        curr_frame: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if len(self.ball_trajectory) < 3:
            return None

        player_positions = curr_frame.get('player_positions', [])

        attacking_direction = self._determine_attacking_direction(player_positions)

        if attacking_direction == 'right':
            goal_position = self.right_goal_position
            shot_event = self.shot_detector_right.detect(
                self.ball_trajectory,
                player_positions,
                goal_position
            )
        else:
            goal_position = self.left_goal_position
            shot_event = self.shot_detector_left.detect(
                self.ball_trajectory,
                player_positions,
                goal_position
            )

        return shot_event

    def detect_tackle(
        self,
        prev_frame: Optional[Dict[str, Any]],
        curr_frame: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        player_positions = curr_frame.get('player_positions', [])
        ball_owner = curr_frame.get('ball_owner')
        timestamp = curr_frame.get('timestamp', 0)

        tackle_event = self.tackle_detector.detect(
            player_positions,
            ball_owner,
            timestamp
        )

        return tackle_event

    def detect_offside(
        self,
        prev_frame: Optional[Dict[str, Any]],
        curr_frame: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        player_positions = curr_frame.get('player_positions', [])
        ball_position = curr_frame.get('ball_position')
        timestamp = curr_frame.get('timestamp', 0)

        if not ball_position:
            return None

        team_a_players = [p for p in player_positions if p.get('team') == 'team_a']
        team_b_players = [p for p in player_positions if p.get('team') == 'team_b']

        if len(team_a_players) < 2 or len(team_b_players) < 2:
            return None

        if self.offside_detector_left.attacking_direction is None:
            self.offside_detector_left.set_attacking_direction('left')
        if self.offside_detector_right.attacking_direction is None:
            self.offside_detector_right.set_attacking_direction('right')

        offside_event_a = self.offside_detector_left.detect(
            team_a_players,
            team_b_players,
            ball_position,
            timestamp
        )

        if offside_event_a:
            return offside_event_a

        offside_event_b = self.offside_detector_right.detect(
            team_b_players,
            team_a_players,
            ball_position,
            timestamp
        )

        return offside_event_b

    def detect_foul(
        self,
        prev_frame: Optional[Dict[str, Any]],
        curr_frame: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        player_positions = curr_frame.get('player_positions', [])
        player_velocities = curr_frame.get('player_velocities', {})
        timestamp = curr_frame.get('timestamp', 0)

        foul_event = self.foul_detector.detect(
            player_positions,
            player_velocities,
            timestamp
        )

        return foul_event

    def save_event(self, event_data: Dict[str, Any]) -> Optional[EventModel]:
        if not self.db or not self.match_id:
            return None

        try:
            event_create = EventCreate(
                match_id=self.match_id,
                event_type=event_data.get('event_type', 'unknown'),
                timestamp=event_data.get('timestamp', 0),
                frame_number=event_data.get('frame_number', 0),
                player_id=event_data.get('player_id'),
                team=event_data.get('team'),
                x=event_data.get('x'),
                y=event_data.get('y'),
                details=event_data.get('details', {})
            )

            db_event = EventModel(**event_create.model_dump())
            self.db.add(db_event)
            self.db.commit()
            self.db.refresh(db_event)

            return db_event
        except Exception as e:
            self.db.rollback()
            raise e

    def _extract_player_positions(
        self,
        tracking_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        player_positions = []
        for data in tracking_data:
            if data.get('player_id') is not None:
                player_positions.append({
                    'player_id': data.get('player_id'),
                    'team': data.get('team'),
                    'x': data.get('x'),
                    'y': data.get('y'),
                    'is_goalkeeper': data.get('is_goalkeeper', False)
                })
        return player_positions

    def _extract_ball_position(
        self,
        tracking_data: List[Dict[str, Any]],
        frame_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        if 'ball_position' in frame_data:
            return frame_data['ball_position']

        for data in tracking_data:
            if data.get('player_id') is None and 'x' in data and 'y' in data:
                return {
                    'x': data.get('x'),
                    'y': data.get('y')
                }

        return None

    def _calculate_player_velocities(
        self,
        player_positions: List[Dict[str, Any]],
        timestamp: float
    ) -> Dict[int, Dict[str, float]]:
        velocities = {}

        if not hasattr(self, '_last_player_positions'):
            self._last_player_positions = {}
            self._last_timestamp = timestamp

        time_diff = max(timestamp - self._last_timestamp, 0.001)

        for player in player_positions:
            player_id = player.get('player_id')
            if player_id is None:
                continue

            last_pos = self._last_player_positions.get(player_id)
            if last_pos:
                vx = (player['x'] - last_pos['x']) / time_diff
                vy = (player['y'] - last_pos['y']) / time_diff
            else:
                vx = 0.0
                vy = 0.0

            velocities[player_id] = {'vx': vx, 'vy': vy}

        self._last_player_positions = {p['player_id']: p for p in player_positions if p.get('player_id') is not None}
        self._last_timestamp = timestamp

        return velocities

    def _find_ball_owner(
        self,
        ball_position: Optional[Dict[str, Any]],
        player_positions: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        if not ball_position:
            return None

        min_distance = float('inf')
        closest_player = None

        for player in player_positions:
            if player.get('player_id') is None:
                continue
            dist = math.sqrt(
                (ball_position['x'] - player['x']) ** 2 +
                (ball_position['y'] - player['y']) ** 2
            )
            if dist < 3.0 and dist < min_distance:
                min_distance = dist
                closest_player = player

        return closest_player

    def _determine_attacking_direction(
        self,
        player_positions: List[Dict[str, Any]]
    ) -> str:
        team_a_players = [p for p in player_positions if p.get('team') == 'team_a']
        team_b_players = [p for p in player_positions if p.get('team') == 'team_b']

        if not team_a_players or not team_b_players:
            return 'right'

        avg_a_x = sum(p['x'] for p in team_a_players) / len(team_a_players)
        avg_b_x = sum(p['x'] for p in team_b_players) / len(team_b_players)

        if avg_a_x < avg_b_x:
            return 'right'
        else:
            return 'left'

    def _get_previous_frame(self) -> Optional[Dict[str, Any]]:
        if hasattr(self, '_previous_frame'):
            return self._previous_frame
        return None

    def _save_current_frame(self, frame: Dict[str, Any]):
        self._previous_frame = frame

    def _add_frame_info(
        self,
        event: Dict[str, Any],
        frame_number: int
    ) -> Dict[str, Any]:
        event['frame_number'] = frame_number
        if self.match_id:
            event['match_id'] = self.match_id
        return event

    def reset(self):
        self.pass_detector.reset()
        self.shot_detector_left.reset()
        self.shot_detector_right.reset()
        self.tackle_detector.reset()
        self.offside_detector_left.reset()
        self.offside_detector_right.reset()
        self.foul_detector.reset()
        self.ball_trajectory = []
        self.ball_position_history = []
        self.frame_count = 0
        if hasattr(self, '_previous_frame'):
            del self._previous_frame
        if hasattr(self, '_last_player_positions'):
            del self._last_player_positions
        if hasattr(self, '_last_timestamp'):
            del self._last_timestamp

    def set_match_id(self, match_id: int):
        self.match_id = match_id

    def set_db_session(self, db: Session):
        self.db = db
