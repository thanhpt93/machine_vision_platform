import { z } from 'zod';
import {
  NodeContract,
  NodeCategory,
  PortDefinition,
  areDataTypesCompatible,
} from '@/shared/contracts';

export type ConfigFieldType = 'text' | 'number' | 'range' | 'select' | 'checkbox';

export interface ConfigFieldDescriptor {
  key: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  defaultValue?: any;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
  presets?: Array<{ label: string; value: any }>;
}

export interface NodeRuntimeInfo {
  supported: boolean;
  handler?: string;
  minRuntimeVersion?: string;
  notes?: string;
}

export interface NodeRegistryItem extends NodeContract {
  icon: string;
  tags: string[];
  configSchema: z.ZodObject<any>;
  configFields: ConfigFieldDescriptor[];
  runtime: NodeRuntimeInfo;
  customPropertiesComponent?: any;
}

// -------------------------------------------------------------
// 1. Schemas for Core Nodes
// -------------------------------------------------------------

export const ImageFileConfigSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
});

export const RoiCropConfigSchema = z.object({
  x: z.number().int().min(0, 'X must be >= 0'),
  y: z.number().int().min(0, 'Y must be >= 0'),
  width: z.number().int().min(1, 'Width must be >= 1'),
  height: z.number().int().min(1, 'Height must be >= 1'),
});

export const GrayscaleConfigSchema = z.object({
  equalizeHist: z.boolean().default(false),
});

export const ThresholdModeSchema = z.enum([
  'BINARY',
  'BINARY_INV',
  'TRUNC',
  'TOZERO',
  'TOZERO_INV',
  'OTSU',
]);

export const ThresholdConfigSchema = z.object({
  threshold: z.number().min(0, 'Threshold min is 0').max(255, 'Threshold max is 255'),
  mode: ThresholdModeSchema,
  maxVal: z.number().min(0).max(255, 'Max value must be between 0 and 255'),
});

export const ContourRetrievalModeSchema = z.enum([
  'RETR_EXTERNAL',
  'RETR_LIST',
  'RETR_TREE',
]);

export const ContourApproxMethodSchema = z.enum([
  'CHAIN_APPROX_SIMPLE',
  'CHAIN_APPROX_NONE',
]);

export const ContourDetectionConfigSchema = z.object({
  mode: ContourRetrievalModeSchema,
  method: ContourApproxMethodSchema,
  minArea: z.number().min(0, 'Min area must be >= 0'),
  maxArea: z.number().min(0, 'Max area must be >= 0'),
  drawBoundingBoxes: z.boolean().default(true),
});

export const ResultViewerConfigSchema = z.object({
  showHistogram: z.boolean().default(false),
  zoomLevel: z.number().min(0.1, 'Zoom must be >= 0.1').max(10, 'Zoom must be <= 10'),
  title: z.string().min(1, 'Display title is required'),
  showOverlay: z.boolean().default(true),
});

// Extensibility Node Schemas
export const GaussianBlurConfigSchema = z.object({
  kernelSize: z.number().int().min(3).max(31).refine((k) => k % 2 === 1, {
    message: 'Kernel size must be an odd number (3, 5, 7, ...)',
  }),
  sigmaX: z.number().min(0.1, 'SigmaX must be >= 0.1').max(20, 'SigmaX must be <= 20'),
});

export const AiDetectionConfigSchema = z.object({
  modelPath: z.string().min(1, 'Model path is required'),
  confidenceThreshold: z.number().min(0.01).max(1.0),
  nmsThreshold: z.number().min(0.01).max(1.0),
});

// -------------------------------------------------------------
// 2. Extensible Node Registry Class
// -------------------------------------------------------------

export class NodeRegistry {
  private registry = new Map<string, NodeRegistryItem>();
  private listeners: Array<() => void> = [];

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error in NodeRegistry listener:', err);
      }
    });
  }

  public register(item: NodeRegistryItem): void {
    if (this.registry.has(item.nodeType)) {
      throw new Error(
        `Duplicate node registration error: Node type "${item.nodeType}" is already registered.`
      );
    }
    this.registry.set(item.nodeType, item);
    this.notify();
  }

  public get(nodeType: string): NodeRegistryItem | undefined {
    return this.registry.get(nodeType);
  }

  public getAll(): NodeRegistryItem[] {
    return Array.from(this.registry.values());
  }

  public isRegistered(nodeType: string): boolean {
    return this.registry.has(nodeType);
  }

  public hasRuntimeSupport(nodeType: string): boolean {
    const item = this.get(nodeType);
    return item ? item.runtime.supported : false;
  }

  public search(query: string): NodeRegistryItem[] {
    if (!query || query.trim() === '') {
      return this.getAll();
    }
    const q = query.toLowerCase().trim();
    return this.getAll().filter((item) => {
      const matchName = item.displayName.toLowerCase().includes(q);
      const matchType = item.nodeType.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchTags = item.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchName || matchType || matchDesc || matchTags;
    });
  }

  public getByCategory(category: NodeCategory): NodeRegistryItem[] {
    return this.getAll().filter((item) => item.category === category);
  }

  public checkPortCompatibility(sourcePort: PortDefinition, targetPort: PortDefinition): boolean {
    return areDataTypesCompatible(sourcePort.dataType, targetPort.dataType);
  }

  public clear(): void {
    this.registry.clear();
    this.notify();
  }
}

// Global Singleton Registry instance
export const nodeRegistry = new NodeRegistry();

// -------------------------------------------------------------
// 3. Register Core Pipeline Nodes (Phase 3 OpenCV Pipeline)
// -------------------------------------------------------------

// Node 1: Image File Source
nodeRegistry.register({
  nodeType: 'image_file',
  version: '1.0.0',
  displayName: 'Image File',
  category: 'ACQUISITION',
  description: 'Loads an image from local filesystem (PNG, JPEG, BMP) for visual inspection',
  icon: 'camera',
  tags: ['source', 'loader', 'disk', 'bmp', 'png', 'jpg', 'opencv'],
  inputs: [],
  outputs: [
    {
      id: 'image',
      name: 'Image',
      dataType: 'ImageFrame',
      description: 'Loaded visual image frame',
      required: true,
    },
  ],
  defaultConfig: {
    filePath: 'sample_images/pcb_board.png',
  },
  configSchema: ImageFileConfigSchema,
  configFields: [
    {
      key: 'filePath',
      label: 'Image File Path',
      type: 'text',
      description: 'Select an image file using browse or presets',
      placeholder: 'sample_images/pcb_board.png',
      presets: [
        { label: 'PCB Board', value: 'sample_images/pcb_board.png' },
        { label: 'Gear Defect', value: 'sample_images/gear_defect.png' },
        { label: 'Bottle Cap', value: 'sample_images/bottle_cap.png' },
      ],
    },
  ],
  runtime: {
    supported: true,
    handler: 'vision_runtime.handlers.image_loader',
    minRuntimeVersion: '0.1.0',
  },
});

// Node 2: ROI Crop
nodeRegistry.register({
  nodeType: 'roi_crop',
  version: '1.0.0',
  displayName: 'ROI Crop',
  category: 'PREPROCESSING',
  description: 'Crops a Region of Interest with coordinates (X, Y, Width, Height)',
  icon: 'crop',
  tags: ['crop', 'roi', 'bounding', 'region', 'preprocessing'],
  inputs: [
    {
      id: 'image_in',
      name: 'Image In',
      dataType: 'ImageFrame',
      description: 'Input source image',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'image_out',
      name: 'Cropped Image',
      dataType: 'ImageFrame',
      description: 'Cropped image sub-region',
      required: true,
    },
  ],
  defaultConfig: {
    x: 50,
    y: 50,
    width: 300,
    height: 200,
  },
  configSchema: RoiCropConfigSchema,
  configFields: [
    { key: 'x', label: 'X Position (px)', type: 'number', min: 0, defaultValue: 50 },
    { key: 'y', label: 'Y Position (px)', type: 'number', min: 0, defaultValue: 50 },
    { key: 'width', label: 'Width (px)', type: 'number', min: 1, defaultValue: 300 },
    { key: 'height', label: 'Height (px)', type: 'number', min: 1, defaultValue: 200 },
  ],
  runtime: {
    supported: true,
    handler: 'vision_runtime.handlers.roi_crop',
    minRuntimeVersion: '0.1.0',
  },
});

// Node 3: Grayscale (Phase 3 Core Node)
nodeRegistry.register({
  nodeType: 'grayscale',
  version: '1.0.0',
  displayName: 'Grayscale',
  category: 'PREPROCESSING',
  description: 'Converts color input frame (BGR/RGB) to single-channel luminance grayscale',
  icon: 'sliders',
  tags: ['grayscale', 'gray', 'bgr2gray', 'luminance', 'convert', 'preprocessing'],
  inputs: [
    {
      id: 'image_in',
      name: 'Color Image In',
      dataType: 'ImageFrame',
      description: 'Input color visual frame',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'image_out',
      name: 'Grayscale Image',
      dataType: 'ImageFrame',
      description: '1-channel grayscale image frame',
      required: true,
    },
  ],
  defaultConfig: {
    equalizeHist: false,
  },
  configSchema: GrayscaleConfigSchema,
  configFields: [
    {
      key: 'equalizeHist',
      label: 'Histogram Equalization',
      type: 'checkbox',
      defaultValue: false,
      description: 'Enhance image contrast using OpenCV equalizeHist',
    },
  ],
  runtime: {
    supported: true,
    handler: 'vision_runtime.handlers.grayscale',
    minRuntimeVersion: '0.1.0',
  },
});

// Node 4: Threshold
nodeRegistry.register({
  nodeType: 'threshold',
  version: '1.0.0',
  displayName: 'Threshold',
  category: 'PREPROCESSING',
  description: 'Binarize image into a single-channel mask using OpenCV luminance thresholding',
  icon: 'sliders',
  tags: ['binarize', 'mask', 'otsu', 'segmentation', 'filter'],
  inputs: [
    {
      id: 'image_in',
      name: 'Image In',
      dataType: 'ImageFrame',
      description: 'Grayscale or luminance input frame',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'image_out',
      name: 'Binary Mask',
      dataType: 'MaskFrame',
      description: 'Single-channel binary mask',
      required: true,
    },
  ],
  defaultConfig: {
    threshold: 128,
    mode: 'BINARY',
    maxVal: 255,
  },
  configSchema: ThresholdConfigSchema,
  configFields: [
    {
      key: 'threshold',
      label: 'Threshold Cutoff (0-255)',
      type: 'range',
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 128,
      description: 'Luminance cutoff threshold',
    },
    {
      key: 'mode',
      label: 'Threshold Mode',
      type: 'select',
      defaultValue: 'BINARY',
      options: [
        { label: 'BINARY', value: 'BINARY' },
        { label: 'BINARY_INV', value: 'BINARY_INV' },
        { label: 'TRUNC', value: 'TRUNC' },
        { label: 'TOZERO', value: 'TOZERO' },
        { label: 'TOZERO_INV', value: 'TOZERO_INV' },
        { label: 'OTSU (Auto)', value: 'OTSU' },
      ],
    },
    {
      key: 'maxVal',
      label: 'Max Value (0-255)',
      type: 'number',
      min: 0,
      max: 255,
      defaultValue: 255,
    },
  ],
  runtime: {
    supported: true,
    handler: 'vision_runtime.handlers.threshold',
    minRuntimeVersion: '0.1.0',
  },
});

// Node 5: Contour Detection (Phase 3 Core Inspection Node)
nodeRegistry.register({
  nodeType: 'contour_detection',
  version: '1.0.0',
  displayName: 'Contour Detection',
  category: 'INSPECTION',
  description: 'Finds geometric contours, computes bounding boxes, and generates annotated preview',
  icon: 'crop',
  tags: ['contour', 'blob', 'boundary', 'shape', 'inspection', 'opencv'],
  inputs: [
    {
      id: 'mask_in',
      name: 'Binary Mask In',
      dataType: 'MaskFrame',
      description: 'Single-channel binary mask from threshold node',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'detections',
      name: 'Detections',
      dataType: 'DetectionResult',
      description: 'Structured detection results (count, bounding boxes, areas)',
      required: true,
    },
    {
      id: 'image_out',
      name: 'Annotated Preview',
      dataType: 'ImageFrame',
      description: 'Visual overlay with contours and bounding boxes',
      required: true,
    },
  ],
  defaultConfig: {
    mode: 'RETR_EXTERNAL',
    method: 'CHAIN_APPROX_SIMPLE',
    minArea: 50,
    maxArea: 500000,
    drawBoundingBoxes: true,
  },
  configSchema: ContourDetectionConfigSchema,
  configFields: [
    {
      key: 'mode',
      label: 'Retrieval Mode',
      type: 'select',
      defaultValue: 'RETR_EXTERNAL',
      options: [
        { label: 'RETR_EXTERNAL (Outermost only)', value: 'RETR_EXTERNAL' },
        { label: 'RETR_LIST (All contours flat)', value: 'RETR_LIST' },
        { label: 'RETR_TREE (Full hierarchy)', value: 'RETR_TREE' },
      ],
    },
    {
      key: 'method',
      label: 'Approximation Method',
      type: 'select',
      defaultValue: 'CHAIN_APPROX_SIMPLE',
      options: [
        { label: 'CHAIN_APPROX_SIMPLE (Compress)', value: 'CHAIN_APPROX_SIMPLE' },
        { label: 'CHAIN_APPROX_NONE (All points)', value: 'CHAIN_APPROX_NONE' },
      ],
    },
    {
      key: 'minArea',
      label: 'Min Contour Area (px²)',
      type: 'number',
      min: 0,
      defaultValue: 50,
      description: 'Filters out noise particles smaller than this area',
    },
    {
      key: 'maxArea',
      label: 'Max Contour Area (px²)',
      type: 'number',
      min: 0,
      defaultValue: 500000,
    },
    {
      key: 'drawBoundingBoxes',
      label: 'Draw Bounding Rectangles',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  runtime: {
    supported: true,
    handler: 'vision_runtime.handlers.contour_detection',
    minRuntimeVersion: '0.1.0',
  },
});

// Node 6: Result Viewer
nodeRegistry.register({
  nodeType: 'result_viewer',
  version: '1.0.0',
  displayName: 'Result Viewer',
  category: 'OUTPUT',
  description: 'Displays actual inspection image output, detection overlays, and verdict metrics',
  icon: 'monitor',
  tags: ['view', 'display', 'screen', 'inspector', 'output', 'overlay'],
  inputs: [
    {
      id: 'image_in',
      name: 'Display Image',
      dataType: 'ImageFrame',
      description: 'Image stream or annotated preview to display',
      required: true,
    },
    {
      id: 'detections_in',
      name: 'Detections (Optional)',
      dataType: 'DetectionResult',
      description: 'Optional structured detections metadata overlay',
      required: false,
    },
  ],
  outputs: [],
  defaultConfig: {
    showHistogram: false,
    zoomLevel: 1.0,
    title: 'Main Inspection Output',
    showOverlay: true,
  },
  configSchema: ResultViewerConfigSchema,
  configFields: [
    {
      key: 'title',
      label: 'Viewer Window Title',
      type: 'text',
      defaultValue: 'Main Inspection Output',
    },
    {
      key: 'zoomLevel',
      label: 'Default Zoom Level',
      type: 'number',
      min: 0.1,
      max: 10,
      step: 0.1,
      defaultValue: 1.0,
    },
    {
      key: 'showHistogram',
      label: 'Display Luminance Histogram',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      key: 'showOverlay',
      label: 'Show Inspection Overlays',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
  runtime: {
    supported: true,
    handler: 'vision_runtime.handlers.result_viewer',
    minRuntimeVersion: '0.1.0',
  },
});

// Node 7: Gaussian Blur
nodeRegistry.register({
  nodeType: 'gaussian_blur',
  version: '1.0.0',
  displayName: 'Gaussian Blur',
  category: 'PREPROCESSING',
  description: 'Applies Gaussian convolution kernel to suppress high-frequency noise',
  icon: 'blur',
  tags: ['blur', 'filter', 'smoothing', 'noise reduction', 'gaussian'],
  inputs: [
    {
      id: 'image_in',
      name: 'Image In',
      dataType: 'ImageFrame',
      description: 'Input visual frame',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'image_out',
      name: 'Blurred Image',
      dataType: 'ImageFrame',
      description: 'Smoothed output visual frame',
      required: true,
    },
  ],
  defaultConfig: {
    kernelSize: 5,
    sigmaX: 1.5,
  },
  configSchema: GaussianBlurConfigSchema,
  configFields: [
    {
      key: 'kernelSize',
      label: 'Kernel Size (Odd integer: 3, 5, 7, ...)',
      type: 'select',
      defaultValue: 5,
      options: [
        { label: '3 x 3', value: 3 },
        { label: '5 x 5', value: 5 },
        { label: '7 x 7', value: 7 },
        { label: '9 x 9', value: 9 },
        { label: '11 x 11', value: 11 },
      ],
    },
    {
      key: 'sigmaX',
      label: 'Sigma X (Gaussian standard deviation)',
      type: 'range',
      min: 0.1,
      max: 10.0,
      step: 0.1,
      defaultValue: 1.5,
    },
  ],
  runtime: {
    supported: true,
    handler: 'vision_runtime.handlers.gaussian_blur',
    minRuntimeVersion: '0.2.0',
    notes: 'OpenCV GaussianBlur kernel',
  },
});

// Node 8: Deep Detection (Pending Runtime Extension)
nodeRegistry.register({
  nodeType: 'ai_detection',
  version: '1.0.0',
  displayName: 'AI Object Detection',
  category: 'AI_INFERENCE',
  description: 'Deep neural network detector (YOLO / ONNX) for defect & component bounding boxes',
  icon: 'brain',
  tags: ['ai', 'deep learning', 'onnx', 'yolo', 'detection', 'bounding box'],
  inputs: [
    {
      id: 'image_in',
      name: 'Image In',
      dataType: 'ImageFrame',
      description: 'Input frame for tensor inference',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'detections',
      name: 'Detections',
      dataType: 'DetectionResult',
      description: 'Predicted bounding boxes and confidence scores',
      required: true,
    },
  ],
  defaultConfig: {
    modelPath: 'models/pcb_defect_yolov8.onnx',
    confidenceThreshold: 0.5,
    nmsThreshold: 0.45,
  },
  configSchema: AiDetectionConfigSchema,
  configFields: [
    {
      key: 'modelPath',
      label: 'ONNX Model Path',
      type: 'text',
      defaultValue: 'models/pcb_defect_yolov8.onnx',
      placeholder: 'models/model_name.onnx',
    },
    {
      key: 'confidenceThreshold',
      label: 'Confidence Threshold',
      type: 'range',
      min: 0.05,
      max: 1.0,
      step: 0.05,
      defaultValue: 0.5,
    },
    {
      key: 'nmsThreshold',
      label: 'NMS IoU Threshold',
      type: 'range',
      min: 0.05,
      max: 1.0,
      step: 0.05,
      defaultValue: 0.45,
    },
  ],
  runtime: {
    supported: false,
    handler: 'vision_runtime.handlers.onnx_detector',
    minRuntimeVersion: '0.3.0',
    notes: 'Requires Phase 3 AI Inference runtime extension (ONNX Runtime engine).',
  },
});

// -------------------------------------------------------------
// 4. Backwards compatibility exports
// -------------------------------------------------------------

export const NODE_REGISTRY: Record<string, NodeRegistryItem> = new Proxy(
  {},
  {
    get: (_target, prop: string) => nodeRegistry.get(prop),
    ownKeys: () => nodeRegistry.getAll().map((item) => item.nodeType),
    getOwnPropertyDescriptor: (_target, prop: string) => {
      const item = nodeRegistry.get(prop);
      if (!item) return undefined;
      return {
        configurable: true,
        enumerable: true,
        value: item,
      };
    },
  }
);

export const getNodeContract = (nodeType: string): NodeRegistryItem | undefined => {
  return nodeRegistry.get(nodeType);
};

export const getNodesByCategory = (): Record<NodeCategory, NodeRegistryItem[]> => {
  const grouped: Record<NodeCategory, NodeRegistryItem[]> = {
    ACQUISITION: [],
    PREPROCESSING: [],
    INSPECTION: [],
    AI_INFERENCE: [],
    LOGIC_GATE: [],
    OUTPUT: [],
  };

  nodeRegistry.getAll().forEach((item) => {
    grouped[item.category].push(item);
  });

  return grouped;
};
