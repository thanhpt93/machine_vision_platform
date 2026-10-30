import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AiModelRegistry } from '../AiModelRegistry';
import { runtimeApi } from '../../services/runtimeApi';
import { AiModelItem, HardwareInfo } from '../../types/api';

vi.mock('../../services/runtimeApi', () => ({
  runtimeApi: {
    getModels: vi.fn(),
    getModel: vi.fn(),
    importModel: vi.fn(),
    validateModel: vi.fn(),
    deleteModel: vi.fn(),
    getHardwareInfo: vi.fn(),
  },
}));

describe('AiModelRegistry Component', () => {
  const mockModels: AiModelItem[] = [
    {
      id: 'cls-mobilenet-001',
      name: 'MobileNet Defect Classifier',
      task_type: 'IMAGE_CLASSIFICATION',
      architecture: 'mobilenet_v3_small',
      version: '1.0.0',
      format: 'onnx',
      status: 'valid',
      source: 'NOVA AI Trainer',
      import_date: '2026-10-30T10:00:00Z',
      file_size_bytes: 4096000,
      checksum_sha256: 'abc1234567890def',
      artifact_path: 'C:/Project/machine_vision_platform/models/registry/cls-mobilenet-001/model.onnx',
      classes: [
        { index: 0, name: 'normal', is_background: false },
        { index: 1, name: 'defect', is_background: false },
      ],
      input_size: [224, 224],
      num_classes: 2,
      metadata: {
        id: 'cls-mobilenet-001',
        name: 'MobileNet Defect Classifier',
        task_type: 'IMAGE_CLASSIFICATION',
        architecture: 'mobilenet_v3_small',
        version: '1.0.0',
        framework: 'pytorch',
        export_format: 'onnx',
        classes: ['normal', 'defect'],
        input_tensor: {
          name: 'input',
          shape: [1, 3, 224, 224],
          data_type: 'float32',
          color_space: 'RGB',
        },
        output_tensors: [
          {
            name: 'output',
            shape: [1, 2],
            data_type: 'float32',
            semantics: 'logits',
          },
        ],
        preprocessing: {
          resize: { width: 224, height: 224, policy: 'resize' },
          normalization: {
            mean: [0.485, 0.456, 0.406],
            std: [0.229, 0.224, 0.225],
            rescale_factor: 0.00392156862745098,
          },
        },
      },
    },
    {
      id: 'det-fasterrcnn-002',
      name: 'Faster R-CNN Part Detector',
      task_type: 'OBJECT_DETECTION',
      architecture: 'fasterrcnn_mobilenet_v3_large_320_fpn',
      version: '1.0.0',
      format: 'onnx',
      status: 'valid',
      source: 'NOVA AI Trainer',
      import_date: '2026-10-30T11:00:00Z',
      file_size_bytes: 16000000,
      checksum_sha256: 'fedcba0987654321',
      artifact_path: 'C:/Project/machine_vision_platform/models/registry/det-fasterrcnn-002/model.onnx',
      classes: [
        { index: 0, name: '__background__', is_background: true },
        { index: 1, name: 'part_a', is_background: false },
        { index: 2, name: 'part_b', is_background: false },
      ],
      input_size: [320, 320],
      num_classes: 3,
      metadata: {
        id: 'det-fasterrcnn-002',
        name: 'Faster R-CNN Part Detector',
        task_type: 'OBJECT_DETECTION',
        architecture: 'fasterrcnn_mobilenet_v3_large_320_fpn',
        version: '1.0.0',
        framework: 'torchvision',
        export_format: 'onnx',
        classes: ['__background__', 'part_a', 'part_b'],
        input_tensor: {
          name: 'images',
          shape: [3, 320, 320],
          data_type: 'float32',
          color_space: 'RGB',
        },
        output_tensors: [
          { name: 'boxes', shape: [-1, 4], data_type: 'float32', semantics: 'boxes_xyxy' },
          { name: 'labels', shape: [-1], data_type: 'int64', semantics: 'class_indices' },
          { name: 'scores', shape: [-1], data_type: 'float32', semantics: 'confidences' },
        ],
        preprocessing: {
          resize: { width: 320, height: 320, policy: 'resize' },
        },
      },
    },
  ];

  const mockHardware: HardwareInfo = {
    cuda_available: false,
    available_providers: ['CPUExecutionProvider'],
    selected_provider: 'CPUExecutionProvider',
    cpu_cores: 8,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(runtimeApi.getModels).mockResolvedValue(mockModels);
    vi.mocked(runtimeApi.getHardwareInfo).mockResolvedValue(mockHardware);
    vi.mocked(runtimeApi.validateModel).mockResolvedValue({
      model_id: 'cls-mobilenet-001',
      is_valid: true,
      status: 'valid',
      checksum_verified: true,
      session_ready: true,
      execution_provider: 'CPUExecutionProvider',
      errors: [],
    });
    vi.mocked(runtimeApi.deleteModel).mockResolvedValue({ success: true, message: 'Deleted' });
  });

  it('renders AI Models registry header and hardware execution provider', async () => {
    render(<AiModelRegistry />);
    expect(screen.getByText('AI Model Registry')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('MobileNet Defect Classifier')).toBeInTheDocument();
      expect(screen.getByText('Faster R-CNN Part Detector')).toBeInTheDocument();
      expect(screen.getByText('CPUExecutionProvider')).toBeInTheDocument();
    });
  });

  it('filters models by task type', async () => {
    render(<AiModelRegistry />);

    await waitFor(() => {
      expect(screen.getByText('MobileNet Defect Classifier')).toBeInTheDocument();
    });

    // Click Classification filter tab
    const clsBtn = screen.getByRole('button', { name: /^Classification$/i });
    fireEvent.click(clsBtn);

    expect(screen.getByText('MobileNet Defect Classifier')).toBeInTheDocument();
    expect(screen.queryByText('Faster R-CNN Part Detector')).not.toBeInTheDocument();
  });

  it('opens and displays model details modal when Inspect is clicked', async () => {
    render(<AiModelRegistry />);

    await waitFor(() => {
      expect(screen.getByText('MobileNet Defect Classifier')).toBeInTheDocument();
    });

    const inspectBtn = screen.getByTestId('details-model-cls-mobilenet-001');
    fireEvent.click(inspectBtn);

    await waitFor(() => {
      expect(screen.getByTestId('model-details-modal')).toBeInTheDocument();
      expect(screen.getByText('SHA-256 Checksum:')).toBeInTheDocument();
    });
  });

  it('validates a model when Validate button is clicked', async () => {
    render(<AiModelRegistry />);

    await waitFor(() => {
      expect(screen.getByText('MobileNet Defect Classifier')).toBeInTheDocument();
    });

    const valBtn = screen.getByTestId('validate-model-cls-mobilenet-001');
    fireEvent.click(valBtn);

    await waitFor(() => {
      expect(runtimeApi.validateModel).toHaveBeenCalledWith('cls-mobilenet-001');
    });
  });

  it('triggers delete confirmation dialog and calls deleteModel on confirm', async () => {
    window.confirm = vi.fn().mockReturnValue(true);
    render(<AiModelRegistry />);

    await waitFor(() => {
      expect(screen.getByText('MobileNet Defect Classifier')).toBeInTheDocument();
    });

    const delBtn = screen.getByTestId('delete-model-cls-mobilenet-001');
    fireEvent.click(delBtn);

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(runtimeApi.deleteModel).toHaveBeenCalledWith('cls-mobilenet-001', false);
    });
  });
});
