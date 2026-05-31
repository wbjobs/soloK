const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const parcelRoutes = require('./routes/parcels');
const trackingRoutes = require('./routes/tracking');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/tracking', trackingRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '邮政包裹路径追溯系统API运行正常' });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
