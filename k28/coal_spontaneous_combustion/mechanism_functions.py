"""
41种反应机理函数定义
包括积分形式 g(α) 和微分形式 f(α)
"""
import numpy as np

MECHANISM_FUNCTIONS = {
    'P1': {'name': '幂函数法则（n=1）', 'g': lambda a: a, 'f': lambda a: np.ones_like(a)},
    'P2': {'name': '幂函数法则（n=2）', 'g': lambda a: a**0.5, 'f': lambda a: 2 * a**0.5},
    'P3': {'name': '幂函数法则（n=3）', 'g': lambda a: a**(1/3), 'f': lambda a: 3 * a**(2/3)},
    'P4': {'name': '幂函数法则（n=4）', 'g': lambda a: a**0.25, 'f': lambda a: 4 * a**0.75},
    'P2/3': {'name': '幂函数法则（n=2/3）', 'g': lambda a: a**1.5, 'f': lambda a: (2/3) * a**(-0.5)},
    
    'A2': {'name': 'Avrami-Erofeev（n=2）', 'g': lambda a: (-np.log(1 - a))**0.5, 'f': lambda a: 2 * (1 - a) * (-np.log(1 - a))**0.5},
    'A3': {'name': 'Avrami-Erofeev（n=3）', 'g': lambda a: (-np.log(1 - a))**(1/3), 'f': lambda a: 3 * (1 - a) * (-np.log(1 - a))**(2/3)},
    'A4': {'name': 'Avrami-Erofeev（n=4）', 'g': lambda a: (-np.log(1 - a))**0.25, 'f': lambda a: 4 * (1 - a) * (-np.log(1 - a))**0.75},
    'A1.5': {'name': 'Avrami-Erofeev（n=1.5）', 'g': lambda a: (-np.log(1 - a))**(2/3), 'f': lambda a: 1.5 * (1 - a) * (-np.log(1 - a))**(1/3)},
    
    'R1': {'name': '一维相边界反应', 'g': lambda a: a, 'f': lambda a: np.ones_like(a)},
    'R2': {'name': '二维相边界反应（收缩圆柱）', 'g': lambda a: 1 - (1 - a)**0.5, 'f': lambda a: 2 * (1 - a)**0.5},
    'R3': {'name': '三维相边界反应（收缩球）', 'g': lambda a: 1 - (1 - a)**(1/3), 'f': lambda a: 3 * (1 - a)**(2/3)},
    
    'D1': {'name': '一维扩散（抛物线法则）', 'g': lambda a: a**2, 'f': lambda a: 1 / (2 * a)},
    'D2': {'name': '二维扩散（Valensi）', 'g': lambda a: (1 - a) * np.log(1 - a) + a, 'f': lambda a: 1 / (-np.log(1 - a))},
    'D3': {'name': '三维扩散（Jander）', 'g': lambda a: (1 - (1 - a)**(1/3))**2, 'f': lambda a: (3/2) * (1 - a)**(2/3) / (1 - (1 - a)**(1/3))},
    'D4': {'name': '三维扩散（Ginstling-Brounshtein）', 'g': lambda a: 1 - (2/3)*a - (1 - a)**(2/3), 'f': lambda a: (3/2) / ((1 - a)**(-1/3) - 1)},
    'D5': {'name': 'Zhuralev-Lesokin-Tempelman', 'g': lambda a: ((1/(1 - a))**(1/3) - 1)**2, 'f': lambda a: (3/2) * (1 - a)**(4/3) * ((1/(1 - a))**(1/3) - 1)},
    
    'F1': {'name': '一级反应（Mample）', 'g': lambda a: -np.log(1 - a), 'f': lambda a: 1 - a},
    'F2': {'name': '二级反应', 'g': lambda a: 1 / (1 - a) - 1, 'f': lambda a: (1 - a)**2},
    'F3': {'name': '三级反应', 'g': lambda a: 1 / (2 * ((1 - a)**2)) - 0.5, 'f': lambda a: (1 - a)**3},
    'F0.5': {'name': '半级反应', 'g': lambda a: 1 - (1 - a)**0.5, 'f': lambda a: 2 * (1 - a)**0.5},
    
    'C1': {'name': '立方根法则', 'g': lambda a: a**(1/3), 'f': lambda a: 3 * a**(2/3)},
    'C2': {'name': '平方根法则', 'g': lambda a: a**0.5, 'f': lambda a: 2 * a**0.5},
    
    'B1': {'name': 'Prout-Tompkins（n=1）', 'g': lambda a: np.log(a / (1 - a)), 'f': lambda a: a * (1 - a)},
    'B2': {'name': 'Prout-Tompkins（n=2）', 'g': lambda a: np.log(a**2 / (1 - a)**2), 'f': lambda a: 0.5 * a * (1 - a)},
    
    'G1': {'name': 'Gaussian（n=1）', 'g': lambda a: np.sqrt(-np.log(1 - a)), 'f': lambda a: 2 * (1 - a) * np.sqrt(-np.log(1 - a))},
    'G2': {'name': 'Gaussian（n=2）', 'g': lambda a: (-np.log(1 - a))**(1/3), 'f': lambda a: 3 * (1 - a) * (-np.log(1 - a))**(2/3)},
    
    'L1': {'name': 'Lebedev（n=1）', 'g': lambda a: np.sin(np.pi * a / 2), 'f': lambda a: 2 / (np.pi * np.cos(np.pi * a / 2))},
    'L2': {'name': 'Lebedev（n=2）', 'g': lambda a: np.sin(np.pi * a / 2)**2, 'f': lambda a: 1 / (np.pi * np.sin(np.pi * a / 2) * np.cos(np.pi * a / 2))},
    
    'SE1': {'name': 'Sestak-Berggren（m=1,n=1,p=1）', 'g': lambda a: np.log(a * (1 - a)), 'f': lambda a: a * (1 - a) / (1 - 2*a)},
    'SE2': {'name': 'Sestak-Berggren（m=0.5,n=0.5,p=0）', 'g': lambda a: np.arcsin(a**0.5), 'f': lambda a: 2 * np.sqrt(a * (1 - a))},
    'SE3': {'name': 'Sestak-Berggren（m=2/3,n=1/3,p=0）', 'g': lambda a: a**(2/3), 'f': lambda a: (3/2) * a**(1/3)},
    
    'J1': {'name': 'Jander（n=1）', 'g': lambda a: (1 - np.sqrt(1 - a))**2, 'f': lambda a: np.sqrt(1 - a) / (1 - np.sqrt(1 - a))},
    'J2': {'name': 'Jander（n=2）', 'g': lambda a: (1 - (1 - a)**(1/3))**2, 'f': lambda a: (3/2) * (1 - a)**(2/3) / (1 - (1 - a)**(1/3))},
    
    'Z1': {'name': 'Zhuravlev（n=1）', 'g': lambda a: 1 / (1 - a) - 1, 'f': lambda a: (1 - a)**2},
    'Z2': {'name': 'Zhuravlev（n=2）', 'g': lambda a: (1 / (1 - a) - 1)**0.5, 'f': lambda a: 2 * (1 - a)**(1.5)},
    
    'H1': {'name': 'Hu-Zhao（n=1）', 'g': lambda a: -np.log(1 - a**2), 'f': lambda a: (1 - a**2) / (2*a)},
    'H2': {'name': 'Hu-Zhao（n=2）', 'g': lambda a: (1 - a)**(-0.5) - 1, 'f': lambda a: 2 * (1 - a)**1.5},
    
    'KR1': {'name': 'Koga-Tanaka（n=1）', 'g': lambda a: np.log((1 - a)**(-2) - 1), 'f': lambda a: (1 - a)**2 * (2 - a) / 2},
    
    'SB1': {'name': 'Šesták-Berggren通用1', 'g': lambda a: np.log(a / (1 - a)), 'f': lambda a: a * (1 - a)},
    'SB2': {'name': 'Šesták-Berggren通用2', 'g': lambda a: a**0.5 * (1 - a)**0.5, 'f': lambda a: 1 / (2 * np.sqrt(a * (1 - a)))},
}


def get_mechanism_function(code: str):
    """获取指定机理函数"""
    if code in MECHANISM_FUNCTIONS:
        return MECHANISM_FUNCTIONS[code]
    else:
        raise ValueError(f"未知的机理函数代码: {code}")


def list_mechanism_functions():
    """列出所有可用的机理函数"""
    return [(code, info['name']) for code, info in MECHANISM_FUNCTIONS.items()]
