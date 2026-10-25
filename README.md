# Nền tảng Machine Vision trên Windows (Industrial Vision Platform)

Nền tảng kiểm tra bằng thị giác máy tính trong môi trường công nghiệp dành cho hệ điều hành Windows. Ứng dụng cung cấp môi trường kéo thả node trực quan (dựa trên React Flow / `@xyflow/react`), quản lý luồng dữ liệu pipeline dưới định dạng file `.mvp` có phiên bản, và tích hợp thực thi pipeline xử lý ảnh thực tế từ đầu đến cuối bằng **OpenCV** trong **Python Vision Runtime (FastAPI)**.

---

## 1. Kiến trúc hệ thống (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                 Electron Desktop App (Windows)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Renderer Process (Chromium)               │  │
│  │   React 19 + TypeScript (Strict) + Tailwind CSS       │  │
│  │   - UI Areas: Node Library, Pipeline Canvas,          │  │
│  │     Properties Panel (Dynamic Form + Preview), Debug  │  │
│  │   - "Run Pipeline" Execution Controller [F5]          │  │
│  │   - Dynamic Node Creator UI (CreateNodeModal)         │  │
│  │   - Extensible Node Registry (Tags, Icons, Descriptors│  │
│  │   - Live Node Status Badges (Idle, Running, Done, Err)│  │
│  │   - Theme Manager: Dark / Light Mode (Persistent)     │  │
│  │   - State Engine: Zustand (Nodes, Edges, MVP File)    │  │
│  │   - Validation Engine: Pure TypeScript + Zod          │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ contextBridge (Safe API)      │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                  Preload Script                       │  │
│  │  - contextIsolation: true                             │  │
│  │  - nodeIntegration: false                             │  │
│  │  - Controlled IPC: save/open .mvp, selectImageFile    │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ Main IPC                      │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                  Main Process (Node.js)               │  │
│  │  - Window lifecycle, security sandboxing              │  │
│  │  - Native Application Menu (File: New, Open, Save...) │  │
│  │  - Controlled Native File Dialogs (*.mvp, Images)     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP REST (127.0.0.1:8000)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Python Vision Runtime (FastAPI)                 │
│  - Pipeline DAG Compilation (Topological Sort / Kahn)       │
│  - Cycle Detection & Error Isolation (Skipped Nodes)        │
│  - Real OpenCV Handlers:                                    │
│    * image_loader (cv2.imread, PNG/JPG/BMP validation)      │
│    * roi_crop (cv2 sub-region slicing with boundary clamp)  │
│    * grayscale (cv2.cvtColor, optional equalizeHist)        │
│    * threshold (cv2.threshold: Binary, Otsu, Trunc, etc.)   │
│    * contour_detection (cv2.findContours, area filter, bbox)│
│    * result_viewer (sink visual frames & inspection report) │
│    * gaussian_blur (cv2.GaussianBlur convolution)           │
│  - Bounded Execution Buffer & TTL Cleanup                   │
│  - Live JPEG Preview Endpoint (/preview)                    │
│  - Monotonic Clock Profiling (time.perf_counter)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Giai đoạn 3: Pipeline xử lý ảnh thực tế bằng OpenCV

### 2.1. Quy trình xử lý ảnh 6 Node mẫu (End-to-End Vision Pipeline)
Khi khởi động ứng dụng, template kiểm tra mạch in công nghiệp (PCB Board Inspection) được nạp sẵn gồm chuỗi 6 node:
1. **Image File Source (`image_file`):** 
   - Đọc ảnh công nghiệp từ đường dẫn cục bộ (PNG, JPEG, BMP).
   - Kiểm tra file tồn tại, không rỗng và giải mã ảnh hợp lệ bằng `cv2.imread`.
   - Cung cấp nút **\"Browse...\"** kích hoạt hộp thoại chọn file gốc thông qua Electron IPC an toàn, không cấp quyền truy cập filesystem trực tiếp cho Renderer.
2. **ROI Crop (`roi_crop`):**
   - Cắt vùng quan tâm xác định bởi `[x, y, width, height]`.
   - Tự động kiểm tra biên ảnh và kẹp tọa độ (clamping) để tránh lỗi tràn bộ nhớ (out of bounds).
3. **Grayscale (`grayscale`):**
   - Chuyển đổi không gian màu từ BGR/BGRA sang ảnh xám 1 kênh (`cv2.COLOR_BGR2GRAY`).
   - Tùy chọn cân bằng biểu đồ sắc độ (`equalizeHist: true`).
4. **Threshold (`threshold`):**
   - Phân ngưỡng nhị phân với các chế độ: `BINARY`, `BINARY_INV`, `TRUNC`, `TOZERO`, `TOZERO_INV`, `OTSU`.
   - Trả về `MaskFrame` và tính toán tỷ lệ điểm sáng (coverage percent).
5. **Contour Detection (`contour_detection`):**
   - Trích xuất đường bao biên dạng chi tiết với `cv2.findContours`.
   - Lọc nhiễu theo diện tích tối thiểu và tối đa (`minArea`, `maxArea`).
   - Trả về kết quả cấu trúc `DetectionResult` (số lượng đối tượng, tọa độ bounding box, tâm centroid, diện tích).
   - Tự động sinh ảnh vẽ viền trực quan (annotated preview) với màu sắc nổi bật và nhãn số thứ tự từng lỗi/vật thể.
6. **Result Viewer (`result_viewer`):**
   - Đóng vai trò là điểm kết thúc (Sink node) cho luồng hình ảnh và kết quả cấu trúc.
   - Tổng hợp báo cáo kết quả kiểm tra (tổng số lỗi, độ bao phủ, trạng thái đạt/không đạt).

### 2.2. Bộ thực thi Pipeline trên Python Runtime (Topological Executor)
- **Biên dịch đồ thị DAG:** Sử dụng thuật toán sắp xếp tô-pô Kahn's Algorithm để xác định thứ tự thực thi chính xác từ các kết nối (Edges).
- **Phát hiện vòng lặp (Cycle Detection):** Từ chối thực thi đồ thị có chu trình khép kín và trả về mã lỗi rõ ràng.
- **Cô lập lỗi (Error Isolation):** Nếu một node gặp lỗi (ví dụ file ảnh không tồn tại hoặc tọa độ ROI không hợp lệ), node đó được đánh dấu `failed`, toàn bộ node phía sau phụ thuộc dữ liệu của nó được đánh dấu `skipped`, không làm sập server Python hay ứng dụng desktop.
- **Đo lường thời gian chính xác:** Sử dụng đồng hồ đơn điệu `time.perf_counter()` để đo thời gian xử lý thực tế từng mili-giây (ms) của từng node.

### 2.3. Quản lý bộ nhớ đệm (Execution Buffer & Cleanup)
- Dữ liệu ảnh thô (`numpy.ndarray`) không gửi trực tiếp qua JSON để tránh làm nghẽn IPC/HTTP.
- Dữ liệu được lưu trong `ExecutionBuffer` nội tại của Python, tự động nén JPEG kích thước vừa phải (thumbnail preview) khi client yêu cầu.
- Tự động dọn dẹp các phiên thực thi cũ sau khoảng thời gian sống (TTL = 15 phút) hoặc giải phóng tức thì khi gọi `DELETE /api/pipeline/executions/{id}`.

### 2.4. Trực quan hóa kết quả trên giao diện Desktop
- **Nút "Run Pipeline" [F5]:** Đặt ở thanh công cụ phía trên kèm phím tắt F5 hoặc Ctrl+Enter. Hiển thị trạng thái xoay vòng khi đang xử lý và huy hiệu thời gian tổng (ví dụ `14.2ms`) khi hoàn tất.
- **Trạng thái node trên Canvas:** Từng node trên màn hình hiển thị trực quan trạng thái thực thi: biểu tượng Running xoay, huy hiệu xanh Completed kèm thời gian `XX.X ms`, hoặc huy hiệu đỏ Failed khi có lỗi.
- **Bảng thông số & Preview (Properties Panel):**
  - **Intermediate Preview Image (`ImagePreviewBox`):** Hỗ trợ xem ảnh sắc nét với nhiều chế độ nền (Checkerboard, Dark, Light), zoom phóng to/thu nhỏ, tải ảnh về máy và chế độ Fullscreen Inspection phóng to toàn màn hình.
  - **Frame Metadata:** Kích thước (Width x Height), số kênh màu (Channels), Color Space, Kiểu dữ liệu (dtype).
  - **Structured Feature List:** Danh sách từng đối tượng phát hiện được (Bounding Box x, y, w, h và diện tích px²).

---

## 3. Các API Endpoints của Python Vision Runtime

| Phương thức | Đường dẫn | Chức năng |
| :--- | :--- | :--- |
| `GET` | `/health` | Kiểm tra trạng thái hoạt động của Python Runtime và thông tin hệ điều hành |
| `GET` | `/api/pipeline/supported-nodes` | Danh sách các node và handler đã được đăng ký trong Runtime |
| `POST` | `/api/pipeline/validate` | Kiểm tra tính hợp lệ của pipeline trước khi chạy (DAG, types, configs) |
| `POST` | `/api/pipeline/execute` | Thực thi pipeline từ đầu đến cuối và lưu kết quả vào buffer |
| `GET` | `/api/pipeline/executions/{id}` | Lấy tóm tắt và metadata của một phiên thực thi đã chạy |
| `GET` | `/api/pipeline/executions/{id}/nodes/{node_id}/preview` | Truy xuất ảnh preview định dạng JPEG của node cụ thể |
| `DELETE` | `/api/pipeline/executions/{id}` | Xóa bỏ kết quả và giải phóng bộ nhớ của phiên thực thi |

---

## 4. Khắc phục lỗi hiển thị ảnh & Chức năng Giao diện Sáng / Tối

### 4.1. Khắc phục lỗi khung hiển thị ảnh bị màu đen (Black Preview Frame)
- **Nguyên nhân chính:** Thẻ meta `Content-Security-Policy` trong `index.html` trước đó chỉ cho phép `img-src 'self' data: blob:;`. Do đó, Chromium trong Electron đã chặn yêu cầu tải ảnh từ endpoint Python Runtime cục bộ `http://127.0.0.1:8000/api/pipeline/executions/.../preview`. Khi bị chặn, hàm `onError` ẩn thẻ `img`, để lại khung nền màu đen `bg-black/60`.
- **Giải pháp triệt để:**
  1. **Cập nhật Content Security Policy (`index.html`):** Cho phép `img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*;`.
  2. **Xây dựng component `ImagePreviewBox` chuyên dụng:**
     - Tải ảnh qua Blob ObjectURL với fallback URL trực tiếp và xử lý cache-busting.
     - Hiển thị spinner loading rõ ràng và thông báo lỗi có nút **\"Thử lại (Reload)\"** thay vì ẩn thẻ.
     - Tích hợp 3 chế độ nền hiển thị: **Checkerboard (caro độ tương phản cao)** giúp phân biệt rõ ảnh nhị phân / viền đen với nền container, nền **Dark**, và nền **Light**.
     - Cung cấp công cụ zoom (+/- / Reset 100%), tải ảnh và phóng to toàn màn hình (Fullscreen Modal).

### 4.2. Chức năng chuyển đổi giao diện Sáng / Tối (Light / Dark Mode Switcher)
- **Quản lý trạng thái (`useThemeStore`):** Sử dụng Zustand với persistence vào `localStorage` (`mvp_theme`). Tự động cập nhật class `dark` / `light` trên thẻ `<html>` và thuộc tính `data-theme`.
- **Cấu hình Tailwind CSS:** Kích hoạt `darkMode: 'class'`.
- **Nút chuyển đổi giao diện:** Bố trí nút bấm trực quan (biểu tượng Mặt Trời ☀️ / Mặt Trăng 🌙) tại thanh tiêu đề ứng dụng (Header) và thanh công cụ PipelineEditor.
- **Đồng bộ toàn bộ thành phần giao diện:** Toàn bộ Header, Node Library, Pipeline Canvas (lưới chấm, minimap, controls), Custom Nodes, Properties Panel, Debug Panel và Modal tạo Node đều hỗ trợ hiển thị hoàn hảo ở cả 2 chế độ Sáng và Tối.

---

## 5. Định dạng file Pipeline `.mvp` (Machine Vision Pipeline)

### 5.1. Bản chất định dạng
- Phần mở rộng: `.mvp` (Ví dụ: `pcb_inspection.mvp`).
- Cấu trúc: JSON thuần có quản lý phiên bản (`schemaVersion: "1.0.0"`) và định danh `fileFormat: "MVP_PIPELINE"`.
- Không sử dụng file nén ZIP hoặc định dạng nhị phân trong giai đoạn này.

### 5.2. Thao tác Lưu & Mở file an toàn qua Electron IPC
- **Save (`Ctrl+S`):** Lưu trực tiếp vào file `.mvp` hiện tại nếu đã lưu trước đó, hoặc mở hộp thoại Save dialog nếu chưa lưu.
- **Save As (`Ctrl+Shift+S`):** Luôn mở hộp thoại Save dialog để người dùng chỉ định đường dẫn `.mvp` mới.
- **Tự động thêm đuôi `.mvp`:** Nếu người dùng gõ tên file mà quên phần mở rộng, hệ thống tự động chuẩn hóa thành `*.mvp`.
- **Tương thích ngược (Backwards Compatibility):** Hỗ trợ mở cả file `.mvp` mới và file `.json` legacy đã tạo trước đó.
- **Bảo toàn dữ liệu:** Không làm mất ID, tọa độ, kết nối, cấu hình hoặc các metadata mở rộng khi lưu và mở lại.

---

## 6. Kiến trúc Node Registry & UI Custom Node Creator

### 6.1. Thêm Node trực tiếp trên giao diện (UI Dynamic Node Creator)
1. Nhấp vào nút **`+ Custom`** ở tiêu đề khu vực **Node Library**.
2. Hộp thoại **Create Custom Node** mở ra, cho phép cấu hình trực quan:
   - **Định danh & Thông tin chung:** `Node Type ID`, `Display Name`, `Category`, `Icon` và `Search Tags`.
   - **Hợp đồng cổng dữ liệu (Ports Contract):** Tùy ý thêm/bớt các cổng Input và Output, chỉ định kiểu dữ liệu (`ImageFrame`, `MaskFrame`, `DetectionResult`, `MeasurementResult`, `Scalar`, `Boolean`, ...).
   - **Bộ tham số cấu hình (Dynamic Config Parameters):** Thêm các trường tham số (`number`, `range / slider`, `text`, `checkbox`) kèm giá trị mặc định, min/max.
3. Node lập tức xuất hiện trong danh mục Node Library và có thể kéo thả, nối dây, hiệu chỉnh tham số ngay lập tức.

### 6.2. Chuẩn hóa hệ thống Data Types
- **Visual Frames:** `ImageFrame` (tương thích 2 chiều với `IMAGE`), `MaskFrame` (tương thích kết nối vào cổng nhận `ImageFrame`).
- **Inspection & AI Data:** `DetectionResult` (tương thích `DETECTIONS`), `ClassificationResult`, `OCRResult`.
- **Metrology & Measurements:** `MeasurementResult`, `InspectionResult`, `Scalar`, `Boolean`.
- **Tương thích kiểu dữ liệu:** Được kiểm tra tập trung qua hàm `areDataTypesCompatible(sourceType, targetType)` trong `src/shared/contracts.ts`.

---

## 7. Hướng dẫn chạy, kiểm thử & Xử lý sự cố

### 7.1. Khởi chạy Python Vision Runtime
Môi trường Python yêu cầu OpenCV và FastAPI (Sử dụng Conda environment `LabelCheckAPI` hoặc môi trường đã cài đặt):
```powershell
# Kích hoạt conda environment đã cài đặt opencv
conda activate LabelCheckAPI

# Chạy Python Vision Runtime trên cổng 8000
npm run py:start

# Hoặc khởi chạy trực tiếp bằng python
python -m vision_runtime.main
```

### 7.2. Khởi chạy Desktop Application (Electron + React)
```powershell
# Chạy ứng dụng ở chế độ phát triển
npm run dev

# Hoặc biên dịch bản production và chạy
npm run build
npm start
```

### 7.3. Kiểm thử tự động (100% Pass Rate)
```powershell
# 1. Kiểm thử Frontend (37 tests Vitest) + TypeScript strict check
npm run typecheck
npm run test

# 2. Kiểm thử Python Runtime (18 tests Pytest)
conda activate LabelCheckAPI
pytest python_runtime/tests -v
```

### 7.4. Xử lý sự cố (Troubleshooting): Lỗi `ImportError: numpy.core.multiarray failed to import`

#### Nguyên nhân:
Lỗi này xảy ra khi môi trường Python cài đặt **NumPy 2.x** (ví dụ 2.0+, 2.2+) trong khi thư viện **OpenCV (`opencv-python`)** được biên dịch bằng C-API của **NumPy 1.x** (C-extension ABI không tương thích giữa 1.x và 2.x).

#### Cách khắc phục:
1. **Khắc phục nhanh qua pip (Khuyến nghị):**
   Hạ cấp `numpy` về phiên bản `1.x` mới nhất:
   ```powershell
   pip install "numpy<2"
   ```
2. **Cài đặt lại dependencies theo đúng file [`python_runtime/requirements.txt`](file:///C:/project/machine_vision_platform/python_runtime/requirements.txt):**
   ```powershell
   pip install -r python_runtime/requirements.txt
   ```
3. **Kiểm tra import thành công:**
   ```powershell
   python -c "import cv2, numpy; print('OpenCV:', cv2.__version__, '| NumPy:', numpy.__version__)"
   ```

---

## 8. Bảng tổng hợp trạng thái nghiệm thu

| Hạng mục kiểm tra | Trạng thái | Chi tiết triển khai |
| :--- | :---: | :--- |
| **Sửa lỗi hiển thị ảnh đen (Image Preview Box)** | Hoàn thành | Cập nhật CSP `img-src` cho `127.0.0.1:*`, tải ảnh an toàn qua Blob URL, nền caro (checkerboard) cho binary mask, zoom/pan/fullscreen |
| **Giao diện Sáng / Tối (Dark / Light Theme)** | Hoàn thành | Zustand themeStore với `localStorage`, nút chuyển đổi Header & Toolbar, đồng bộ React Flow, toàn bộ panels và modals |
| **OpenCV Image Processing** | Hoàn thành | Đầy đủ 6 node cốt lõi: `image_file`, `roi_crop`, `grayscale`, `threshold`, `contour_detection`, `result_viewer` + `gaussian_blur` |
| **Topological DAG Executor** | Hoàn thành | Sắp xếp tô-pô theo thuật toán Kahn, phát hiện chu trình, cô lập lỗi và đo lường thời gian thực thi bằng `time.perf_counter()` |
| **Execution Buffer & Preview API** | Hoàn thành | Lưu trữ đệm trong RAM có giới hạn, dọn dẹp theo TTL, nén ảnh JPEG preview phục vụ giao diện |
| **Electron Controlled Image Picker** | Hoàn thành | IPC `dialog:select-image` kết hợp preload bridge `selectImageFile` và nút Browse trên form cấu hình |
| **Giao diện Pipeline Editor tích hợp** | Hoàn thành | Nút \"Run Pipeline\" [F5], huy hiệu trạng thái trên canvas, hiển thị ảnh preview và bảng đối tượng phát hiện trên Properties Panel |
| **Định dạng file .mvp** | Hoàn thành | Lưu/mở pipeline .mvp giữ nguyên cấu trúc, tương thích ngược với JSON |
| **Kiểm thử tự động** | Hoàn thành | **37/37 Vitest tests** + **18/18 Pytest tests** vượt qua 100%, 0 lỗi TypeScript strict |
