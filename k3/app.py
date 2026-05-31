"""
绝缘子串风偏角计算模拟器 - 主入口

使用方法:
    python app.py

API 文档:
    POST /api/simulate      - 单点仿真
    POST /api/scan          - 参数扫描
    GET  /api/history       - 历史记录
    GET  /api/history/<id>  - 历史详情
    POST /api/compare       - 历史对比
    POST /api/export_pdf    - PDF 报告下载
    POST /api/export_pdf_base64 - PDF 报告 (base64)
"""

from insulator_simulator.api import app

if __name__ == "__main__":
    print("=" * 60)
    print("  绝缘子串风偏角计算模拟器")
    print("  Insulator String Wind Deflection Simulator")
    print("=" * 60)
    print("  基于 IEC 60826 标准 · 刚体静力学模型")
    print("  支持 I串 / V串 / 双V串")
    print("=" * 60)
    print("  API 接口:")
    print("    POST /api/simulate        - 单点仿真")
    print("    POST /api/scan            - 参数扫描")
    print("    GET  /api/history         - 历史记录")
    print("    POST /api/export_pdf      - PDF 报告")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
