const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DATA_DIR = path.join(__dirname, 'data');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');
const PATHS_FILE = path.join(DATA_DIR, 'cameraPaths.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const readJsonFile = (filePath, defaultData) => {
  if (!fs.existsSync(filePath)) {
    return defaultData;
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultData;
  }
};

const writeJsonFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
};

app.get('/api/presets', (req, res) => {
  const presets = readJsonFile(PRESETS_FILE, []);
  res.json(presets);
});

app.get('/api/presets/:id', (req, res) => {
  const presets = readJsonFile(PRESETS_FILE, []);
  const preset = presets.find(p => p.id === req.params.id);
  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  res.json(preset);
});

app.post('/api/presets', (req, res) => {
  const presets = readJsonFile(PRESETS_FILE, []);
  const { name, params } = req.body;
  
  if (!name || !params) {
    return res.status(400).json({ error: 'Name and params are required' });
  }
  
  const preset = {
    id: Date.now().toString(),
    name,
    params,
    createdAt: new Date().toISOString()
  };
  
  presets.push(preset);
  
  if (writeJsonFile(PRESETS_FILE, presets)) {
    res.status(201).json(preset);
  } else {
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

app.put('/api/presets/:id', (req, res) => {
  const presets = readJsonFile(PRESETS_FILE, []);
  const index = presets.findIndex(p => p.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  
  const { name, params } = req.body;
  presets[index] = {
    ...presets[index],
    name: name || presets[index].name,
    params: params || presets[index].params,
    updatedAt: new Date().toISOString()
  };
  
  if (writeJsonFile(PRESETS_FILE, presets)) {
    res.json(presets[index]);
  } else {
    res.status(500).json({ error: 'Failed to update preset' });
  }
});

app.delete('/api/presets/:id', (req, res) => {
  let presets = readJsonFile(PRESETS_FILE, []);
  presets = presets.filter(p => p.id !== req.params.id);
  
  if (writeJsonFile(PRESETS_FILE, presets)) {
    res.json({ message: 'Preset deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

app.get('/api/camera-paths', (req, res) => {
  const paths = readJsonFile(PATHS_FILE, []);
  res.json(paths);
});

app.get('/api/camera-paths/:id', (req, res) => {
  const paths = readJsonFile(PATHS_FILE, []);
  const pathData = paths.find(p => p.id === req.params.id);
  if (!pathData) {
    return res.status(404).json({ error: 'Camera path not found' });
  }
  res.json(pathData);
});

app.post('/api/camera-paths', (req, res) => {
  const paths = readJsonFile(PATHS_FILE, []);
  const { name, frames, duration } = req.body;
  
  if (!name || !frames || !frames.length) {
    return res.status(400).json({ error: 'Name and frames are required' });
  }
  
  const pathData = {
    id: Date.now().toString(),
    name,
    frames,
    duration: duration || frames.length * (1 / 60),
    createdAt: new Date().toISOString()
  };
  
  paths.push(pathData);
  
  if (writeJsonFile(PATHS_FILE, paths)) {
    res.status(201).json(pathData);
  } else {
    res.status(500).json({ error: 'Failed to save camera path' });
  }
});

app.delete('/api/camera-paths/:id', (req, res) => {
  let paths = readJsonFile(PATHS_FILE, []);
  paths = paths.filter(p => p.id !== req.params.id);
  
  if (writeJsonFile(PATHS_FILE, paths)) {
    res.json({ message: 'Camera path deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to delete camera path' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
