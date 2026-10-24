# Nền tảng Machine Vision trên Windows (Industrial Vision Platform)

Nền tảng kiểm tra bằng thị giác máy tính trong môi trường công nghiệp dành cho hệ điều hành Windows. Ứng dụng cung cấp môi trường kéo thả node trực quan (dựa trên React Flow / `@xyflow/react`), quản lý luồng dữ liệu pipeline dưới định dạng JSON có phiên bản, và phân tách hoàn toàn tầng giao diện với tầng Vision Runtime xử lý ảnh (OpenCV / AI ONNX).

---

## 1. Kiến trúc hệ thống (Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                 Electron Desktop App (Windows)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Renderer Process (Chromium)               │  │
│  │   React 19 + TypeScript (Strict) + Tailwind CSS       │  │
│  │   - UI Areas: Node Library, Pipeline Canvas,          │  │
│  │     Properties Panel, Debug Panel                     │  │
│  │   - State Engine: Zustand (Nodes, Edges, Validation)  │  │
│  │   - Validation Engine: Pure TypeScript + Zod          │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ contextBridge (Safe API)      │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                  Preload Script                       │  │
│  │  - contextIsolation: true                             │  │
│  │  - nodeIntegration: false                             │  │
│  │  - Safe typed APIs (savePipelineFile, openPipelineFile)│ │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │ Main IPC                      │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                  Main Process (Node.js)               │  │
│  │  - Window lifecycle, security sandboxing              │  │
│  │  - Controlled Native File Dialogs (*.json)            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP REST (127.0.0.1:8000)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Python Vision Runtime (FastAPI)                 │
│  - FastAPI REST API + Pydantic v2                           │
│  - Health endpoint: /health                                 │
│  - Tách biệt định nghĩa node (Contracts) với logic thực thi │
│  - Pipeline JSON versioning & DAG Sequential Runner (Phase 3)│
│  - OpenCV + ONNX Runtime (Giai đoạn sau)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Giai đoạn 2: Trình soạn thảo Pipeline (Pipeline Editor)

### 2.1. Bố cục 4 khu vực giao diện Desktop-First
1. **Khu vực A — Node Library (Bên trái):**
   - Phân loại node theo danh mục (`ACQUISITION`, `PREPROCESSING`, `OUTPUT`, ...).
   - Ô tìm kiếm và lọc node tức thì theo tên, mô tả hoặc loại node.
   - Hỗ trợ kéo node từ danh sách thả trực tiếp vào Canvas hoặc bấm nút `(+)` để thêm nhanh.
   - 4 node mẫu:
     - **Image File** (`ACQUISITION`): Cổng xuất `IMAGE`, cấu hình đường dẫn ảnh mẫu (`filePath`).
     - **ROI Crop** (`PREPROCESSING`): Cổng vào `IMAGE`, cổng xuất `IMAGE`, cấu hình vùng cắt `x`, `y`, `width`, `height`.
     - **Threshold** (`PREPROCESSING`): Cổng vào `IMAGE`, cổng xuất `IMAGE`, cấu hình ngưỡng `threshold` (0-255), chế độ `mode` (`BINARY`, `OTSU`, ...), giá trị cực đại `maxVal`.
     - **Result Viewer** (`OUTPUT`): Cổng vào `IMAGE`, tùy chọn hiển thị `showHistogram`, `zoomLevel`, tiêu đề cửa sổ `title`.

2. **Khu vực B — Pipeline Canvas (Trung tâm):**
   - Xây dựng trên `@xyflow/react` với theme nền tảng tối (slate-950).
   - Custom Node Component hiển thị biểu tượng theo danh mục, tên node, cổng vào (trái) và cổng ra (phải) có mã màu tương ứng kiểu dữ liệu (`IMAGE` màu cyan, `NUMBER` màu cam, ...).
   - Đèn báo trạng thái trực quan ngay trên từng node (Xanh: Hợp lệ; Vàng: Cảnh báo cổng bắt buộc chưa nối; Đỏ: Lỗi cấu hình).
   - Hỗ trợ thu phóng (Zoom), di chuyển (Pan), phím tắt `Delete`/`Backspace` để xóa node/edge.
   - Tự động chặn kết nối không hợp lệ (lệch kiểu dữ liệu, tự nối vào chính mình, nhiều dây nối vào 1 cổng input, tạo chu trình lặp gây lỗi DAG).

3. **Khu vực C — Properties Panel (Bên phải):**
   - Hiển thị thông tin chi tiết và danh sách cổng vào/ra của node đang được chọn.
   - Cho phép đổi tên hiển thị (Node Display Name) và các tham số cấu hình.
   - Form cấu hình thay đổi linh hoạt theo loại node với xác thực schema Zod theo thời gian thực (hiển thị thông báo lỗi cụ thể khi nhập sai giá trị).
   - Trạng thái hướng dẫn rõ ràng khi người dùng chưa chọn node nào.

4. **Khu vực D — Debug Panel (Phía dưới):**
   - Thanh công cụ có thể thu gọn / mở rộng.
   - **Tab Validation:** Liệt kê chi tiết danh sách lỗi (Errors), cảnh báo (Warnings), thứ tự thực thi tuần tự (DAG Execution Flow), cảnh báo chu trình kèm danh sách ID node liên quan; khi bấm vào lỗi sẽ tự động chọn node tương ứng trên Canvas.
   - **Tab Logs:** Ghi nhận lịch sử thao tác (thêm node, kết nối, xóa, lưu, tải).
   - **Tab Pipeline JSON:** Hiển thị trực tiếp JSON có cấu trúc versioned theo thời gian thực kèm nút Copy vào bộ nhớ tạm.
   - Hai huy hiệu trạng thái độc lập:
     - `SAVEABLE` / `UNSAVEABLE`: Cho biết pipeline có thể lưu và tiếp tục chỉnh sửa sau này hay không.
     - `EXECUTION READY` / `DRAFT PIPELINE`: Cho biết pipeline đã đáp ứng đầy đủ điều kiện đồ thị DAG, cấu hình hợp lệ và đủ kết nối để thực thi trong Python Runtime hay chưa.

---

## 3. Kiến trúc dữ liệu Pipeline JSON (Schema v1.0.0)

Cấu trúc JSON lưu trữ và trao đổi dữ liệu tuân thủ schema `PipelineDefinitionSchema` từ `src/shared/contracts.ts`:

```json
{
  "schemaVersion": "1.0.0",
  "id": "pipeline_abc123",
  "name": "Inspection Pipeline Sample",
  "description": "Starter optical inspection template",
  "createdAt": "2026-10-24T14:50:00.000Z",
  "updatedAt": "2026-10-24T15:00:00.000Z",
  "metadata": {},
  "nodes": [
    {
      "id": "node_image_file_1",
      "nodeType": "image_file",
      "name": "Image File",
      "position": { "x": 100, "y": 150 },
      "config": { "filePath": "sample_images/pcb_board.png" }
    },
    {
      "id": "node_threshold_1",
      "nodeType": "threshold",
      "name": "Threshold",
      "position": { "x": 450, "y": 150 },
      "config": { "threshold": 128, "mode": "BINARY", "maxVal": 255 }
    }
  ],
  "edges": [
    {
      "id": "edge_img_thresh",
      "sourceNodeId": "node_image_file_1",
      "sourcePortId": "image",
      "targetNodeId": "node_threshold_1",
      "targetPortId": "image_in"
    }
  ]
}
```

### An toàn tập tin qua Electron IPC Bridge
Quá trình lưu/mở file không cấp quyền truy cập Node `fs` trực tiếp cho Renderer mà thông qua các IPC handler được kiểm soát trong `src/main/main.ts` và preload bridge trong `src/main/preload.ts`:
- `savePipelineFile(defaultName, content)` -> `dialog.showSaveDialog` với filter `*.json`
- `openPipelineFile()` -> `dialog.showOpenDialog` với filter `*.json`
- Có cơ chế fallback tự động sang tải file qua trình duyệt (Blob download & HTML file input) khi chạy trong môi trường kiểm thử Vitest hoặc Web dev.

---

## 4. Hướng dẫn chạy và sử dụng Pipeline Editor

### 4.1. Khởi chạy ứng dụng
```powershell
# Chạy cả Vite dev server và Electron App
npm run dev

# Hoặc biên dịch bản production và chạy
npm run build
npm start
```

### 4.2. Hướng dẫn thao tác trên giao diện
1. **Thêm node:** Kéo một node từ thư viện bên trái vào Canvas, hoặc bấm nút `(+)` bên cạnh tên node.
2. **Di chuyển node:** Nhấp và kéo node đến vị trí mong muốn trên Canvas.
3. **Kết nối các cổng:** Kéo từ chấm tròn cổng ra (bên phải node nguồn) tới chấm tròn cổng vào (bên trái node đích). Hệ thống sẽ tự động kiểm tra tính tương thích và từ chối nếu không hợp lệ.
4. **Cấu hình tham số:** Bấm chọn một node trên Canvas; giao diện bên phải sẽ hiển thị các trường cấu hình tương ứng. Nhập giá trị mới, hệ thống sẽ tự động xác thực và cập nhật.
5. **Xóa node/kết nối:** Chọn node hoặc dây nối và nhấn phím `Delete` hoặc `Backspace`, hoặc nhấn biểu tượng thùng rác ở panel bên phải.
6. **Lưu Pipeline:** Nhấn nút `Save` trên thanh công cụ để mở hộp thoại lưu file JSON chuẩn.
7. **Mở Pipeline:** Nhấn nút `Open` hoặc `Import` để tải pipeline từ file JSON có sẵn. Hệ thống sẽ xác thực schema trước khi tải và giữ nguyên toàn bộ ID, vị trí, cấu hình và kết nối.
8. **Chuyển đổi góc nhìn:** Sử dụng thanh điều hướng phía trên để chuyển đổi giữa `Pipeline Editor` và `Python Vision Runtime` (kiểm tra sức khỏe hệ thống từ giai đoạn Foundation).

---

## 5. Kiểm thử tự động (Testing)

### 5.1. Kiểm tra kiểu dữ liệu TypeScript (Strict Typecheck)
```powershell
npm run typecheck
```
*Kết quả:* 0 errors.

### 5.2. Kiểm thử Frontend & Pipeline Test Suites (Vitest)
```powershell
npm run test
```
*Kết quả:* 4 test files / 23 tests passed:
- `src/renderer/pipeline/__tests__/pipelineValidator.test.ts`: Kiểm thử quy tắc DAG, phát hiện chu trình, kiểm tra tương thích kiểu dữ liệu cổng, kiểm tra cổng bắt buộc, kiểm tra schema tham số node.
- `src/renderer/pipeline/__tests__/pipelineStore.test.ts`: Kiểm thử thêm/xóa/sửa node, kết nối dây, lưu, xuất, nhập JSON, cờ dirty, bảo toàn vị trí và cấu hình khi tải lại.
- `src/renderer/pipeline/__tests__/pipelineEditorUI.test.tsx`: Kiểm thử hiển thị danh mục thư viện node, tìm kiếm lọc, hiển thị form động theo node được chọn, điều hướng các tab Debug panel.
- `src/renderer/App.test.tsx`: Kiểm thử tích hợp thanh điều hướng, chuyển đổi giữa Pipeline Editor và Diagnostics Health Dashboard của Foundation.

---

## 6. Trạng thái nghiệm thu Giai đoạn 2

| Tiêu chí nghiệm thu | Trạng thái | Chi tiết |
| :--- | :---: | :--- |
| **Chạy được trong Electron** | Hoàn thành | Đã xác minh qua Electron smoke test (`TEST_EXIT=true`) |
| **Kéo thả, di chuyển, chọn và xóa node** | Hoàn thành | Tích hợp hoàn chỉnh qua `@xyflow/react` và phím tắt Delete/Backspace |
| **Kết nối và ngắt kết nối các node** | Hoàn thành | Hỗ trợ nối cổng tương thích kiểu dữ liệu, xóa kết nối linh hoạt |
| **Ngăn chặn kết nối không hợp lệ** | Hoàn thành | Chặn lệch kiểu dữ liệu, tự nối vòng, trùng cổng input, tạo chu trình DAG |
| **Properties Panel linh hoạt** | Hoàn thành | Tự thay đổi trường theo loại node, hiển thị lỗi Zod real-time |
| **Lưu, xuất, nhập và tải lại Pipeline JSON** | Hoàn thành | Qua Electron Controlled File Dialogs; bảo toàn ID, tọa độ, cấu hình và kết nối |
| **Phân biệt Saveable vs Execution Ready** | Hoàn thành | Hiển thị rõ hai trạng thái riêng biệt trên Debug Panel |
| **Bảo toàn chức năng Health Check Foundation** | Hoàn thành | Tab `Python Vision Runtime` hiển thị đầy đủ dashboard và vượt qua các bài kiểm thử |
| **Typecheck & Vitest** | Hoàn thành | 100% Passed (4/4 test files, 23/23 unit tests) |

> [!NOTE]
> **Phạm vi không thực hiện theo yêu cầu giai đoạn 2:**
> Giai đoạn này không thực hiện gọi xử lý ảnh OpenCV thực tế, tích hợp camera phần cứng, chạy mô hình AI/ONNX hay tích hợp PLC. Toàn bộ kiến trúc dữ liệu và logic pipeline đã sẵn sàng để tích hợp vào engine thực thi của Python Runtime ở giai đoạn tiếp theo.
