"""
参数校验模块

实现动态参数校验和智能警告
"""

from dataclasses import dataclass, field


DESIGN_WIND_SPEED = 30.0
DESIGN_DEFLECTION_LIMIT = 45.0

VALID_STRING_TYPES = {"I", "V", "VV"}
VALID_TERRAIN = {"A", "B", "C", "D"}


@dataclass
class ValidationResult:
    valid: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_error(self, msg: str):
        self.valid = False
        self.errors.append(msg)

    def add_warning(self, msg: str):
        self.warnings.append(msg)

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "errors": self.errors,
            "warnings": self.warnings,
        }


class ParameterValidator:
    """动态参数校验器"""

    @staticmethod
    def validate_simulate(params: dict) -> ValidationResult:
        result = ValidationResult()

        wind_speed = params.get("wind_speed")
        if wind_speed is None:
            result.add_error("缺少必要参数: wind_speed (风速)")
        else:
            if not isinstance(wind_speed, (int, float)):
                result.add_error(f"wind_speed 必须为数值, 收到: {type(wind_speed).__name__}")
            elif wind_speed < 0 or wind_speed > 60:
                result.add_error(f"风速范围: 0-60 m/s, 当前: {wind_speed}")
            elif wind_speed > DESIGN_WIND_SPEED:
                result.add_warning(
                    f"风速 {wind_speed} m/s 超过设计基准风速 {DESIGN_WIND_SPEED} m/s, "
                    f"建议校核结构设计"
                )
            elif wind_speed < 5:
                result.add_warning(
                    f"风速较低 ({wind_speed} m/s), 风偏角计算结果可能不显著"
                )

        wind_angle = params.get("wind_angle")
        if wind_angle is None:
            result.add_error("缺少必要参数: wind_angle (风向角)")
        else:
            if not isinstance(wind_angle, (int, float)):
                result.add_error(f"wind_angle 必须为数值, 收到: {type(wind_angle).__name__}")
            elif wind_angle < 0 or wind_angle > 360:
                result.add_error(f"风向角范围: 0-360°, 当前: {wind_angle}")
            elif wind_angle == 0 or wind_angle == 180 or wind_angle == 360:
                result.add_warning(
                    f"风向角 {wind_angle}° 与导线轴向平行, 风荷载为0"
                )

        string_length = params.get("string_length")
        if string_length is None:
            result.add_error("缺少必要参数: string_length (绝缘子串长度)")
        else:
            if not isinstance(string_length, (int, float)):
                result.add_error(
                    f"string_length 必须为数值, 收到: {type(string_length).__name__}"
                )
            elif string_length < 1 or string_length > 10:
                result.add_error(f"串长范围: 1-10 m, 当前: {string_length}")
            elif string_length > 6:
                result.add_warning(
                    f"串长较长 ({string_length} m), 请确认塔头间隙是否满足"
                )

        string_type = params.get("string_type", "I")
        if string_type not in VALID_STRING_TYPES:
            result.add_error(
                f"无效串型: {string_type}, 可选: {', '.join(sorted(VALID_STRING_TYPES))}"
            )

        if string_type in ("V", "VV"):
            v_angle = params.get("v_angle", 45.0)
            if not isinstance(v_angle, (int, float)):
                result.add_error(
                    f"v_angle 必须为数值, 收到: {type(v_angle).__name__}"
                )
            elif v_angle < 10 or v_angle > 80:
                result.add_error(
                    f"V 串半角范围: 10-80°, 当前: {v_angle}"
                )

        conductor_tension = params.get("conductor_tension")
        if conductor_tension is None:
            result.add_error("缺少必要参数: conductor_tension (导线张力)")
        else:
            if not isinstance(conductor_tension, (int, float)):
                result.add_error(
                    f"conductor_tension 必须为数值, 收到: "
                    f"{type(conductor_tension).__name__}"
                )
            elif conductor_tension < 10000 or conductor_tension > 100000:
                result.add_error(
                    f"导线张力范围: 10-100 kN (10000-100000 N), "
                    f"当前: {conductor_tension} N"
                )

        ring_diameter = params.get("ring_diameter")
        if ring_diameter is not None:
            if not isinstance(ring_diameter, (int, float)):
                result.add_error(
                    f"ring_diameter 必须为数值, 收到: "
                    f"{type(ring_diameter).__name__}"
                )
            elif ring_diameter < 0.1 or ring_diameter > 1.0:
                result.add_error(
                    f"均压环直径范围: 0.1-1.0 m, 当前: {ring_diameter}"
                )

        terrain = params.get("terrain_category", "B")
        if terrain not in VALID_TERRAIN:
            result.add_error(
                f"无效地形类别: {terrain}, 可选: {', '.join(sorted(VALID_TERRAIN))}"
            )

        return result

    @staticmethod
    def validate_scan(params: dict) -> ValidationResult:
        result = ValidationResult()

        wind_speed_range = params.get("wind_speed_range")
        if wind_speed_range is None:
            result.add_error("缺少必要参数: wind_speed_range")
        else:
            if not isinstance(wind_speed_range, (list, tuple)):
                result.add_error("wind_speed_range 必须为列表 [min, max, step]")
            elif len(wind_speed_range) != 3:
                result.add_error("wind_speed_range 需要三个值: [min, max, step]")
            else:
                v_min, v_max, v_step = wind_speed_range
                if v_min < 0 or v_max > 60:
                    result.add_error("风速范围: 0-60 m/s")
                if v_step <= 0:
                    result.add_error("步长必须为正数")
                if v_max <= v_min:
                    result.add_error("最大值必须大于最小值")

        wind_angle_range = params.get("wind_angle_range")
        if wind_angle_range is None:
            result.add_error("缺少必要参数: wind_angle_range")
        else:
            if not isinstance(wind_angle_range, (list, tuple)):
                result.add_error("wind_angle_range 必须为列表 [min, max, step]")
            elif len(wind_angle_range) != 3:
                result.add_error("wind_angle_range 需要三个值: [min, max, step]")
            else:
                a_min, a_max, a_step = wind_angle_range
                if a_min < 0 or a_max > 360:
                    result.add_error("风向角范围: 0-360°")
                if a_step <= 0:
                    result.add_error("步长必须为正数")
                if a_max <= a_min:
                    result.add_error("最大值必须大于最小值")

        string_type = params.get("string_type", "I")
        if string_type not in VALID_STRING_TYPES:
            result.add_error(
                f"无效串型: {string_type}, 可选: {', '.join(sorted(VALID_STRING_TYPES))}"
            )

        return result

    @staticmethod
    def validate_result(result: dict) -> ValidationResult:
        vr = ValidationResult()

        angle = result.get("deflection_angle_deg", 0)
        if angle > DESIGN_DEFLECTION_LIMIT:
            vr.add_warning(
                f"风偏角 {angle:.2f}° 超过设计允许值 {DESIGN_DEFLECTION_LIMIT}°, "
                f"结构不安全!"
            )

        stress = result.get("arm_stress_pa", 0)
        if stress > 200e6:
            vr.add_warning(
                f"绝缘子应力 {stress / 1e6:.1f} MPa 超过常规设计限值 200 MPa"
            )

        return vr
