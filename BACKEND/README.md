# IllDetect Backend API

Backend API untuk aplikasi IllDetect menggunakan Hapi.js framework untuk prediksi risiko penyakit kardiovaskular.

## 🚀 Quick Start

1. **Clone repository**:
   ```bash
   git clone <repository-url>
   cd "CAPSTONE-CC25-CF225/BACKEND"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Setup environment variables**:
   ```bash
   # Copy and edit environment file
   copy .env.example .env
   # Edit .env dengan konfigurasi yang sesuai
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Start production server**:
   ```bash
   npm start
   ```

## 📋 Prerequisites

- Node.js >= 16.0.0
- npm >= 7.0.0
- Supabase account and project

## 🛠 Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5001
HOST=localhost
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# API Configuration
API_VERSION=1.0.0
MAX_PAYLOAD_SIZE=1048576
```

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API information dan dokumentasi |
| `GET` | `/api/health` | Health check dan status database |
| `GET` | `/api/status` | Server status dan system info |
| `GET` | `/api/info` | API metadata dan build info |
| `POST` | `/api/predict` | Submit cardiovascular prediction |
| `GET` | `/api/predictions` | Get prediction history dengan pagination |
| `GET` | `/api/statistics` | Get prediction statistics |

## 📝 API Usage Examples

### Health Check
```bash
curl http://localhost:5000/api/health
```

### Submit Prediction
```bash
curl -X POST http://localhost:5000/api/predict \
  -H "Content-Type: application/json" \
  -d '{
    "age": 45,
    "gender": 1,
    "height": 170,
    "weight": 70,
    "ap_hi": 120,
    "ap_lo": 80,
    "cholesterol": 1,
    "gluc": 1,
    "smoke": 0,
    "alco": 0,
    "active": 1
  }'
```

### Get Predictions
```bash
curl "http://localhost:5000/api/predictions?page=1&limit=10"
```

## 🏗 Project Structure

```
BACKEND/
├── routes/
│   ├── health.js       # Health check dan status routes
│   └── prediction.js   # Prediction dan data routes
├── server.js           # Main server file
├── package.json        # Dependencies dan scripts
├── .env               # Environment variables
├── .gitignore         # Git ignore rules
└── README.md          # Documentation
```

## 🧪 Testing

Test API endpoints:

```bash
# Test health
npm run test:health

# Test all endpoints
npm run test:all
```

## 🚢 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Docker (Optional)
```bash
docker build -t illdetect-backend .
docker run -p 5000:5000 illdetect-backend
```

## 🔧 Configuration

### CORS Configuration
Backend dikonfigurasi untuk menerima requests dari:
- `http://localhost:5173` (Vite dev server)
- `http://localhost:3000` (Alternative frontend)
- Production frontend URLs

Backend akan berjalan di port **5001** secara default.

### Database Schema
Tabel `cardiovascular_predictions`:
- `id` (uuid, primary key)
- `age` (integer)
- `gender` (integer: 1=female, 2=male)
- `height` (integer, cm)
- `weight` (integer, kg)
- `ap_hi` (integer, systolic BP)
- `ap_lo` (integer, diastolic BP)
- `cholesterol` (integer: 1=normal, 2=above, 3=well above)
- `gluc` (integer: 1=normal, 2=above, 3=well above)
- `smoke` (integer: 0=no, 1=yes)
- `alco` (integer: 0=no, 1=yes)
- `active` (integer: 0=no, 1=yes)
- `risk_prediction` (integer: 0=low, 1=high)
- `confidence_score` (numeric)
- `probability` (numeric)
- `bmi` (numeric)
- `prediction_source` (text)
- `created_at` (timestamp)

## 🔍 Monitoring

- Health endpoint: `/api/health`
- Status endpoint: `/api/status`
- Logs: Console output dengan emojis untuk easy tracking

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.

## 📞 Support

- Email: support@illdetect.com
- GitHub Issues: [Create Issue](https://github.com/capstone-project/illdetect/issues)
- Documentation: [API Docs](https://docs.illdetect.com)
