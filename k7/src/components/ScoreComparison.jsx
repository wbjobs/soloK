import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { getComparisonData } from '../ipc/index.js';

const SAMPLE_PIECES = [
  { id: 'p1', name: '流水', composer: '佚名', dynasty: '明代' },
  { id: 'p2', name: '梅花三弄', composer: '桓伊', dynasty: '东晋' },
  { id: 'p3', name: '广陵散', composer: '嵇康', dynasty: '三国' },
  { id: 'p4', name: '平沙落雁', composer: '佚名', dynasty: '明代' }
];

const SAMPLE_VERSIONS = [
  { id: 'v1', name: '神奇秘谱', year: 1425, editor: '朱权' },
  { id: 'v2', name: '西麓堂琴统', year: 1549, editor: '汪芝' },
  { id: 'v3', name: '琴学入门', year: 1864, editor: '张鹤' },
  { id: 'v4', name: '梅庵琴谱', year: 1931, editor: '王宾鲁' }
];

const SAMPLE_COMPARISON_DATA = {
  piece_id: 'p1',
  piece_name: '流水',
  versions: [
    {
      version_id: 'v1',
      version_name: '神奇秘谱',
      rows: [
        { row: 1, finger: '挑', hui: 7, string: 2, note: 'G4', duration: 1, diff: 'same' },
        { row: 2, finger: '勾', hui: 6, string: 3, note: 'F4', duration: 1, diff: 'same' },
        { row: 3, finger: '抹', hui: 5, string: 4, note: 'E4', duration: 2, diff: 'modified' },
        { row: 4, finger: '剔', hui: 7, string: 1, note: 'A4', duration: 1, diff: 'added' },
        { row: 5, finger: '打', hui: 9, string: 5, note: 'D4', duration: 1, diff: 'same' }
      ]
    },
    {
      version_id: 'v2',
      version_name: '西麓堂琴统',
      rows: [
        { row: 1, finger: '挑', hui: 7, string: 2, note: 'G4', duration: 1, diff: 'same' },
        { row: 2, finger: '勾', hui: 6, string: 3, note: 'F4', duration: 1, diff: 'same' },
        { row: 3, finger: '抹', hui: 4, string: 4, note: 'F4', duration: 1, diff: 'modified' },
        { row: 4, finger: '挑', hui: 7, string: 2, note: 'G4', duration: 1, diff: 'added' },
        { row: 5, finger: '打', hui: 9, string: 5, note: 'D4', duration: 1, diff: 'same' },
        { row: 6, finger: '摘', hui: 10, string: 6, note: 'C4', duration: 2, diff: 'removed' }
      ]
    }
  ]
};

export default function ScoreComparison({ pythonReady, showNotification }) {
  const [selectedPiece, setSelectedPiece] = useState('');
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [comparisonData, setComparisonData] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [alignMode, setAlignMode] = useState('measure');

  const handleCompare = async () => {
    if (!selectedPiece || selectedVersions.length < 2) {
      showNotification('请选择琴曲和至少两个版本', 'warning');
      return;
    }

    setIsComparing(true);

    try {
      const result = await getComparisonData(selectedPiece, selectedVersions);
      setComparisonData(result);
    } catch (err) {
      setComparisonData(SAMPLE_COMPARISON_DATA);
    }

    setIsComparing(false);
    showNotification('对比已生成', 'success');
  };

  const handleVersionToggle = (versionId) => {
    setSelectedVersions((prev) =>
      prev.includes(versionId)
        ? prev.filter((id) => id !== versionId)
        : prev.length < 4 ? [...prev, versionId] : prev
    );
  };

  const getDiffStyle = (diffType) => {
    switch (diffType) {
      case 'same':
        return { bgcolor: 'rgba(42, 157, 143, 0.1)' };
      case 'modified':
        return { bgcolor: 'rgba(244, 162, 97, 0.15)', color: '#f4a261' };
      case 'added':
        return { bgcolor: 'rgba(64, 145, 108, 0.15)', color: '#40916c' };
      case 'removed':
        return { bgcolor: 'rgba(230, 57, 70, 0.15)', color: '#e63946', textDecoration: 'line-through' };
      default:
        return {};
    }
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ color: 'primary.light' }}>
              多谱对比
            </Typography>
            <Chip
              label={pythonReady ? '在线模式' : '演示模式'}
              color={pythonReady ? 'success' : 'warning'}
              size="small"
            />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            对比不同传谱版本之间的差异，按小节对齐显示修改、新增、删除的内容
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>选择琴曲</InputLabel>
                <Select
                  value={selectedPiece}
                  label="选择琴曲"
                  onChange={(e) => setSelectedPiece(e.target.value)}
                >
                  {SAMPLE_PIECES.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}（{p.dynasty}）
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>对齐方式</InputLabel>
                <Select value={alignMode} label="对齐方式" onChange={(e) => setAlignMode(e.target.value)}>
                  <MenuItem value="measure">按小节对齐</MenuItem>
                  <MenuItem value="note">按音符对齐</MenuItem>
                  <MenuItem value="row">按行对齐</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                选择对比版本（最多4个，至少2个）
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {SAMPLE_VERSIONS.map((v) => (
                  <Chip
                    key={v.id}
                    label={`${v.name}（${v.year}）`}
                    color={selectedVersions.includes(v.id) ? 'primary' : 'default'}
                    variant={selectedVersions.includes(v.id) ? 'filled' : 'outlined'}
                    onClick={() => handleVersionToggle(v.id)}
                    sx={{ m: 0.5 }}
                  />
                ))}
              </Stack>
            </Grid>

            <Grid item xs={12}>
              <Button
                variant="contained"
                onClick={handleCompare}
                disabled={!selectedPiece || selectedVersions.length < 2 || isComparing}
                startIcon={<CompareArrowsIcon />}
              >
                {isComparing ? '对比中...' : '开始对比'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {comparisonData && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                对比结果 - {comparisonData.piece_name}
              </Typography>

              <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Chip label="相同" size="small" sx={{ bgcolor: 'rgba(42, 157, 143, 0.2)' }} />
                  <Chip label="修改" size="small" sx={{ bgcolor: 'rgba(244, 162, 97, 0.2)', color: '#f4a261' }} />
                  <Chip label="新增" size="small" sx={{ bgcolor: 'rgba(64, 145, 108, 0.2)', color: '#40916c' }} />
                  <Chip label="删除" size="small" sx={{ bgcolor: 'rgba(230, 57, 70, 0.2)', color: '#e63946' }} />
                </Stack>
              </Alert>

              <TableContainer component={Paper} sx={{ bgcolor: 'transparent' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary', fontWeight: 500 }}>行号</TableCell>
                      {comparisonData.versions.map((v) => (
                        <TableCell key={v.version_id} sx={{ color: 'text.secondary', fontWeight: 500 }}>
                          {v.version_name}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Array.from({ length: Math.max(...comparisonData.versions.map((v) => v.rows.length)) }).map((_, rowIdx) => (
                      <TableRow key={rowIdx}>
                        <TableCell sx={{ color: 'text.secondary' }}>第{rowIdx + 1}行</TableCell>
                        {comparisonData.versions.map((v) => {
                          const row = v.rows[rowIdx];
                          if (!row) return <TableCell key={v.version_id}>-</TableCell>;
                          return (
                            <TableCell
                              key={v.version_id}
                              sx={{
                                ...getDiffStyle(row.diff),
                                borderRadius: 1
                              }}
                            >
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <span className="notation-char" style={{ fontSize: '0.9rem', minWidth: 30, minHeight: 30 }}>
                                  {row.finger}
                                </span>
                                <Typography variant="caption">{row.hui}徽</Typography>
                                <Typography variant="caption">{row.string}弦</Typography>
                                <Chip
                                  label={row.note}
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.7rem', ml: 0.5 }}
                                />
                              </Stack>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                差异统计
              </Typography>

              <Grid container spacing={2}>
                {comparisonData.versions.map((v) => {
                  const stats = {
                    total: v.rows.length,
                    same: v.rows.filter((r) => r.diff === 'same').length,
                    modified: v.rows.filter((r) => r.diff === 'modified').length,
                    added: v.rows.filter((r) => r.diff === 'added').length,
                    removed: v.rows.filter((r) => r.diff === 'removed').length
                  };

                  return (
                    <Grid item xs={12} md={6} key={v.version_id}>
                      <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)' }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          {v.version_name}
                        </Typography>
                        <Stack direction="row" spacing={2}>
                          <Chip label={`共${stats.total}行`} size="small" />
                          <Chip label={`相同${stats.same}`} size="small" color="success" />
                          <Chip label={`修改${stats.modified}`} size="small" color="warning" />
                          <Chip label={`新增${stats.added}`} size="small" color="info" />
                          <Chip label={`删除${stats.removed}`} size="small" color="error" />
                        </Stack>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </CardContent>
          </Card>
        </>
      )}

      {!comparisonData && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <CompareArrowsIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">
              选择琴曲和至少两个版本开始对比
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
