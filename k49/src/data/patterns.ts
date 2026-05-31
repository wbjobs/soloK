export interface PatternDef {
    name: string;
    nameCN: string;
    cells: [number, number][];
}

const GLIDER: [number, number][] = [
    [1, 0], [2, 1], [0, 2], [1, 2], [2, 2],
];

const LWSS: [number, number][] = [
    [1, 0], [4, 0], [0, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3],
];

const PULSAR: [number, number][] = [
    [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
    [0, 2], [5, 2], [7, 2], [12, 2],
    [0, 3], [5, 3], [7, 3], [12, 3],
    [0, 4], [5, 4], [7, 4], [12, 4],
    [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
    [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7],
    [0, 8], [5, 8], [7, 8], [12, 8],
    [0, 9], [5, 9], [7, 9], [12, 9],
    [0, 10], [5, 10], [7, 10], [12, 10],
    [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12],
];

const GOSPER_GUN: [number, number][] = [
    [24, 0],
    [22, 1], [24, 1],
    [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2],
    [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
    [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4],
    [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
    [10, 6], [16, 6], [24, 6],
    [11, 7], [15, 7],
    [12, 8], [13, 8],
];

const PENTADECATHLON: [number, number][] = [
    [1, 0], [1, 1], [1, 2], [0, 3], [2, 3], [1, 4], [1, 5], [1, 6],
    [0, 7], [2, 7], [1, 8], [1, 9],
];

const R_PENTOMINO: [number, number][] = [
    [1, 0], [2, 0], [0, 1], [1, 1], [1, 2],
];

const ACORN: [number, number][] = [
    [1, 0], [3, 1], [0, 2], [1, 2], [4, 2], [5, 2], [6, 2],
];

const DIEHARD: [number, number][] = [
    [6, 0], [0, 1], [1, 1], [1, 2], [5, 2], [6, 2], [7, 2],
];

const GLIDER_FLEET: [number, number][] = (() => {
    const cells: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
        for (const [x, y] of GLIDER) {
            cells.push([x + i * 8, y + i * 8]);
        }
    }
    return cells;
})();

export const PATTERNS: Record<string, PatternDef> = {
    glider: { name: 'Glider', nameCN: '滑翔机', cells: GLIDER },
    lwss: { name: 'LWSS', nameCN: '轻量级飞船', cells: LWSS },
    pulsar: { name: 'Pulsar', nameCN: '脉冲星', cells: PULSAR },
    gosperGun: { name: 'Gosper Glider Gun', nameCN: '高斯帕滑翔机枪', cells: GOSPER_GUN },
    pentadecathlon: { name: 'Pentadecathlon', nameCN: '十五联体', cells: PENTADECATHLON },
    rPentomino: { name: 'R-pentomino', nameCN: 'R-五联骨牌', cells: R_PENTOMINO },
    acorn: { name: 'Acorn', nameCN: '橡果', cells: ACORN },
    diehard: { name: 'Diehard', nameCN: '顽固', cells: DIEHARD },
    gliderFleet: { name: 'Glider Fleet', nameCN: '滑翔机编队', cells: GLIDER_FLEET },
};

export const PATTERN_LIST = Object.entries(PATTERNS).map(([key, def]) => ({
    key,
    ...def,
}));
