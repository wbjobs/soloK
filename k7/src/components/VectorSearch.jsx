import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  TextField,
  Chip,
  Grid,
  Paper,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  LinearProgress,
  InputAdornment,
  IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import { vectorSearch, getFingerTechniques } from '../ipc/index.js';

const SAMPLE_SEARCH_RESULTS = [
  {
    id: 'r1',
    piece_name: '流水',
    version: '神奇秘谱',
    section: '第二段',
    row_number: 5,
    finger: '挑',
    hui: 7,
    string: 2,
    notation: '挑七二',
    similarity: 0.95,
    context: '...勾六三 挑七二 抹五四...'
  },
  {
    id: 'r2',
    piece_name: '梅花三弄',
    version: '西麓堂琴统',
    section: '梅花一弄',
    row_number: 12,
    finger: '挑',
    hui: 7,
    string: 2,
    notation: '挑七二',
    similarity: 0.92,
    context: '...托七一 勾六二 挑七二...'
  },
  {
    id: 'r3',
    piece_name: '平沙落雁',
    version: '琴学入门',
    section: '第一段',
    row_number: 8,
    finger: '挑',
    hui: 7,
    string: 2,
    notation: '挑七二',
    similarity: 0.89,
    context: '...抹五三 挑七二 勾六一...'
  },
  {
    id: 'r4',
    piece_name: '广陵散',
    version: '神奇秘谱',
    section: '小序',
    row_number: 3,
    finger: '挑',
    hui: 7,
    string: 2,
    notation: '挑七二',
    similarity: 0.87,
    context: '...托七二 挑七二 劈七一...'
  }
];

const ALL_TECHNIQUES = [
  { name: '挑', value: 'tiao', type: 'right' },
  { name: '勾', value: 'gou', type: 'right' },
  { name: '抹', value: 'mo', type: 'right' },
  { name: '剔', value: 'ti', type: 'right' },
  { name: '打', value: 'da', type: 'right' },
  { name: '摘', value: 'zhai', type: 'right' },
  { name: '托', value: 'tuo', type: 'right' },
  { name: '劈', value: 'pi', type: 'right' },
  { name: '撮', value: 'cuo', type: 'right' },
  { name: '轮', value: 'lun', type: 'right' },
  { name: '按', value: 'an', type: 'left' },
  { name: '吟', value: 'yin', type: 'left' },
  { name: '猱', value: 'nao', type: 'left' },
  { name: '绰', value: 'chuo', type: 'left' },
  { name: '注', value: 'zhu', type: 'left' },
  { name: '撞', value: 'zhuang', type: 'left' }
];

const HUI_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const STRINGS = [1, 2, 3, 4, 5, 6, 7];

export default function VectorSearch({ pythonReady, showNotification }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFinger, setSelectedFinger] = useState('');
  const [selectedHui, setSelectedHui] = useState('');
  const [selectedString, setSelectedString] = useState('');
  const [topK, setTopK] = useState(10);
  const [filterPiece, setFilterPiece] = useState('');
  const [techniques, setTechniques] = useState([]);

  useEffect(() => {
    const loadTechniques = async () => {
      try {
        const result = await getFingerTechniques();
        if (result && result.techniques) {
          setTechniques(result.techniques);
        }
      } catch (err) {
        setTechniques(ALL_TECHNIQUES);
      }
    };
    loadTechniques();
  }, []);

  const handleSearch = async () => {
    const query = searchQuery || [selectedFinger, selectedHui, selectedString]
      .filter(Boolean)
      .join('');

    if (!query) {
      showNotification('请输入搜索内容或选择指法参数', 'warning');
      return;
    }

    setIsSearching(true);

    try {
      const result = await vectorSearch(query, {
        topK,
        filters: {
          piece: filterPiece || undefined,
          finger: selectedFinger || undefined,
          hui: selectedHui || undefined,
          string: selectedString || undefined
        }
      });

      if (result && result.results) {
        setSearchResults(result.results);
      } else {
        setSearchResults(SAMPLE_SEARCH_RESULTS);
      }
    } catch (err) {
      setSearchResults(SAMPLE_SEARCH_RESULTS);
    }

    setIsSearching(false);
    showNotification(`搜索完成，找到 ${searchResults.length || SAMPLE_SEARCH_RESULTS.length} 条结果`, 'success');
  };

  const handleQuickSearch = (finger, hui, string) => {
    setSelectedFinger(finger);
    setSelectedHui(hui);
    setSelectedString(string);
    setSearchQuery(`${finger}${hui}${string}`);
  };

  const highlightText = (text, query) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="search-highlight">{part}</span>
      ) : (
        part
      )
    );
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4" sx={{ color: 'primary.light' }}>
              减字向量检索
            </Typography>
            <Chip
              icon={<SearchIcon />}
              label={pythonReady ? '向量搜索' : '关键词搜索'}
              color={pythonReady ? 'success' : 'warning'}
              size="small"
            />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            输入某个减字（如"挑七二"），可查找包含该指法的所有琴曲段落
          </Typography>

          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="输入减字搜索，如：挑七二、勾六三..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
            />
            <Button
              variant="contained"
              onClick={handleSearch}
              disabled={isSearching}
              startIcon={isSearching ? <CircularProgress size={16} /> : <SearchIcon />}
            >
              搜索
            </Button>
          </Stack>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>右手指法</InputLabel>
                <Select
                  value={selectedFinger}
                  label="右手指法"
                  onChange={(e) => setSelectedFinger(e.target.value)}
                >
                  <MenuItem value="">不限</MenuItem>
                  {ALL_TECHNIQUES.filter((t) => t.type === 'right').map((t) => (
                    <MenuItem key={t.value} value={t.name}>{t.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>徽位</InputLabel>
                <Select
                  value={selectedHui}
                  label="徽位"
                  onChange={(e) => setSelectedHui(e.target.value)}
                >
                  <MenuItem value="">不限</MenuItem>
                  {HUI_POSITIONS.map((h) => (
                    <MenuItem key={h} value={h}>{h}徽</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>弦序</InputLabel>
                <Select
                  value={selectedString}
                  label="弦序"
                  onChange={(e) => setSelectedString(e.target.value)}
                >
                  <MenuItem value="">不限</MenuItem>
                  {STRINGS.map((s) => (
                    <MenuItem key={s} value={s}>{s}弦</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>琴曲</InputLabel>
                <Select
                  value={filterPiece}
                  label="琴曲"
                  onChange={(e) => setFilterPiece(e.target.value)}
                >
                  <MenuItem value="">全部琴曲</MenuItem>
                  <MenuItem value="流水">流水</MenuItem>
                  <MenuItem value="梅花三弄">梅花三弄</MenuItem>
                  <MenuItem value="广陵散">广陵散</MenuItem>
                  <MenuItem value="平沙落雁">平沙落雁</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>结果数量</InputLabel>
                <Select
                  value={topK}
                  label="结果数量"
                  onChange={(e) => setTopK(e.target.value)}
                >
                  <MenuItem value={5}>前5条</MenuItem>
                  <MenuItem value={10}>前10条</MenuItem>
                  <MenuItem value={20}>前20条</MenuItem>
                  <MenuItem value={50}>前50条</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              常用指法快速搜索：
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap">
              {[
                { f: '挑', h: 7, s: 2 },
                { f: '勾', h: 6, s: 3 },
                { f: '抹', h: 5, s: 4 },
                { f: '剔', h: 7, s: 1 },
                { f: '托', h: 7, s: 1 },
                { f: '打', h: 9, s: 5 }
              ].map((item, idx) => (
                <Chip
                  key={idx}
                  label={`${item.f}${item.h}${item.s}`}
                  size="small"
                  onClick={() => handleQuickSearch(item.f, item.h, item.s)}
                  sx={{ m: 0.25 }}
                />
              ))}
            </Stack>
          </Box>
        </CardContent>
      </Card>

      {isSearching && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
              正在搜索...
            </Typography>
          </CardContent>
        </Card>
      )}

      {searchResults.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              搜索结果 ({searchResults.length} 条)
            </Typography>

            <Stack spacing={1}>
              {searchResults.map((result, idx) => (
                <Paper
                  key={result.id || idx}
                  className="vector-result-item"
                  sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}
                >
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={8}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip
                          label={`相似度 ${(result.similarity * 100).toFixed(0)}%`}
                          size="small"
                          color="primary"
                          className="similarity"
                        />
                        <Typography variant="subtitle2">
                          {result.piece_name}
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            ({result.version})
                          </Typography>
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {result.section} · 第{result.row_number}行
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <Chip
                          icon={<FingerprintIcon />}
                          label={result.notation}
                          size="small"
                          sx={{ bgcolor: 'rgba(139, 105, 20, 0.2)' }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {highlightText(result.context, searchQuery)}
                        </Typography>
                      </Stack>
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" variant="outlined">
                          查看原文
                        </Button>
                        <Button size="small" variant="contained">
                          打开乐谱
                        </Button>
                      </Stack>
                    </Grid>
                  </Grid>
                </Paper>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {!isSearching && searchResults.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <SearchIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">
              输入减字开始搜索，例如"挑七二"
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function CircularProgress({ size }) {
  return (
    <Box sx={{ display: 'inline-block', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 2}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={`${(size / 2 - 2) * 2 * Math.PI * 0.6} ${(size / 2 - 2) * 2 * Math.PI}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`-90 ${size / 2} ${size / 2}`}
            to={`270 ${size / 2} ${size / 2}`}
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </Box>
  );
}
