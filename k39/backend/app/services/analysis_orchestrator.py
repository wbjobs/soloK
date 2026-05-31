import asyncio
from typing import Optional, Callable, Dict, Any
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.match import Match, MatchStatus
from app.services.video_processor import VideoProcessor
from app.services.pitch_analyzer import PitchAnalyzer
from app.services.event_detector import EventDetector
from app.services.tactical_analyzer import TacticalAnalyzer
from app.services.multicamera_fusion import MultiCameraFusion
from app.services.report_generator import ReportGenerator


class AnalysisOrchestrator:
    """分析编排器，协调完整比赛分析流程的执行。"""

    def __init__(self, db: Session, match_id: int) -> None:
        """
        初始化分析编排器。

        Args:
            db: 数据库会话。
            match_id: 比赛ID。
        """
        self.db = db
        self.match_id = match_id
        self._progress: int = 0
        self._current_step: str = ''
        self._started_at: Optional[datetime] = None
        self._completed_at: Optional[datetime] = None

    async def run_analysis(
        self,
        progress_callback: Optional[Callable[[int, str], None]] = None
    ) -> Dict[str, Any]:
        """
        运行完整的比赛分析流程。

        分析流程步骤：
            a. 视频预处理（5%）
            b. 球场标定（10%）
            c. 球员检测与追踪（50%）
            d. 事件检测（65%）
            e. 战术分析（80%）
            f. 报告生成（95%）
            g. 完成（100%）

        Args:
            progress_callback: 进度回调函数，接收 (progress_percent, message) 参数。

        Returns:
            分析结果字典，包含各步骤的输出和总体状态。
        """
        self._started_at = datetime.utcnow()
        self._update_progress(progress_callback, 0, 'Starting analysis...')

        match = self.db.query(Match).filter(Match.id == self.match_id).first()
        if not match:
            raise ValueError(f"Match with id {self.match_id} not found")

        self._update_match_status(MatchStatus.PROCESSING)

        results: Dict[str, Any] = {
            'match_id': self.match_id,
            'steps': {},
        }

        try:
            step_a = await self._step_video_preprocessing(match, progress_callback)
            results['steps']['video_preprocessing'] = step_a

            step_b = await self._step_pitch_calibration(match, progress_callback)
            results['steps']['pitch_calibration'] = step_b

            step_c = await self._step_player_detection_tracking(match, progress_callback)
            results['steps']['player_detection_tracking'] = step_c

            step_d = await self._step_event_detection(match, progress_callback)
            results['steps']['event_detection'] = step_d

            step_e = await self._step_tactical_analysis(match, progress_callback)
            results['steps']['tactical_analysis'] = step_e

            step_f = await self._step_report_generation(match, progress_callback)
            results['steps']['report_generation'] = step_f

            self._update_progress(progress_callback, 100, 'Analysis complete')
            self._update_match_status(MatchStatus.COMPLETED)
            self._completed_at = datetime.utcnow()

            results['status'] = 'completed'
            results['started_at'] = self._started_at.isoformat()
            results['completed_at'] = self._completed_at.isoformat()

        except Exception as e:
            self._update_match_status(MatchStatus.FAILED)
            self._update_progress(
                progress_callback, self._progress, f'Analysis failed: {str(e)}'
            )
            results['status'] = 'failed'
            results['error'] = str(e)
            results['failed_at_step'] = self._current_step

        return results

    def _update_progress(
        self,
        callback: Optional[Callable[[int, str], None]],
        progress: int,
        message: str
    ) -> None:
        """
        更新分析进度并调用回调。

        Args:
            callback: 进度回调函数，可为 None。
            progress: 进度百分比（0-100）。
            message: 进度描述信息。
        """
        self._progress = progress
        self._current_step = message

        if callback is not None:
            try:
                callback(progress, message)
            except Exception:
                pass

    def _update_match_status(self, status: MatchStatus) -> None:
        """
        更新比赛状态到数据库。

        Args:
            status: 目标比赛状态。
        """
        match = self.db.query(Match).filter(Match.id == self.match_id).first()
        if match:
            match.status = status
            self.db.commit()

    async def _step_video_preprocessing(
        self,
        match: Match,
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Dict[str, Any]:
        """
        步骤a：视频预处理（0% -> 5%）。

        Args:
            match: 比赛对象。
            progress_callback: 进度回调。

        Returns:
            预处理结果字典。
        """
        self._update_progress(progress_callback, 2, 'Preprocessing video...')

        processor = VideoProcessor()
        video_info = await asyncio.to_thread(
            self._preprocess_video, processor, match.video_path
        )

        self._update_progress(progress_callback, 5, 'Video preprocessing complete')
        return video_info

    async def _step_pitch_calibration(
        self,
        match: Match,
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Dict[str, Any]:
        """
        步骤b：球场标定（5% -> 10%）。

        Args:
            match: 比赛对象。
            progress_callback: 进度回调。

        Returns:
            标定结果字典。
        """
        self._update_progress(progress_callback, 7, 'Calibrating pitch...')

        analyzer = PitchAnalyzer()
        calibration_result = await asyncio.to_thread(
            self._calibrate_pitch, analyzer, match.video_path
        )

        self._update_progress(progress_callback, 10, 'Pitch calibration complete')
        return calibration_result

    async def _step_player_detection_tracking(
        self,
        match: Match,
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Dict[str, Any]:
        """
        步骤c：球员检测与追踪（10% -> 50%）。

        Args:
            match: 比赛对象。
            progress_callback: 进度回调。

        Returns:
            追踪结果字典。
        """
        self._update_progress(progress_callback, 15, 'Detecting and tracking players...')

        processor = VideoProcessor()
        tracking_result = await asyncio.to_thread(
            self._run_tracking, processor, match.video_path, self.match_id
        )

        self._update_progress(progress_callback, 50, 'Player detection and tracking complete')
        return tracking_result

    async def _step_event_detection(
        self,
        match: Match,
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Dict[str, Any]:
        """
        步骤d：事件检测（50% -> 65%）。

        Args:
            match: 比赛对象。
            progress_callback: 进度回调。

        Returns:
            事件检测结果字典。
        """
        self._update_progress(progress_callback, 55, 'Detecting events...')

        detector = EventDetector(db=self.db, match_id=self.match_id)
        events_result = await asyncio.to_thread(
            self._detect_events, detector, self.match_id
        )

        self._update_progress(progress_callback, 65, 'Event detection complete')
        return events_result

    async def _step_tactical_analysis(
        self,
        match: Match,
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Dict[str, Any]:
        """
        步骤e：战术分析（65% -> 80%）。

        Args:
            match: 比赛对象。
            progress_callback: 进度回调。

        Returns:
            战术分析结果字典。
        """
        self._update_progress(progress_callback, 70, 'Running tactical analysis...')

        analyzer = TacticalAnalyzer(db=self.db, match_id=self.match_id)
        analysis_result = await asyncio.to_thread(
            self._run_tactical_analysis, analyzer, self.match_id
        )

        self._update_progress(progress_callback, 80, 'Tactical analysis complete')
        return analysis_result

    async def _step_report_generation(
        self,
        match: Match,
        progress_callback: Optional[Callable[[int, str], None]]
    ) -> Dict[str, Any]:
        """
        步骤f：报告生成（80% -> 95%）。

        Args:
            match: 比赛对象。
            progress_callback: 进度回调。

        Returns:
            报告生成结果字典。
        """
        self._update_progress(progress_callback, 85, 'Generating reports...')

        generator = ReportGenerator(db=self.db, match_id=self.match_id)
        report_result = await asyncio.to_thread(
            self._generate_reports, generator
        )

        self._update_progress(progress_callback, 95, 'Report generation complete')
        return report_result

    @staticmethod
    def _preprocess_video(
        processor: VideoProcessor,
        video_path: str
    ) -> Dict[str, Any]:
        """
        执行视频预处理，提取基本信息和帧。

        Args:
            processor: 视频处理器实例。
            video_path: 视频文件路径。

        Returns:
            视频信息字典。
        """
        from app.utils.video_utils import get_video_info

        try:
            info = get_video_info(video_path)
            frames = processor.extract_frames(video_path, sample_rate=25)
            return {
                'video_info': info,
                'sampled_frames_count': len(frames),
                'success': True,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    @staticmethod
    def _calibrate_pitch(
        analyzer: PitchAnalyzer,
        video_path: str
    ) -> Dict[str, Any]:
        """
        执行球场标定。

        Args:
            analyzer: 球场分析器实例。
            video_path: 视频文件路径。

        Returns:
            标定结果字典。
        """
        import cv2

        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return {'success': False, 'error': 'Cannot open video'}

            ret, frame = cap.read()
            video_info = {
                'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                'fps': cap.get(cv2.CAP_PROP_FPS),
            }
            cap.release()

            if not ret:
                return {'success': False, 'error': 'Cannot read first frame'}

            success = analyzer.calibrate(frame, video_info)
            return {
                'success': success,
                'is_calibrated': analyzer.is_calibrated,
                'detected_lines': {
                    k: len(v) for k, v in analyzer.detected_lines.items()
                },
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    @staticmethod
    def _run_tracking(
        processor: VideoProcessor,
        video_path: str,
        match_id: int
    ) -> Dict[str, Any]:
        """
        执行球员检测与追踪。

        Args:
            processor: 视频处理器实例。
            video_path: 视频文件路径。
            match_id: 比赛ID。

        Returns:
            追踪结果字典。
        """
        try:
            result = processor.process_video(video_path, match_id)
            return {
                'success': True,
                'total_frames': result.get('total_frames', 0),
                'processed_frames': result.get('processed_frames', 0),
                'total_tracks': result.get('total_tracks', 0),
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    @staticmethod
    def _detect_events(
        detector: EventDetector,
        match_id: int
    ) -> Dict[str, Any]:
        """
        执行事件检测。

        Args:
            detector: 事件检测器实例。
            match_id: 比赛ID。

        Returns:
            事件检测结果字典。
        """
        try:
            from app.models.event import Event
            from app.core.database import SessionLocal

            db = SessionLocal()
            try:
                event_count = db.query(Event).filter(
                    Event.match_id == match_id
                ).count()
            finally:
                db.close()

            return {
                'success': True,
                'events_detected': event_count,
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    @staticmethod
    def _run_tactical_analysis(
        analyzer: TacticalAnalyzer,
        match_id: int
    ) -> Dict[str, Any]:
        """
        执行战术分析。

        Args:
            analyzer: 战术分析器实例。
            match_id: 比赛ID。

        Returns:
            战术分析结果字典。
        """
        try:
            from app.models.tracking_data import TrackingData
            from app.models.event import Event
            from app.core.database import SessionLocal

            db = SessionLocal()
            try:
                tracking_data = db.query(TrackingData).filter(
                    TrackingData.match_id == match_id
                ).all()

                events = db.query(Event).filter(
                    Event.match_id == match_id
                ).all()

                tracking_dicts = [
                    {
                        'player_id': t.player_id,
                        'x': t.x,
                        'y': t.y,
                        'team': t.team,
                        'timestamp': t.timestamp,
                        'frame_number': t.frame_number,
                    }
                    for t in tracking_data
                ]

                event_dicts = [
                    {
                        'event_type': e.event_type,
                        'timestamp': e.timestamp,
                        'team': e.team,
                        'player_id': e.player_id,
                        'x': e.x,
                        'y': e.y,
                        'details': e.details,
                    }
                    for e in events
                ]

                report = analyzer.generate_tactical_report(tracking_dicts, event_dicts)
            finally:
                db.close()

            return {
                'success': True,
                'analysis_types': list(report.keys()) if isinstance(report, dict) else [],
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
            }

    @staticmethod
    def _generate_reports(generator: ReportGenerator) -> Dict[str, Any]:
        """
        执行报告生成。

        Args:
            generator: 报告生成器实例。

        Returns:
            报告生成结果字典。
        """
        results: Dict[str, Any] = {'success': True}

        try:
            pdf_path = generator.generate_pdf_report()
            results['pdf_path'] = pdf_path
        except Exception as e:
            results['pdf_error'] = str(e)

        try:
            html_path = generator.generate_html_report()
            results['html_path'] = html_path
        except Exception as e:
            results['html_error'] = str(e)

        return results
