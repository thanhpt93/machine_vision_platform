# Nền tảng Machine Vision trên Windows (NOVA Industrial Vision Platform)

Nền tảng kiểm tra bằng thị giác máy tính trong môi trường công nghiệp dành cho hệ điều hành Windows. Ứng dụng cung cấp hai chế độ vận hành riêng biệt và hai bộ cài đặt Windows (NSIS Installer) độc lập từ chung một codebase:
1. **Developer Edition (`NOVA Machine Vision Platform — Developer Edition`):** Môi trường kéo thả node trực quan (React Flow), cấu hình tham số, kiểm thử và phát hành phiên bản pipeline bất biến (`Release for Production`) dưới định dạng `.mvp`, đồng thời hỗ trợ chuyển đổi sang giao diện Production Mode để kiểm thử.
2. **Production Edition (`NOVA Machine Vision Platform — Production Edition`):** Ứng dụng trạm kiểm tra công nghiệp chuyên dụng mở trực tiếp vào **Production Mode UI** khi khởi động, ẩn và khóa toàn bộ tính năng chỉnh sửa pipeline / Developer Mode / DevTools, tự động khởi chạy và quản lý tiến trình **Python Vision Runtime (FastAPI + OpenCV)**, và lưu trữ dữ liệu phát hành / lịch sử kiểm tra trong thư mục dữ liệu người dùng Windows (`%APPDATA%`).

---

## 1. Kiến trúc hệ thống (Architecture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 Electron Desktop App (Windows Workstation)              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                 Renderer Process (React 19 + TS)                  │  │
│  │  ┌─────────────────────────────┐ ┌─────────────────────────────┐  │  │
│  │  │       Developer Mode        │ │       Production Mode       │  │  │
│  │  │ - React Flow DAG Editor     │ │ - Production Dashboard      │  │  │
│  │  │ - 9 Industrial Categories   │ │ - Inspection Workstation    │  │  │
│  │  │ - Node Properties & Debug   │ │ - Inspection History        │  │  │
│  │  │ - Validate & Release (.mvp) │ │ - Pipeline Management (R/O) │  │  │
│  │  │                             │ │ - System Status & Settings  │  │  │
│  │  └──────────────┬──────────────┘ └──────────────┬──────────────┘  │  │
│  └─────────────────┼───────────────────────────────┼─────────────────┘  │
│                    │ contextBridge (Safe IPC)      │                    │
│  ┌─────────────────▼───────────────────────────────▼─────────────────┐  │
│  │               Preload & Main Process (Sandboxed)                  │  │
│  │  - Edition Isolation (Developer vs Production IPC & Menu Guards)  │  │
│  │  - Managed RuntimeProcessManager (Auto-Start/Health/Clean Exit)   │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │ HTTP REST (127.0.0.1:8000)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Python Vision Runtime (FastAPI)                      │
│  - Pipeline DAG Validator & Topological Executor                        │
│  - Immutable Release Manager (SHA-256 Checksum & Atomic Persistence)    │
│  - Production Inspection Service (Strict Separation of Execution Status │
│    QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED vs Outcome OK/NG/UNKNOWN)  │
│  - 81 Real OpenCV / NumPy Handlers across 9 Industrial Categories       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 9 Danh mục Node Chuẩn Công nghiệp (9 Standard Industrial Categories)

Hệ thống triển khai đầy đủ 9 nhóm chức năng xử lý ảnh truyền thống bằng OpenCV/NumPy (không sử dụng neural network/ONNX trong giai đoạn này, đảm bảo kiến trúc mở rộng sẵn sàng cho AI ở các giai đoạn sau):

### 1. Image Acquisition (`image_acquisition`)
- `image_file`: Nạp ảnh tĩnh từ đĩa (PNG, JPEG, BMP).
- `image_folder`: Nạp hàng loạt ảnh theo thư mục.
- `image_sequence`: Duyệt và stream chuỗi ảnh theo pattern số thứ tự.
- `image_copy`: Nhân bản bộ đệm ảnh độc lập (deep copy).

### 2. Image Preparation (`image_preparation`)
- `roi_crop`: Cắt vùng quan tâm xác định bởi tọa độ `[x, y, width, height]`.
- `resize`: Thay đổi kích thước ảnh theo kích thước tuyệt đối hoặc tỷ lệ.
- `color_convert`: Chuyển đổi không gian màu (BGR2GRAY, BGR2HSV, BGR2RGB, BGR2LAB).
- `normalize`: Chuẩn hóa dải độ sáng theo Min-Max scaling.
- `blur_denoise`: Khử nhiễu với Gaussian Blur, Median Filter hoặc Bilateral Filter.
- `brightness_contrast`: Hiệu chỉnh độ tương phản (Alpha) và độ sáng (Beta).
- `histogram_equalize`: Cân bằng biểu đồ sắc độ toàn cục hoặc cục bộ (CLAHE).
- `sharpen`: Tăng cường độ nét biên dạng bằng unsharp mask.
- `invert`: Đảo ngược giá trị điểm ảnh (255 - pixel).
- `image_arithmetic`: Cộng, trừ hoặc hòa trộn (blend) 2 khung hình.
- `flip_rotate`: Lật gương (ngang, dọc) hoặc xoay góc 90°, 180°, 270°.
- `padding_border`: Thêm viền đệm biên ảnh (constant, replicate, reflect).

### 3. Image Processing (`image_processing`)
- `threshold`: Phân ngưỡng nhị phân (Binary, Binary Invert, Trunc, ToZero).
- `adaptive_threshold`: Phân ngưỡng thích nghi theo ánh sáng vùng (Mean, Gaussian).
- `otsu_threshold`: Tự động tìm ngưỡng tối ưu Otsu.
- `color_threshold`: Trích xuất mặt nạ màu theo dải ngưỡng HSV/BGR (`cv2.inRange`).
- `morphology`: Phép toán hình thái học (Erode, Dilate, Open, Close, Gradient, TopHat).
- `edge_detection`: Phát hiện biên độ tương phản cao (Canny, Sobel, Laplacian).
- `gradient_derivatives`: Tính toán đạo hàm không gian Sobel/Scharr và độ lớn gradient.
- `image_filter`: Tích chập ảnh với ma trận kernel tùy biến (Emboss, Ridge, Blur).
- `hough_transform`: Trích xuất đường thẳng hoặc đường tròn tham số bằng biến đổi Hough.
- `template_matching`: Định vị mẫu hoa văn chuẩn trên ảnh kiểm tra (`cv2.matchTemplate`).
- `background_subtraction`: Phân đoạn khuyết tật/chuyển động so với ảnh nền mẫu.
- `image_registration`: Căn chỉnh tọa độ ảnh mục tiêu theo mẫu chuẩn (Translation, Homography).

### 4. Segmentation (`segmentation`)
- `threshold_segmentation`: Phân đoạn đối tượng tiền ảnh theo dải ngưỡng min/max.
- `color_segmentation`: Cô lập đối tượng theo khoảng màu sắc Hue-Saturation-Value.
- `connected_components`: Gán nhãn các thành phần liên thông, tính tâm và diện tích.
- `watershed_segmentation`: Tách các đối tượng dính liền/chồng lấn bằng thuật toán Watershed.
- `grabcut_segmentation`: Tách tiền ảnh tương tác dựa trên hộp bao bằng GrabCut.
- `mask_operations`: Phép toán logic bitwise (AND, OR, XOR, NOT) giữa các mặt nạ.
- `region_filter`: Lọc bỏ vùng nhiễu theo diện tích tối thiểu/tối đa và tỷ lệ khung hình.

### 5. Feature Extraction (`feature_extraction`)
- `contour_detection`: Trích xuất đường bao biên dạng, tính bounding box và ảnh preview.
- `contour_filter`: Lọc đường bao theo diện tích, chu vi và độ tròn (circularity).
- `blob_analysis`: Phân tích đốm/vết bẩn bằng `cv2.SimpleBlobDetector`.
- `shape_analysis`: Tính toán thông số hình học (độ lồi, độ tròn, tỷ lệ dài/rộng, moments).
- `bounding_geometry`: Trích xuất hộp bao thẳng, hộp bao xoay tối thiểu, và đường tròn ngoại tiếp.
- `corner_detection`: Phát hiện góc đặc trưng dưới mức pixel bằng Shi-Tomasi hoặc Harris.
- `keypoint_detection`: Trích xuất điểm quan tâm truyền thống (ORB, FAST).
- `line_circle_extraction`: Khớp đoạn thẳng và đường tròn hình học.
- `image_statistics`: Thống kê cường độ điểm ảnh (mean, std dev, min, max, entropy).
- `projection_profile`: Biểu đồ chiếu mật độ điểm ảnh theo chiều ngang và dọc.

### 6. Measurement & Metrology (`measurement_metrology`)
- `distance_measurement`: Đo khoảng cách Euclid và chênh lệch dX, dY giữa 2 điểm/tâm.
- `line_measurement`: Đo chiều dài và góc phương vị của đoạn thẳng.
- `circle_measurement`: Đo đường kính, bán kính, chu vi và tọa độ tâm lỗ/tròn.
- `rectangle_measurement`: Đo chiều rộng, chiều cao, đường chéo và tỷ lệ khung hình.
- `angle_measurement`: Đo góc phẳng (độ và radian) tạo bởi 3 điểm hoặc 2 đường thẳng.
- `caliper_measurement`: Thước đo quang học 1D dò chuyển tiếp biên độ tương phản trên search rake.
- `gap_measurement`: Đo khe hở và độ phẳng (flushness) giữa 2 mép chi tiết song song.
- `area_measurement`: Tính diện tích bề mặt thực tế theo đơn vị hiệu chuẩn (mm², µm²).
- `tolerance_check`: So sánh kích thước đo được với giới hạn dung sai trên/dưới (LSL, USL).
- `pixel_calibration`: Xác định ma trận tỷ lệ chuyển đổi pixel sang đơn vị kỹ thuật (mm/pixel).

### 7. Decision & Inspection Logic (`decision_inspection_logic`)
- `compare`: So sánh giá trị với ngưỡng chuẩn theo toán tử (=, !=, <, <=, >, >=).
- `range_check`: Kiểm tra giá trị nằm trong hay ngoài dải dung sai cho phép [min, max].
- `logic_gate`: Cổng logic chuẩn (AND, OR, NOT, XOR, NAND, NOR).
- `conditional_branch`: Rẽ nhánh luồng dữ liệu theo điều kiện Đúng / Sai.
- `count_check`: Kiểm tra số lượng chi tiết/chân linh kiện có đúng số lượng quy định.
- `presence_check`: Phát hiện sự hiện diện hay thiếu sót của chi tiết, tem nhãn, gioăng.
- `rule_evaluation`: Đánh giá bảng luật kết hợp nhiều điều kiện kiểm tra logic.
- `decision_ok_ng`: Xuất phán quyết tổng thể OK / NG kèm mã lỗi khuyết tật (defect code).
- `result_aggregation`: Tổng hợp kết quả từ nhiều trạm kiểm tra thành phán quyết cuối cùng.

### 8. Visualization (`visualization`)
- `result_viewer`: Hiển thị khung hình kết quả, lớp phủ biên dạng và số liệu kiểm tra.
- `image_overlay`: Hòa trộn mặt nạ màu hoặc biểu đồ nhiệt bán trong suốt lên ảnh gốc.
- `draw_roi`: Vẽ khung vùng kiểm tra ROI và nhãn tọa độ lên ảnh.
- `draw_contours`: Vẽ viền đường bao phát hiện được với màu sắc và độ dày tùy chọn.
- `draw_measurement`: Vẽ mũi tên kích thước, đường gióng và nhãn giá trị đo lường.
- `draw_labels`: Vẽ nhãn văn bản trạng thái kiểm tra (OK/NG, tên chi tiết, mã sản phẩm).
- `mask_viewer`: Hiển thị mặt nạ nhị phân 1 kênh bằng bảng màu tương phản cao (colormap).
- `histogram_viewer`: Vẽ biểu đồ phân bố tần suất sắc độ điểm ảnh.
- `inspection_result_viewer`: Giao diện Heads-Up Display (HUD) công nghiệp với thanh banner trạng thái đạt/hỏng toàn màn hình.

### 9. Data & Logging (`data_logging`)
- `save_image`: Lưu ảnh đã xử lý xuống ổ đĩa (PNG, JPEG, BMP).
- `save_measurement`: Ghi nhật ký số liệu đo lường ra file JSON có dấu thời gian.
- `save_defect_image`: Lưu trữ có điều kiện: chỉ lưu ảnh khi sản phẩm bị lỗi (NG).
- `export_csv`: Ghi nối tiếp dòng kết quả kiểm tra vào bảng tính CSV phục vụ SPC.
- `inspection_logger`: Ghi log sự kiện có cấu trúc (timestamp, part ID, cycle time).
- `result_history`: Quản lý bộ đệm xoay vòng (ring buffer) các lượt kiểm tra gần nhất.

---

## 3. Các API Endpoints của Python Vision Runtime

### 3.1. Pipeline Editor & Runtime Health (`/health`, `/api/pipeline`)
| Phương thức | Đường dẫn | Chức năng |
| :--- | :--- | :--- |
| `GET` | `/health` | Kiểm tra trạng thái hoạt động của Python Runtime, số lượng node hỗ trợ và trạng thái inspection đang chạy |
| `GET` | `/api/pipeline/supported-nodes` | Danh sách 48 node OpenCV và handler đã được đăng ký trong Runtime |
| `POST` | `/api/pipeline/validate` | Kiểm tra tính hợp lệ của pipeline trước khi chạy (DAG, port types, configs, error codes) |
| `POST` | `/api/pipeline/execute` | Thực thi pipeline từ đầu đến cuối trong chế độ Editor và lưu kết quả vào buffer |
| `GET` | `/api/pipeline/executions/{id}/nodes/{node_id}/preview` | Truy xuất ảnh preview định dạng JPEG của node cụ thể |
| `DELETE` | `/api/pipeline/executions/{id}` | Xóa bỏ kết quả và giải phóng bộ nhớ của phiên thực thi |

### 3.2. Phase 2 — Pipeline Validation & Release Management (`/api/releases`)
| Phương thức | Đường dẫn | Chức năng |
| :--- | :--- | :--- |
| `POST` | `/api/releases/drafts` | Lưu hoặc cập nhật bản nháp pipeline (`Draft`); mọi chỉnh sửa tự động đưa trạng thái về `Draft` |
| `GET` | `/api/releases/drafts/{pipeline_id}` | Truy xuất trạng thái vòng đời (`Draft` / `Validated` / `Released`) của pipeline |
| `POST` | `/api/releases/validate` | Kiểm định nghiêm ngặt pipeline và chuyển trạng thái `Draft → Validated` |
| `POST` | `/api/releases` | Phát hành bản chụp bất biến (`ReleaseSnapshot`) kèm mã băm chuẩn hóa SHA-256 (`checksum`) |
| `GET` | `/api/releases` | Liệt kê danh sách các bản phát hành (mặc định lọc bỏ các bản đã `Archived`) |
| `GET` | `/api/releases/{pipeline_id}/active` | Truy xuất bản phát hành đang kích hoạt (`is_active=true`) và kiểm tra tính toàn vẹn SHA-256 |
| `GET` | `/api/releases/{pipeline_id}/{release_version}` | Xem chi tiết bản phát hành và trạng thái toàn vẹn checksum |
| `GET` | `/api/releases/{pipeline_id}/{release_version}/verify` | Kiểm tra độc lập mã băm SHA-256 phát hiện chỉnh sửa trái phép |
| `POST` | `/api/releases/{pipeline_id}/{release_version}/archive` | Lưu trữ (`Released → Archived`) mà không xóa bỏ artifact lịch sử |
| `POST` | `/api/releases/rollback` | Khôi phục / kích hoạt lại một phiên bản phát hành hợp lệ trước đó |

### 3.3. Phase 3 & Production Mode UI API (`/api/production`)
| Phương thức | Đường dẫn | Chức năng |
| :--- | :--- | :--- |
| `GET` | `/api/production/releases` | Danh sách các bản phát hành pipeline (mặc định chỉ trả về các bản hợp lệ sẵn sàng chạy Production; hỗ trợ `include_archived=true` cho trang quản lý Read-Only) |
| `GET` | `/api/production/releases/{pipeline_id}/{release_version}` | Chi tiết bản phát hành Production kèm báo cáo toàn vẹn SHA-256 và danh sách node |
| `GET` | `/api/production/images/info` | Kiểm tra file ảnh đầu vào trên máy trạm và trả về kích thước `(width, height, channels, file_size_bytes)` |
| `GET` | `/api/production/images/preview` | Stream ảnh JPEG preview của file ảnh gốc đã chọn trong Production Mode |
| `POST` | `/api/production/inspections` | Khởi chạy kiểm tra Production trên bản phát hành bất biến và file ảnh đầu vào (tách biệt `execution_status` và `inspection_outcome`: `OK` / `NG` / `UNKNOWN`) |
| `GET` | `/api/production/inspections` | Liệt kê lịch sử các bản ghi kiểm tra Production gần nhất |
| `GET` | `/api/production/inspections/{inspection_id}/status` | Truy vấn trạng thái vòng đời kiểm tra (`QUEUED → RUNNING → COMPLETED / FAILED / CANCELLED`) |
| `GET` | `/api/production/inspections/{inspection_id}` | Truy vấn toàn bộ kết quả đo lường, phán quyết (`OK`/`NG`/`UNKNOWN`), thời gian chạy và preview references |
| `GET` | `/api/production/inspections/{inspection_id}/nodes/{node_id}/preview` | Truy xuất ảnh JPEG preview gắn riêng với `inspection_id` và `node_id` |
| `POST` | `/api/production/inspections/{inspection_id}/cancel` | Yêu cầu hủy lượt kiểm tra hoặc trả về trạng thái kết thúc rõ ràng (`409 Conflict` nếu đã hoàn tất) |

---

## 4. Đóng gói & Cài đặt trên Windows (Developer Edition vs Production Edition)

Dự án hỗ trợ đóng gói hai phiên bản độc lập cho Windows 10/11 (x64) từ cùng một codebase bằng `electron-builder`:

| Thuộc tính | Developer Edition | Production Edition |
| :--- | :--- | :--- |
| **Tên sản phẩm** | `NOVA Machine Vision Platform — Developer Edition` | `NOVA Machine Vision Platform — Production Edition` |
| **Application ID** | `com.nova.machinevision.developer` | `com.nova.machinevision.production` |
| **Giao diện mặc định** | Pipeline Editor + Mode Switcher | Mở trực tiếp vào **Production Mode UI** |
| **Quyền chỉnh sửa Pipeline** | Đầy đủ (Editor, Save/Open `.mvp`, Release) | Khóa hoàn toàn (Read-Only, ẩn Editor, IPC & `/api/pipeline`) |
| **File bộ cài đặt (`.exe`)** | `release/developer/NOVA-Machine-Vision-Developer-Setup-0.1.0.exe` | `release/production/NOVA-Machine-Vision-Production-Setup-0.1.0.exe` |
| **Thư mục dữ liệu & Logs** | `python_runtime/data` (hoặc `%APPDATA%`) | `%APPDATA%/NOVA Machine Vision Platform Production/runtime_data` & `logs` |

### Các lệnh Build & Đóng gói bộ cài đặt Windows

```powershell
# 1. Build mã nguồn cho từng phiên bản
npm run build:developer
npm run build:production

# 2. Chạy thử trực tiếp trên môi trường local theo từng chế độ
npm run start:developer
npm run start:production

# 3. Đóng gói thư mục chạy thử (win-unpacked)
npm run package:developer
npm run package:production

# 4. Xuất file cài đặt Windows NSIS Installer (.exe)
npm run dist:developer
npm run dist:production
```

---

## 5. Kiểm thử tự động (100% Pass Rate)

Hệ thống được kiểm thử tự động toàn diện từ unit test từng handler, quản lý phát hành (Phase 2), thực thi Production (Phase 3), giao diện Production Mode UI, phân tách quyền hạn đóng gói Production Edition đến kiểm thử tích hợp toàn bộ luồng đồ thị DAG trên cả Frontend và Backend:

```powershell
# 1. Kiểm thử Frontend (57 tests Vitest) + TypeScript strict check
npm run typecheck
npm test -- --run

# 2. Kiểm thử Python Runtime trên môi trường Conda `api` (58 tests Pytest)
C:\Users\admin\miniconda3\envs\api\python.exe -m pytest python_runtime/tests/ -v
```

---

## 6. Bảng tổng hợp trạng thái nghiệm thu

| Hạng mục kiểm tra | Trạng thái | Chi tiết triển khai |
| :--- | :---: | :--- |
| **9 Standard Industrial Categories** | Hoàn thành | Đầy đủ 9 danh mục: Acquisition, Preparation, Processing, Segmentation, Features, Metrology, Logic, Visualization, Data & Logging |
| **Real OpenCV Handlers** | Hoàn thành | Handlers viết bằng OpenCV/NumPy thực tế, không có mock/fake algorithms, không phụ thuộc AI/ONNX |
| **Phase 1 — Production Readiness Audit** | Hoàn thành | Báo cáo kiểm toán đầy đủ tại `docs/PRODUCTION_FOUNDATION_AUDIT.md` |
| **Phase 2 — Validation & Release Management** | Hoàn thành | Vòng đời `Draft → Validated → Released → Archived`, SHA-256 canonical checksum, lưu trữ nguyên tử (`os.replace`), rollback & migration `.mvp` |
| **Phase 3 — Production Execution API** | Hoàn thành | Vòng đời `QUEUED → RUNNING → COMPLETED / FAILED / CANCELLED`, tách biệt `execution_status` và `inspection_outcome` (`OK`, `NG`, `UNKNOWN`), khóa đồng thời an toàn |
| **Production Mode UI (NOVA Workstation)** | Hoàn thành | 6 trang chức năng (`Dashboard`, `Inspection`, `History`, `Pipeline Management Read-Only`, `System Status`, `Settings`), chuyển đổi `Developer Mode` / `Production Mode`, phát hành trực tiếp từ Editor |
| **Production Edition Packaging (Windows NSIS)** | Hoàn thành | Bộ cài đặt riêng biệt `NOVA-Machine-Vision-Production-Setup-0.1.0.exe` và `NOVA-Machine-Vision-Developer-Setup-0.1.0.exe`, tự động quản lý vòng đời Python Runtime và phân tách `%APPDATA%` |
| **Kiểm thử tự động** | Hoàn thành | **57/57 Vitest tests** + **58/58 Pytest tests** vượt qua 100%, 0 lỗi TypeScript strict |
