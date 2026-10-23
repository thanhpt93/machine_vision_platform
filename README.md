# Nền tảng Machine Vision trên Windows (Industrial Vision Platform)

Nền tảng kiểm tra bằng thị giác máy tính trong môi trường công nghiệp dành cho hệ điều hành Windows. Ứng dụng cung cấp môi trường kéo thả node trực quan (dựa trên React Flow / `@xyflow/react`), quản lý luồng dữ liệu pipeline dưới định dạng JSON có phiên bản, và phân tách hoàn toàn tầng giao diện với tầng Vision Runtime xử lý ảnh (OpenCV / AI ONNX).

---

## 1. Kiến trúc hệ thống (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                 Electron Desktop App (Windows)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Renderer Process (Chromium)               │  │
│  │   React 19 + TypeScript + Tailwind CSS + Zustand      │  │
│  │   UI: Diagnostics & Health Dashboard / Node Canvas    │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ contextBridge (Safe API)      │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                  Preload Script                       │  │
│  │  - contextIsolation: true                             │  │
│  │  - nodeIntegration: false                             │  │
│  │  - Safe typed APIs (electronAPI)                      │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ Main IPC                      │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                  Main Process (Node.js)               │  │
│  │  - Window lifecycle, security sandboxing              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP REST (127.0.0.1:8000)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Python Vision Runtime (FastAPI)                 │
│  - FastAPI REST API + Pydantic v2                           │
│  - Health endpoint: /health                                 │
│  - Tách biệt định nghĩa node (Contracts) với logic thực thi │
│  - Pipeline JSON versioning & DAG Sequential Runner (Phase 2)│
│  - OpenCV + ONNX Runtime (Phase 2 & 3)                      │
└─────────────────────────────────────────────────────────────┘
```

### Các nguyên tắc kiến trúc cốt lõi đã áp dụng:
1. **Tách biệt ranh giới (Process Separation):** Giao diện Electron Desktop và Python Vision Runtime là hai tiến trình độc lập, không phụ thuộc cứng mã nguồn vào nhau.
2. **Cô lập Renderer (Renderer Isolation):** Cấu hình `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, ngăn chặn renderer truy cập trực tiếp file system, shell hoặc phần cứng.
3. **Giao tiếp qua API nội bộ (Local REST Boundary):** Desktop giao tiếp với Python Runtime qua `http://127.0.0.1:8000` với cơ chế xử lý lỗi mạng, timeout và auto-poll.
4. **Hợp đồng Node (Node Contract) & Pipeline JSON Schema:** Định dạng JSON pipeline có trường phiên bản `schemaVersion: "1.0.0"`, định nghĩa kiểu dữ liệu chặt chẽ cho cổng vào/ra (port data types), cấu hình được xác thực qua Zod/Pydantic, không nhúng mã thực thi tùy ý vào JSON.

---

## 2. Cấu trúc thư mục (Folder Structure)

```
machine_vision_platform/
├── package.json               # NPM scripts & frontend dependencies
├── tsconfig.json              # TypeScript config cho React renderer & shared
├── tsconfig.node.json         # TypeScript config cho Electron main process
├── vite.config.ts             # Vite bundler configuration
├── vitest.config.ts           # Vitest unit test configuration
├── tailwind.config.js         # Tailwind CSS styling configuration
├── postcss.config.js          # PostCSS configuration
├── index.html                 # HTML entrypoint với CSP an toàn
├── src/
│   ├── main/                  # Electron Main Process
│   │   ├── main.ts            # Quản lý vòng đời cửa sổ & sandbox
│   │   └── preload.ts         # Preload an toàn phơi bày window.electronAPI
│   ├── renderer/              # React Frontend Application
│   │   ├── index.tsx          # React mount entrypoint
│   │   ├── index.css          # Tailwind base & custom styles
│   │   ├── App.tsx            # Main Application shell
│   │   ├── App.test.tsx       # Vitest tests cho giao diện
│   │   ├── setupTests.ts      # Vitest test setup & mocks
│   │   ├── components/
│   │   │   └── HealthDashboard.tsx # Màn hình kiểm tra & giám sát Python Runtime
│   │   ├── services/
│   │   │   └── runtimeApi.ts  # Client REST API gọi endpoint /health
│   │   └── types/
│   │       ├── api.ts         # Định nghĩa kiểu dữ liệu phản hồi API
│   │       └── electron.d.ts  # Định nghĩa kiểu cho window.electronAPI
│   └── shared/
│       └── contracts.ts       # Hợp đồng node & Schema Pipeline JSON (Zod)
├── python_runtime/            # Gói Python Vision Runtime độc lập
│   ├── pyproject.toml         # Cấu hình gói Python chuẩn
│   ├── requirements.txt       # Dependencies (fastapi, uvicorn, pydantic, pytest)
│   ├── vision_runtime/
│   │   ├── __init__.py
│   │   ├── config.py          # Cấu hình runtime (host, port, version)
│   │   ├── main.py            # Khởi tạo FastAPI app và CORS middleware
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── health.py      # Endpoint /health trả về trạng thái & uptime
│   │   └── schemas/
│   │       ├── __init__.py
│   │       └── health.py      # Pydantic schema cho phản hồi health
│   └── tests/
│       ├── __init__.py
│       └── test_health.py     # Pytest kiểm thử endpoint /health
└── README.md                  # Hướng dẫn thiết lập, chạy và kiểm thử
```

---

## 3. Yêu cầu môi trường (Prerequisites)

- **Hệ điều hành:** Windows 10/11 64-bit.
- **Node.js:** Phiên bản `>= 20.0.0` (đã kiểm tra tương thích trên v24.22.1 với npm 11.19.1).
- **Python:** Phiên bản `>= 3.10` (đã kiểm tra tương thích trên v3.14.7).

---

## 4. Hướng dẫn thiết lập (Setup Instructions)

### 4.1. Thiết lập Node.js & Frontend dependencies
Mở terminal PowerShell tại thư mục gốc dự án:
```powershell
npm install
```

### 4.2. Thiết lập Python Runtime dependencies
Cài đặt các gói phụ thuộc cần thiết cho Python:
```powershell
python -m pip install -r python_runtime/requirements.txt
```

---

## 5. Hướng dẫn chạy ứng dụng (Running the Application)

### Bước 1: Khởi chạy Python Vision Runtime độc lập
Khởi chạy dịch vụ FastAPI trên cổng `8000`:
```powershell
python -m uvicorn vision_runtime.main:app --app-dir python_runtime --host 127.0.0.1 --port 8000 --reload
```
- Khi chạy thành công, runtime sẽ lắng nghe tại: `http://127.0.0.1:8000`
- Bạn có thể kiểm tra trực tiếp qua trình duyệt: `http://127.0.0.1:8000/health`
- Tài liệu API tương tác Swagger UI: `http://127.0.0.1:8000/docs`

### Bước 2: Khởi chạy ứng dụng Desktop Electron

**Chế độ phát triển (Development Mode):**
Mở thêm một terminal mới và chạy:
```powershell
npm run dev
```
Lệnh này sẽ tự động khởi động máy chủ Vite tại cổng 5173 và mở cửa sổ Electron kết nối với Vite.

**Chế độ biên dịch đóng gói sẵn (Production Build & Start):**
```powershell
# Biên dịch cả Main process và React renderer
npm run build

# Khởi chạy Electron từ mã đã biên dịch trong thư mục dist/
npm start
```

---

## 6. Hướng dẫn kiểm thử (Running Tests)

### 6.1. Kiểm tra kiểu dữ liệu TypeScript (Type Checking)
```powershell
npm run typecheck
```
*Kết quả:* Không có lỗi biên dịch TypeScript trong cả Renderer, Main process và Shared contracts.

### 6.2. Kiểm thử Frontend (Vitest)
```powershell
npm run test
```
*Kết quả:* Chạy toàn bộ các test suite giao diện bằng `jsdom`, bao gồm kiểm tra render, kết nối thành công (200 OK) và hiển thị cảnh báo khi runtime mất kết nối.

### 6.3. Kiểm thử Python Runtime (Pytest)
```powershell
python -m pytest python_runtime/tests -v
```
*Kết quả:* Kiểm thử endpoint root `/` và endpoint `/health` bảo đảm trả về mã HTTP 200, đúng cấu trúc schema Pydantic, uptime và thông tin môi trường.

---

## 7. Phạm vi Giai đoạn 1 & Giới hạn hiện tại

| Tiêu chí | Trạng thái | Ghi chú |
| :--- | :---: | :--- |
| **Electron + React + TS Desktop App** | Hoàn thành | Đã khởi chạy, cô lập Renderer an toàn |
| **Python Runtime độc lập** | Hoàn thành | Chạy bằng FastAPI + Uvicorn tại cổng 8000 |
| **Health Check Endpoint (/health)** | Hoàn thành | Trả về JSON trạng thái, uptime, OS, python version |
| **Giao diện Dashboard kiểm tra runtime** | Hoàn thành | Hiển thị latency, trạng thái kết nối, auto-poll 5s |
| **Hợp đồng Node & Pipeline Schema** | Hoàn thành | Định nghĩa schema nền tảng tại `src/shared/contracts.ts` |
| **TypeScript Typecheck** | Hoàn thành | 0 errors |
| **Frontend Unit Tests (Vitest)** | Hoàn thành | 3/3 tests passed |
| **Python Unit Tests (Pytest)** | Hoàn thành | 2/2 tests passed |

> [!NOTE]
> **Giới hạn hiện tại (Current Limitations):**
> Trong Giai đoạn 1 (Foundation MVP), canvas kéo-thả node chi tiết, thực thi đồ thị DAG, tải ảnh OpenCV và suy luận AI chưa được kích hoạt logic thực tế mà chỉ mới có schema hợp đồng nền tảng (`contracts.ts`). Các tính năng này sẽ được triển khai theo kế hoạch ở các giai đoạn tiếp theo.
