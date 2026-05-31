from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from datetime import datetime

from app.models.analysis_result import AnalysisResult as AnalysisResultModel
from app.schemas.analysis_result import AnalysisResultCreate
from app.utils.possession_calculator import PossessionCalculator
from app.utils.pass_network_builder import PassNetworkBuilder
from app.utils.heatmap_generator import HeatmapGenerator
from app.utils.formation_detector import FormationDetector
from app.utils.run_analyzer import RunAnalyzer


class TacticalAnalyzer:
    def __init__(
        self,
        db: Optional[Session] = None,
        match_id: Optional[int] = None,
        field_length: float = 105.0,
        field_width: float = 68.0
    ):
        self.db = db
        self.match_id = match_id
        self.field_length = field_length
        self.field_width = field_width

        self.possession_calculator = PossessionCalculator(
            field_length=field_length,
            field_width=field_width
        )
        self.pass_network_builder = PassNetworkBuilder(
            field_length=field_length,
            field_width=field_width
        )
        self.heatmap_generator = HeatmapGenerator(
            field_length=field_length,
            field_width=field_width
        )
        self.formation_detector = FormationDetector(
            field_length=field_length,
            field_width=field_width
        )
        self.run_analyzer = RunAnalyzer(
            field_length=field_length,
            field_width=field_width
        )

    def calculate_possession(
        self,
        tracking_data: List[Dict[str, Any]],
        time_interval: float = 1.0
    ) -> Dict[str, Any]:
        result = self.possession_calculator.calculate(tracking_data, time_interval)

        zone_possession = self.possession_calculator.calculate_zone_possession(tracking_data)
        result['zone_possession'] = zone_possession

        return result

    def build_pass_network(
        self,
        events: List[Dict[str, Any]],
        team: str
    ) -> Dict[str, Any]:
        pass_events = [e for e in events if e.get('event_type') == 'pass']
        return self.pass_network_builder.build(pass_events, team)

    def generate_heatmap(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: Optional[int] = None,
        team: Optional[str] = None
    ) -> Dict[str, Any]:
        return self.heatmap_generator.generate(
            tracking_data,
            grid_size=(10, 10),
            player_id=player_id,
            team=team
        )

    def detect_formation(
        self,
        tracking_data: List[Dict[str, Any]],
        team: str
    ) -> Dict[str, Any]:
        return self.formation_detector.detect(tracking_data, team, method='kmeans')

    def calculate_player_runs(
        self,
        tracking_data: List[Dict[str, Any]],
        player_id: int
    ) -> Dict[str, Any]:
        distance_result = self.run_analyzer.calculate_total_distance(tracking_data, player_id)
        high_intensity_result = self.run_analyzer.calculate_high_intensity_runs(tracking_data, player_id)
        workload_result = self.run_analyzer.calculate_workload_index(tracking_data, player_id)
        sprint_result = self.run_analyzer.calculate_sprint_analysis(tracking_data, player_id)

        return {
            'player_id': player_id,
            'distance': distance_result,
            'high_intensity_runs': high_intensity_result,
            'workload': workload_result,
            'sprints': sprint_result
        }

    def count_attacking_third_entries(
        self,
        tracking_data: List[Dict[str, Any]],
        team: str
    ) -> Dict[str, Any]:
        attacking_third_start = self.field_length * 2 / 3

        team_data = [
            d for d in tracking_data
            if d.get('team') == team and d.get('player_id') is not None
        ]

        player_entries: Dict[int, List[Dict[str, Any]]] = {}
        previous_positions: Dict[int, Optional[float]] = {}

        team_data_sorted = sorted(team_data, key=lambda d: d.get('timestamp', 0.0))

        for data in team_data_sorted:
            player_id = data.get('player_id')
            x = data.get('x', 0.0)
            timestamp = data.get('timestamp', 0.0)

            prev_x = previous_positions.get(player_id)

            if prev_x is not None and prev_x < attacking_third_start and x >= attacking_third_start:
                if player_id not in player_entries:
                    player_entries[player_id] = []
                player_entries[player_id].append({
                    'timestamp': timestamp,
                    'time_minutes': round(timestamp / 60, 2),
                    'x': x,
                    'y': data.get('y', 0.0)
                })

            previous_positions[player_id] = x

        total_entries = sum(len(entries) for entries in player_entries.values())

        entries_by_period = self._split_entries_by_period(player_entries)

        return {
            'team': team,
            'total_entries': total_entries,
            'entries_by_player': {
                str(pid): {
                    'count': len(entries),
                    'entries': entries
                }
                for pid, entries in player_entries.items()
            },
            'entries_by_period': entries_by_period,
            'attacking_third_start': attacking_third_start
        }

    def _split_entries_by_period(
        self,
        player_entries: Dict[int, List[Dict[str, Any]]]
    ) -> Dict[str, Any]:
        first_half_end = 45 * 60

        first_half_entries = 0
        second_half_entries = 0

        for entries in player_entries.values():
            for entry in entries:
                timestamp = entry.get('timestamp', 0.0)
                if timestamp < first_half_end:
                    first_half_entries += 1
                else:
                    second_half_entries += 1

        return {
            'first_half': first_half_entries,
            'second_half': second_half_entries
        }

    def save_analysis_result(
        self,
        analysis_type: str,
        data: Dict[str, Any]
    ) -> Optional[AnalysisResultModel]:
        if not self.db or not self.match_id:
            return None

        try:
            analysis_create = AnalysisResultCreate(
                match_id=self.match_id,
                analysis_type=analysis_type,
                data=data
            )

            db_analysis = AnalysisResultModel(**analysis_create.model_dump())
            self.db.add(db_analysis)
            self.db.commit()
            self.db.refresh(db_analysis)

            return db_analysis
        except Exception as e:
            self.db.rollback()
            raise e

    def run_full_analysis(
        self,
        tracking_data: List[Dict[str, Any]],
        events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        results = {}

        results['possession'] = self.calculate_possession(tracking_data)
        self.save_analysis_result('possession', results['possession'])

        results['pass_network_team_a'] = self.build_pass_network(events, 'team_a')
        self.save_analysis_result('pass_network_team_a', results['pass_network_team_a'])

        results['pass_network_team_b'] = self.build_pass_network(events, 'team_b')
        self.save_analysis_result('pass_network_team_b', results['pass_network_team_b'])

        results['heatmap_team_a'] = self.generate_heatmap(tracking_data, team='team_a')
        self.save_analysis_result('heatmap_team_a', results['heatmap_team_a'])

        results['heatmap_team_b'] = self.generate_heatmap(tracking_data, team='team_b')
        self.save_analysis_result('heatmap_team_b', results['heatmap_team_b'])

        results['formation_team_a'] = self.detect_formation(tracking_data, 'team_a')
        self.save_analysis_result('formation_team_a', results['formation_team_a'])

        results['formation_team_b'] = self.detect_formation(tracking_data, 'team_b')
        self.save_analysis_result('formation_team_b', results['formation_team_b'])

        player_ids = set(
            d.get('player_id') for d in tracking_data
            if d.get('player_id') is not None
        )
        results['player_runs'] = {}
        for player_id in player_ids:
            run_result = self.calculate_player_runs(tracking_data, player_id)
            results['player_runs'][str(player_id)] = run_result
            self.save_analysis_result(f'player_runs_{player_id}', run_result)

        results['attacking_third_entries_team_a'] = self.count_attacking_third_entries(tracking_data, 'team_a')
        self.save_analysis_result('attacking_third_entries_team_a', results['attacking_third_entries_team_a'])

        results['attacking_third_entries_team_b'] = self.count_attacking_third_entries(tracking_data, 'team_b')
        self.save_analysis_result('attacking_third_entries_team_b', results['attacking_third_entries_team_b'])

        results['team_runs_team_a'] = self.run_analyzer.calculate_team_runs(tracking_data, 'team_a')
        self.save_analysis_result('team_runs_team_a', results['team_runs_team_a'])

        results['team_runs_team_b'] = self.run_analyzer.calculate_team_runs(tracking_data, 'team_b')
        self.save_analysis_result('team_runs_team_b', results['team_runs_team_b'])

        results['formation_changes_team_a'] = self.formation_detector.detect_formation_changes(tracking_data, 'team_a')
        self.save_analysis_result('formation_changes_team_a', results['formation_changes_team_a'])

        results['formation_changes_team_b'] = self.formation_detector.detect_formation_changes(tracking_data, 'team_b')
        self.save_analysis_result('formation_changes_team_b', results['formation_changes_team_b'])

        return results

    def generate_tactical_report(
        self,
        tracking_data: List[Dict[str, Any]],
        events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        full_analysis = self.run_full_analysis(tracking_data, events)

        possession = full_analysis.get('possession', {})
        formation_a = full_analysis.get('formation_team_a', {})
        formation_b = full_analysis.get('formation_team_b', {})
        team_runs_a = full_analysis.get('team_runs_team_a', {})
        team_runs_b = full_analysis.get('team_runs_team_b', {})
        attacking_entries_a = full_analysis.get('attacking_third_entries_team_a', {})
        attacking_entries_b = full_analysis.get('attacking_third_entries_team_b', {})
        pass_network_a = full_analysis.get('pass_network_team_a', {})
        pass_network_b = full_analysis.get('pass_network_team_b', {})

        key_insights = []

        if possession.get('team_a_possession', 0) > possession.get('team_b_possession', 0):
            key_insights.append(f"Team A dominated possession with {possession.get('team_a_possession', 0):.1f}%")
        else:
            key_insights.append(f"Team B dominated possession with {possession.get('team_b_possession', 0):.1f}%")

        if team_runs_a.get('total_team_distance', 0) > team_runs_b.get('total_team_distance', 0):
            key_insights.append(f"Team A covered more ground: {team_runs_a.get('total_team_distance', 0):.0f}m vs {team_runs_b.get('total_team_distance', 0):.0f}m")
        else:
            key_insights.append(f"Team B covered more ground: {team_runs_b.get('total_team_distance', 0):.0f}m vs {team_runs_a.get('total_team_distance', 0):.0f}m")

        if formation_a.get('formation') != 'unknown':
            key_insights.append(f"Team A played formation: {formation_a.get('formation')} (confidence: {formation_a.get('confidence', 0)*100:.1f}%)")
        if formation_b.get('formation') != 'unknown':
            key_insights.append(f"Team B played formation: {formation_b.get('formation')} (confidence: {formation_b.get('confidence', 0)*100:.1f}%)")

        if attacking_entries_a.get('total_entries', 0) > attacking_entries_b.get('total_entries', 0):
            key_insights.append(f"Team A made more attacking third entries: {attacking_entries_a.get('total_entries', 0)} vs {attacking_entries_b.get('total_entries', 0)}")
        else:
            key_insights.append(f"Team B made more attacking third entries: {attacking_entries_b.get('total_entries', 0)} vs {attacking_entries_a.get('total_entries', 0)}")

        top_passers_a = self._get_top_passers(pass_network_a)
        top_passers_b = self._get_top_passers(pass_network_b)
        if top_passers_a:
            key_insights.append(f"Team A top passer: Player {top_passers_a[0]['player_id']} with {top_passers_a[0]['total_passes']} passes")
        if top_passers_b:
            key_insights.append(f"Team B top passer: Player {top_passers_b[0]['player_id']} with {top_passers_b[0]['total_passes']} passes")

        report = {
            'match_id': self.match_id,
            'generated_at': datetime.utcnow().isoformat(),
            'summary': {
                'team_a': {
                    'possession': possession.get('team_a_possession', 0),
                    'formation': formation_a.get('formation', 'unknown'),
                    'total_distance': team_runs_a.get('total_team_distance', 0),
                    'attacking_entries': attacking_entries_a.get('total_entries', 0),
                    'high_intensity_ratio': team_runs_a.get('high_intensity_ratio', 0),
                    'pass_success_rate': pass_network_a.get('metrics', {}).get('success_rate', 0)
                },
                'team_b': {
                    'possession': possession.get('team_b_possession', 0),
                    'formation': formation_b.get('formation', 'unknown'),
                    'total_distance': team_runs_b.get('total_team_distance', 0),
                    'attacking_entries': attacking_entries_b.get('total_entries', 0),
                    'high_intensity_ratio': team_runs_b.get('high_intensity_ratio', 0),
                    'pass_success_rate': pass_network_b.get('metrics', {}).get('success_rate', 0)
                }
            },
            'key_insights': key_insights,
            'detailed_analysis': full_analysis
        }

        self.save_analysis_result('tactical_report', report)

        return report

    def _get_top_passers(
        self,
        pass_network: Dict[str, Any],
        top_n: int = 3
    ) -> List[Dict[str, Any]]:
        nodes = pass_network.get('nodes', [])
        sorted_nodes = sorted(nodes, key=lambda n: n.get('total_passes', 0), reverse=True)
        return sorted_nodes[:top_n]

    def set_match_id(self, match_id: int):
        self.match_id = match_id

    def set_db_session(self, db: Session):
        self.db = db

    def reset(self):
        self.match_id = None
        self.db = None
