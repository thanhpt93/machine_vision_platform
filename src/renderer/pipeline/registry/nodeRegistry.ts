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
// 1. Schemas for Core & Legacy Nodes
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
// 3. Register All 9 Categories Nodes
// -------------------------------------------------------------

// ==========================================
// Category 1: Image Acquisition
// ==========================================
nodeRegistry.register({
  nodeType: 'image_file',
  version: '1.0.0',
  displayName: 'Image File',
  category: 'image_acquisition',
  description: 'Loads an image from local filesystem (PNG, JPEG, BMP) for visual inspection',
  icon: 'camera',
  tags: ['source', 'loader', 'disk', 'bmp', 'png', 'jpg', 'opencv', 'acquisition'],
  inputs: [],
  outputs: [
    { id: 'image', name: 'Image', dataType: 'ImageFrame', description: 'Loaded visual image frame', required: true },
  ],
  defaultConfig: { filePath: 'sample_images/pcb_board.png' },
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
  runtime: { supported: true, handler: 'vision_runtime.handlers.acquisition.handle_image_file', minRuntimeVersion: '0.1.0' },
});

nodeRegistry.register({
  nodeType: 'image_folder',
  version: '1.0.0',
  displayName: 'Image Folder',
  category: 'image_acquisition',
  description: 'Loads multiple images sequentially from a directory folder',
  icon: 'camera',
  tags: ['folder', 'batch', 'directory', 'acquisition'],
  inputs: [],
  outputs: [
    { id: 'image', name: 'Image', dataType: 'ImageFrame', description: 'Current image frame from directory', required: true },
    { id: 'filePath', name: 'File Path', dataType: 'String', description: 'Loaded file path', required: false },
  ],
  defaultConfig: { folderPath: 'sample_images', extension: '.png', fileIndex: 0 },
  configSchema: z.object({
    folderPath: z.string().min(1),
    extension: z.string().default('.png'),
    fileIndex: z.number().int().min(0).default(0),
  }),
  configFields: [
    { key: 'folderPath', label: 'Folder Path', type: 'text', defaultValue: 'sample_images' },
    { key: 'extension', label: 'File Extension', type: 'text', defaultValue: '.png' },
    { key: 'fileIndex', label: 'Image Index', type: 'number', min: 0, defaultValue: 0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.acquisition.handle_image_folder' },
});

nodeRegistry.register({
  nodeType: 'image_sequence',
  version: '1.0.0',
  displayName: 'Image Sequence',
  category: 'image_acquisition',
  description: 'Iterates and streams numbered image sequences (e.g., frame_%04d.png)',
  icon: 'camera',
  tags: ['sequence', 'stream', 'frames', 'acquisition'],
  inputs: [],
  outputs: [
    { id: 'image', name: 'Image', dataType: 'ImageFrame', description: 'Current frame in sequence', required: true },
    { id: 'frameIndex', name: 'Index', dataType: 'Scalar', description: 'Current frame sequence index', required: false },
  ],
  defaultConfig: { pattern: 'sample_images/frame_%04d.png', currentIndex: 0, loop: true },
  configSchema: z.object({
    pattern: z.string().min(1),
    currentIndex: z.number().int().min(0).default(0),
    loop: z.boolean().default(true),
  }),
  configFields: [
    { key: 'pattern', label: 'File Pattern', type: 'text', defaultValue: 'sample_images/frame_%04d.png' },
    { key: 'currentIndex', label: 'Start Frame Index', type: 'number', min: 0, defaultValue: 0 },
    { key: 'loop', label: 'Loop Sequence', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.acquisition.handle_image_sequence' },
});

nodeRegistry.register({
  nodeType: 'image_copy',
  version: '1.0.0',
  displayName: 'Image Copy',
  category: 'image_acquisition',
  description: 'Creates an independent deep copy clone of the input image buffer',
  icon: 'camera',
  tags: ['copy', 'clone', 'buffer', 'acquisition'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input image buffer', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Image Out', dataType: 'ImageFrame', description: 'Cloned image buffer', required: true },
  ],
  defaultConfig: {},
  configSchema: z.object({}),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.acquisition.handle_image_copy' },
});

// ==========================================
// Category 2: Image Preparation
// ==========================================
nodeRegistry.register({
  nodeType: 'roi_crop',
  version: '1.0.0',
  displayName: 'ROI Crop',
  category: 'image_preparation',
  description: 'Crops a Region of Interest with coordinates (X, Y, Width, Height)',
  icon: 'crop',
  tags: ['crop', 'roi', 'bounding', 'region', 'preparation', 'preprocessing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input source image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Cropped Image', dataType: 'ImageFrame', description: 'Cropped image sub-region', required: true },
  ],
  defaultConfig: { x: 50, y: 50, width: 300, height: 200 },
  configSchema: RoiCropConfigSchema,
  configFields: [
    { key: 'x', label: 'X Position (px)', type: 'number', min: 0, defaultValue: 50 },
    { key: 'y', label: 'Y Position (px)', type: 'number', min: 0, defaultValue: 50 },
    { key: 'width', label: 'Width (px)', type: 'number', min: 1, defaultValue: 300 },
    { key: 'height', label: 'Height (px)', type: 'number', min: 1, defaultValue: 200 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_roi_crop', minRuntimeVersion: '0.1.0' },
});

nodeRegistry.register({
  nodeType: 'resize',
  version: '1.0.0',
  displayName: 'Resize',
  category: 'image_preparation',
  description: 'Resizes image dimensions by absolute width/height or scaling factor',
  icon: 'scissors',
  tags: ['resize', 'scale', 'dimension', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Resized Image', dataType: 'ImageFrame', description: 'Resized image output', required: true },
  ],
  defaultConfig: { width: 640, height: 480, interpolation: 'INTER_LINEAR' },
  configSchema: z.object({
    width: z.number().int().min(1).default(640),
    height: z.number().int().min(1).default(480),
    interpolation: z.enum(['INTER_NEAREST', 'INTER_LINEAR', 'INTER_CUBIC', 'INTER_AREA']).default('INTER_LINEAR'),
  }),
  configFields: [
    { key: 'width', label: 'Target Width', type: 'number', min: 1, defaultValue: 640 },
    { key: 'height', label: 'Target Height', type: 'number', min: 1, defaultValue: 480 },
    {
      key: 'interpolation',
      label: 'Interpolation',
      type: 'select',
      defaultValue: 'INTER_LINEAR',
      options: [
        { label: 'Linear', value: 'INTER_LINEAR' },
        { label: 'Nearest', value: 'INTER_NEAREST' },
        { label: 'Cubic', value: 'INTER_CUBIC' },
        { label: 'Area', value: 'INTER_AREA' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_resize' },
});

nodeRegistry.register({
  nodeType: 'color_convert',
  version: '1.0.0',
  displayName: 'Color Convert',
  category: 'image_preparation',
  description: 'Converts color space (BGR2GRAY, BGR2HSV, BGR2RGB, BGR2LAB)',
  icon: 'sliders',
  tags: ['color', 'grayscale', 'hsv', 'rgb', 'lab', 'convert', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input color frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Converted Image', dataType: 'ImageFrame', description: 'Converted image', required: true },
  ],
  defaultConfig: { code: 'COLOR_BGR2GRAY' },
  configSchema: z.object({
    code: z.enum(['COLOR_BGR2GRAY', 'COLOR_BGR2HSV', 'COLOR_BGR2RGB', 'COLOR_BGR2LAB']).default('COLOR_BGR2GRAY'),
  }),
  configFields: [
    {
      key: 'code',
      label: 'Conversion Code',
      type: 'select',
      defaultValue: 'COLOR_BGR2GRAY',
      options: [
        { label: 'BGR to Grayscale', value: 'COLOR_BGR2GRAY' },
        { label: 'BGR to HSV', value: 'COLOR_BGR2HSV' },
        { label: 'BGR to RGB', value: 'COLOR_BGR2RGB' },
        { label: 'BGR to LAB', value: 'COLOR_BGR2LAB' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_color_convert' },
});

nodeRegistry.register({
  nodeType: 'normalize',
  version: '1.0.0',
  displayName: 'Normalize',
  category: 'image_preparation',
  description: 'Normalizes pixel intensity ranges using MinMax or Z-Score scaling',
  icon: 'sliders',
  tags: ['normalize', 'minmax', 'scale', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Normalized Image', dataType: 'ImageFrame', description: 'Normalized frame', required: true },
  ],
  defaultConfig: { alpha: 0, beta: 255, norm_type: 'NORM_MINMAX' },
  configSchema: z.object({
    alpha: z.number().default(0),
    beta: z.number().default(255),
    norm_type: z.string().default('NORM_MINMAX'),
  }),
  configFields: [
    { key: 'alpha', label: 'Lower Bound (Alpha)', type: 'number', defaultValue: 0 },
    { key: 'beta', label: 'Upper Bound (Beta)', type: 'number', defaultValue: 255 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_normalize' },
});

nodeRegistry.register({
  nodeType: 'blur_denoise',
  version: '1.0.0',
  displayName: 'Blur & Denoise',
  category: 'image_preparation',
  description: 'Applies Gaussian, Median, or Bilateral filtering to suppress noise',
  icon: 'blur',
  tags: ['blur', 'filter', 'denoise', 'gaussian', 'median', 'bilateral', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Filtered Image', dataType: 'ImageFrame', description: 'Smoothed frame', required: true },
  ],
  defaultConfig: { method: 'gaussian', kernel_size: 5, sigma: 1.5 },
  configSchema: z.object({
    method: z.enum(['gaussian', 'median', 'bilateral']).default('gaussian'),
    kernel_size: z.number().int().min(3).max(31).default(5),
    sigma: z.number().min(0.1).max(20.0).default(1.5),
  }),
  configFields: [
    {
      key: 'method',
      label: 'Denoise Method',
      type: 'select',
      defaultValue: 'gaussian',
      options: [
        { label: 'Gaussian Blur', value: 'gaussian' },
        { label: 'Median Filter', value: 'median' },
        { label: 'Bilateral Filter', value: 'bilateral' },
      ],
    },
    { key: 'kernel_size', label: 'Kernel Size (Odd: 3, 5, 7, ...)', type: 'number', min: 3, max: 31, defaultValue: 5 },
    { key: 'sigma', label: 'Sigma', type: 'number', min: 0.1, max: 20, defaultValue: 1.5 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_blur_denoise' },
});

nodeRegistry.register({
  nodeType: 'brightness_contrast',
  version: '1.0.0',
  displayName: 'Brightness & Contrast',
  category: 'image_preparation',
  description: 'Adjusts image contrast gain (alpha) and brightness offset (beta)',
  icon: 'sliders',
  tags: ['brightness', 'contrast', 'gain', 'bias', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Adjusted Image', dataType: 'ImageFrame', description: 'Adjusted frame', required: true },
  ],
  defaultConfig: { alpha: 1.0, beta: 0.0 },
  configSchema: z.object({
    alpha: z.number().min(0.1).max(5.0).default(1.0),
    beta: z.number().min(-100).max(100).default(0.0),
  }),
  configFields: [
    { key: 'alpha', label: 'Contrast Gain (Alpha)', type: 'range', min: 0.1, max: 3.0, step: 0.1, defaultValue: 1.0 },
    { key: 'beta', label: 'Brightness Bias (Beta)', type: 'range', min: -100, max: 100, step: 1, defaultValue: 0.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_brightness_contrast' },
});

nodeRegistry.register({
  nodeType: 'histogram_equalize',
  version: '1.0.0',
  displayName: 'Histogram Equalize',
  category: 'image_preparation',
  description: 'Enhances image contrast using Global Equalization or CLAHE',
  icon: 'sliders',
  tags: ['histogram', 'equalize', 'clahe', 'contrast', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Equalized Image', dataType: 'ImageFrame', description: 'Equalized frame', required: true },
  ],
  defaultConfig: { clahe: false, clipLimit: 2.0, tileGridSize: 8 },
  configSchema: z.object({
    clahe: z.boolean().default(false),
    clipLimit: z.number().min(1.0).max(10.0).default(2.0),
    tileGridSize: z.number().int().min(2).max(32).default(8),
  }),
  configFields: [
    { key: 'clahe', label: 'Use CLAHE (Adaptive)', type: 'checkbox', defaultValue: false },
    { key: 'clipLimit', label: 'CLAHE Clip Limit', type: 'number', min: 1.0, max: 10.0, defaultValue: 2.0 },
    { key: 'tileGridSize', label: 'Tile Grid Size', type: 'number', min: 2, max: 32, defaultValue: 8 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_histogram_equalize' },
});

nodeRegistry.register({
  nodeType: 'sharpen',
  version: '1.0.0',
  displayName: 'Sharpen',
  category: 'image_preparation',
  description: 'Sharpens edges using unsharp masking kernel',
  icon: 'zap',
  tags: ['sharpen', 'unsharp', 'edges', 'clarity', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Sharpened Image', dataType: 'ImageFrame', description: 'Sharpened frame', required: true },
  ],
  defaultConfig: { strength: 1.0 },
  configSchema: z.object({ strength: z.number().min(0.1).max(5.0).default(1.0) }),
  configFields: [
    { key: 'strength', label: 'Sharpening Strength', type: 'range', min: 0.1, max: 3.0, step: 0.1, defaultValue: 1.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_sharpen' },
});

nodeRegistry.register({
  nodeType: 'invert',
  version: '1.0.0',
  displayName: 'Invert',
  category: 'image_preparation',
  description: 'Inverts pixel intensity values (255 - pixel)',
  icon: 'sliders',
  tags: ['invert', 'negative', 'flip', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Inverted Image', dataType: 'ImageFrame', description: 'Inverted frame', required: true },
  ],
  defaultConfig: {},
  configSchema: z.object({}),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_invert' },
});

nodeRegistry.register({
  nodeType: 'image_arithmetic',
  version: '1.0.0',
  displayName: 'Image Arithmetic',
  category: 'image_preparation',
  description: 'Performs pixel-wise arithmetic operations (add, subtract, blend)',
  icon: 'sliders',
  tags: ['arithmetic', 'add', 'subtract', 'blend', 'preparation'],
  inputs: [
    { id: 'image_a', name: 'Image A', dataType: 'ImageFrame', description: 'First frame', required: true },
    { id: 'image_b', name: 'Image B', dataType: 'ImageFrame', description: 'Second frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Result Image', dataType: 'ImageFrame', description: 'Calculated frame', required: true },
  ],
  defaultConfig: { operation: 'add', weight_a: 0.5, weight_b: 0.5 },
  configSchema: z.object({
    operation: z.enum(['add', 'subtract', 'blend']).default('add'),
    weight_a: z.number().min(0).max(1).default(0.5),
    weight_b: z.number().min(0).max(1).default(0.5),
  }),
  configFields: [
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      defaultValue: 'add',
      options: [
        { label: 'Add', value: 'add' },
        { label: 'Subtract (A - B)', value: 'subtract' },
        { label: 'Blend (Weighted Sum)', value: 'blend' },
      ],
    },
    { key: 'weight_a', label: 'Weight A (for blend)', type: 'range', min: 0, max: 1, step: 0.05, defaultValue: 0.5 },
    { key: 'weight_b', label: 'Weight B (for blend)', type: 'range', min: 0, max: 1, step: 0.05, defaultValue: 0.5 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_image_arithmetic' },
});

nodeRegistry.register({
  nodeType: 'flip_rotate',
  version: '1.0.0',
  displayName: 'Flip & Rotate',
  category: 'image_preparation',
  description: 'Flips image or rotates by orthogonal steps (90, 180, 270 deg)',
  icon: 'crop',
  tags: ['flip', 'rotate', 'mirror', 'orientation', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Transformed Image', dataType: 'ImageFrame', description: 'Rotated/flipped frame', required: true },
  ],
  defaultConfig: { flip_mode: 'none', rotate_angle: 0 },
  configSchema: z.object({
    flip_mode: z.enum(['none', 'horizontal', 'vertical', 'both']).default('none'),
    rotate_angle: z.number().int().default(0),
  }),
  configFields: [
    {
      key: 'flip_mode',
      label: 'Flip Axis',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Horizontal', value: 'horizontal' },
        { label: 'Vertical', value: 'vertical' },
        { label: 'Both', value: 'both' },
      ],
    },
    {
      key: 'rotate_angle',
      label: 'Rotation Angle',
      type: 'select',
      defaultValue: 0,
      options: [
        { label: '0°', value: 0 },
        { label: '90° CW', value: 90 },
        { label: '180°', value: 180 },
        { label: '270° CW', value: 270 },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_flip_rotate' },
});

nodeRegistry.register({
  nodeType: 'padding_border',
  version: '1.0.0',
  displayName: 'Padding & Border',
  category: 'image_preparation',
  description: 'Adds border padding around frame using constant or replicated borders',
  icon: 'crop',
  tags: ['padding', 'border', 'margin', 'preparation'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Padded Image', dataType: 'ImageFrame', description: 'Padded frame', required: true },
  ],
  defaultConfig: { top: 10, bottom: 10, left: 10, right: 10, border_type: 'constant', value: 0 },
  configSchema: z.object({
    top: z.number().int().min(0).default(10),
    bottom: z.number().int().min(0).default(10),
    left: z.number().int().min(0).default(10),
    right: z.number().int().min(0).default(10),
    border_type: z.enum(['constant', 'replicate', 'reflect']).default('constant'),
    value: z.number().min(0).max(255).default(0),
  }),
  configFields: [
    { key: 'top', label: 'Top Padding (px)', type: 'number', min: 0, defaultValue: 10 },
    { key: 'bottom', label: 'Bottom Padding (px)', type: 'number', min: 0, defaultValue: 10 },
    { key: 'left', label: 'Left Padding (px)', type: 'number', min: 0, defaultValue: 10 },
    { key: 'right', label: 'Right Padding (px)', type: 'number', min: 0, defaultValue: 10 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.preparation.handle_padding_border' },
});

// ==========================================
// Category 3: Image Processing
// ==========================================
nodeRegistry.register({
  nodeType: 'threshold',
  version: '1.0.0',
  displayName: 'Threshold',
  category: 'image_processing',
  description: 'Binarize image into a single-channel mask using OpenCV luminance thresholding',
  icon: 'sliders',
  tags: ['binarize', 'mask', 'otsu', 'segmentation', 'filter', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Binary Mask', dataType: 'MaskFrame', description: 'Single-channel binary mask', required: true },
    { id: 'mask_out', name: 'Mask Out', dataType: 'MaskFrame', description: 'Single-channel binary mask', required: false },
  ],
  defaultConfig: { threshold: 128, mode: 'BINARY', maxVal: 255 },
  configSchema: ThresholdConfigSchema,
  configFields: [
    { key: 'threshold', label: 'Threshold Cutoff (0-255)', type: 'range', min: 0, max: 255, step: 1, defaultValue: 128 },
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
    { key: 'maxVal', label: 'Max Value (0-255)', type: 'number', min: 0, max: 255, defaultValue: 255 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_threshold', minRuntimeVersion: '0.1.0' },
});

nodeRegistry.register({
  nodeType: 'adaptive_threshold',
  version: '1.0.0',
  displayName: 'Adaptive Threshold',
  category: 'image_processing',
  description: 'Performs local adaptive thresholding (Mean or Gaussian) for uneven lighting',
  icon: 'sliders',
  tags: ['adaptive', 'threshold', 'binarize', 'lighting', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Grayscale image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Binary Mask', dataType: 'MaskFrame', description: 'Adaptive threshold mask', required: true },
  ],
  defaultConfig: { max_value: 255, adaptive_method: 'mean', threshold_type: 'binary', block_size: 11, c_value: 2 },
  configSchema: z.object({
    max_value: z.number().default(255),
    adaptive_method: z.enum(['mean', 'gaussian']).default('mean'),
    threshold_type: z.enum(['binary', 'binary_inv']).default('binary'),
    block_size: z.number().int().min(3).max(99).default(11),
    c_value: z.number().default(2),
  }),
  configFields: [
    {
      key: 'adaptive_method',
      label: 'Adaptive Method',
      type: 'select',
      defaultValue: 'mean',
      options: [
        { label: 'Adaptive Mean', value: 'mean' },
        { label: 'Adaptive Gaussian', value: 'gaussian' },
      ],
    },
    { key: 'block_size', label: 'Block Size (Odd: 3, 5, ...)', type: 'number', min: 3, max: 99, defaultValue: 11 },
    { key: 'c_value', label: 'C Constant Subtracted', type: 'number', defaultValue: 2 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_adaptive_threshold' },
});

nodeRegistry.register({
  nodeType: 'otsu_threshold',
  version: '1.0.0',
  displayName: 'Otsu Threshold',
  category: 'image_processing',
  description: 'Automatically calculates optimal global threshold using Otsu binarization',
  icon: 'sliders',
  tags: ['otsu', 'auto', 'threshold', 'bimodal', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Grayscale image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Binary Mask', dataType: 'MaskFrame', description: 'Otsu binary mask', required: true },
    { id: 'computed_thresh', name: 'Calculated Threshold', dataType: 'Scalar', description: 'Computed Otsu cutoff value', required: false },
  ],
  defaultConfig: { invert: false },
  configSchema: z.object({ invert: z.boolean().default(false) }),
  configFields: [
    { key: 'invert', label: 'Invert Mask', type: 'checkbox', defaultValue: false },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_otsu_threshold' },
});

nodeRegistry.register({
  nodeType: 'color_threshold',
  version: '1.0.0',
  displayName: 'Color Threshold (InRange)',
  category: 'image_processing',
  description: 'Extracts color mask matching lower and upper HSV/BGR bounds',
  icon: 'sliders',
  tags: ['color', 'hsv', 'inrange', 'mask', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Color image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Binary Mask', dataType: 'MaskFrame', description: 'Mask of pixels in color range', required: true },
  ],
  defaultConfig: { lower_b: [0, 50, 50], upper_b: [20, 255, 255], color_space: 'HSV' },
  configSchema: z.object({
    lower_b: z.array(z.number()).length(3).default([0, 50, 50]),
    upper_b: z.array(z.number()).length(3).default([20, 255, 255]),
    color_space: z.enum(['HSV', 'BGR']).default('HSV'),
  }),
  configFields: [
    {
      key: 'color_space',
      label: 'Color Space',
      type: 'select',
      defaultValue: 'HSV',
      options: [
        { label: 'HSV (Hue Sat Val)', value: 'HSV' },
        { label: 'BGR (Blue Green Red)', value: 'BGR' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_color_threshold' },
});

nodeRegistry.register({
  nodeType: 'morphology',
  version: '1.0.0',
  displayName: 'Morphology',
  category: 'image_processing',
  description: 'Morphological operations: Erode, Dilate, Open, Close, Gradient, TopHat',
  icon: 'zap',
  tags: ['morphology', 'erode', 'dilate', 'open', 'close', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image/Mask In', dataType: 'ImageFrame', description: 'Binary mask or grayscale image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Output Image', dataType: 'ImageFrame', description: 'Morphed image', required: true },
  ],
  defaultConfig: { operation: 'open', kernel_size: 3, kernel_shape: 'rect', iterations: 1 },
  configSchema: z.object({
    operation: z.enum(['erode', 'dilate', 'open', 'close', 'gradient', 'tophat', 'blackhat']).default('open'),
    kernel_size: z.number().int().min(1).max(31).default(3),
    kernel_shape: z.enum(['rect', 'cross', 'ellipse']).default('rect'),
    iterations: z.number().int().min(1).max(20).default(1),
  }),
  configFields: [
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      defaultValue: 'open',
      options: [
        { label: 'Opening (Erode then Dilate)', value: 'open' },
        { label: 'Closing (Dilate then Erode)', value: 'close' },
        { label: 'Erode', value: 'erode' },
        { label: 'Dilate', value: 'dilate' },
        { label: 'Morphological Gradient', value: 'gradient' },
        { label: 'Top Hat', value: 'tophat' },
      ],
    },
    { key: 'kernel_size', label: 'Kernel Size', type: 'number', min: 1, max: 31, defaultValue: 3 },
    { key: 'iterations', label: 'Iterations', type: 'number', min: 1, max: 20, defaultValue: 1 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_morphology' },
});

nodeRegistry.register({
  nodeType: 'edge_detection',
  version: '1.0.0',
  displayName: 'Edge Detection',
  category: 'image_processing',
  description: 'Detects high-contrast boundaries using Canny, Sobel, or Laplacian operators',
  icon: 'zap',
  tags: ['edge', 'canny', 'sobel', 'laplacian', 'boundaries', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Edge Map', dataType: 'ImageFrame', description: 'Edge gradient/binary map', required: true },
  ],
  defaultConfig: { method: 'canny', threshold1: 50, threshold2: 150, aperture_size: 3 },
  configSchema: z.object({
    method: z.enum(['canny', 'sobel', 'laplacian']).default('canny'),
    threshold1: z.number().min(0).max(500).default(50),
    threshold2: z.number().min(0).max(500).default(150),
    aperture_size: z.number().int().min(1).max(7).default(3),
  }),
  configFields: [
    {
      key: 'method',
      label: 'Edge Algorithm',
      type: 'select',
      defaultValue: 'canny',
      options: [
        { label: 'Canny Edge Detector', value: 'canny' },
        { label: 'Sobel Operator', value: 'sobel' },
        { label: 'Laplacian Operator', value: 'laplacian' },
      ],
    },
    { key: 'threshold1', label: 'Low Threshold / Param 1', type: 'number', min: 0, max: 500, defaultValue: 50 },
    { key: 'threshold2', label: 'High Threshold / Param 2', type: 'number', min: 0, max: 500, defaultValue: 150 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_edge_detection' },
});

nodeRegistry.register({
  nodeType: 'gradient_derivatives',
  version: '1.0.0',
  displayName: 'Gradient Derivatives',
  category: 'image_processing',
  description: 'Computes directional gradient derivatives (dx, dy) and magnitude',
  icon: 'zap',
  tags: ['gradient', 'derivative', 'scharr', 'sobel', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Gradient Magnitude', dataType: 'ImageFrame', description: 'Gradient magnitude map', required: true },
  ],
  defaultConfig: { operator: 'sobel', ksize: 3 },
  configSchema: z.object({
    operator: z.enum(['sobel', 'scharr']).default('sobel'),
    ksize: z.number().int().default(3),
  }),
  configFields: [
    {
      key: 'operator',
      label: 'Derivative Operator',
      type: 'select',
      defaultValue: 'sobel',
      options: [
        { label: 'Sobel', value: 'sobel' },
        { label: 'Scharr', value: 'scharr' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_gradient_derivatives' },
});

nodeRegistry.register({
  nodeType: 'image_filter',
  version: '1.0.0',
  displayName: 'Custom 2D Filter',
  category: 'image_processing',
  description: 'Convolves image with a customized 2D convolution kernel',
  icon: 'zap',
  tags: ['filter', 'kernel', 'convolution', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Filtered Image', dataType: 'ImageFrame', description: 'Convolved output frame', required: true },
  ],
  defaultConfig: { preset: 'emboss' },
  configSchema: z.object({
    preset: z.enum(['emboss', 'ridge', 'box_blur', 'motion_blur']).default('emboss'),
  }),
  configFields: [
    {
      key: 'preset',
      label: 'Filter Preset',
      type: 'select',
      defaultValue: 'emboss',
      options: [
        { label: 'Emboss', value: 'emboss' },
        { label: 'Ridge Detection', value: 'ridge' },
        { label: 'Box Blur', value: 'box_blur' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_image_filter' },
});

nodeRegistry.register({
  nodeType: 'hough_transform',
  version: '1.0.0',
  displayName: 'Hough Transform',
  category: 'image_processing',
  description: 'Detects parametric lines or circles using Hough Transform',
  icon: 'zap',
  tags: ['hough', 'lines', 'circles', 'geometry', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Edge map or grayscale frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Overlay Image', dataType: 'ImageFrame', description: 'Visual overlay with detected lines/circles', required: true },
    { id: 'features', name: 'Features', dataType: 'FeatureSet', description: 'Detected lines and circles parameters', required: false },
  ],
  defaultConfig: { mode: 'lines_p', threshold: 50, min_line_length: 30, max_line_gap: 10 },
  configSchema: z.object({
    mode: z.enum(['lines', 'lines_p', 'circles']).default('lines_p'),
    threshold: z.number().int().min(1).default(50),
    min_line_length: z.number().default(30),
    max_line_gap: z.number().default(10),
  }),
  configFields: [
    {
      key: 'mode',
      label: 'Hough Mode',
      type: 'select',
      defaultValue: 'lines_p',
      options: [
        { label: 'Probabilistic Lines (HoughLinesP)', value: 'lines_p' },
        { label: 'Standard Lines (HoughLines)', value: 'lines' },
        { label: 'Circles (HoughCircles)', value: 'circles' },
      ],
    },
    { key: 'threshold', label: 'Accumulator Threshold', type: 'number', min: 1, defaultValue: 50 },
    { key: 'min_line_length', label: 'Min Line Length', type: 'number', min: 1, defaultValue: 30 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_hough_transform' },
});

nodeRegistry.register({
  nodeType: 'template_matching',
  version: '1.0.0',
  displayName: 'Template Matching',
  category: 'image_processing',
  description: 'Finds positions matching a reference template patch in the source image',
  icon: 'zap',
  tags: ['template', 'matching', 'pattern', 'locate', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Source Image', dataType: 'ImageFrame', description: 'Source frame to search in', required: true },
    { id: 'template_in', name: 'Template Image', dataType: 'ImageFrame', description: 'Template pattern to match', required: false },
  ],
  outputs: [
    { id: 'image_out', name: 'Overlay Image', dataType: 'ImageFrame', description: 'Image with detected match rectangle', required: true },
    { id: 'features', name: 'Matches', dataType: 'FeatureSet', description: 'Matched coordinates and scores', required: false },
  ],
  defaultConfig: { method: 'TM_CCOEFF_NORMED', match_threshold: 0.8 },
  configSchema: z.object({
    method: z.string().default('TM_CCOEFF_NORMED'),
    match_threshold: z.number().min(0).max(1).default(0.8),
  }),
  configFields: [
    { key: 'match_threshold', label: 'Match Confidence Threshold', type: 'range', min: 0.1, max: 1.0, step: 0.05, defaultValue: 0.8 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_template_matching' },
});

nodeRegistry.register({
  nodeType: 'background_subtraction',
  version: '1.0.0',
  displayName: 'Background Subtraction',
  category: 'image_processing',
  description: 'Segments foreground motion/defects against a static background reference',
  icon: 'zap',
  tags: ['background', 'difference', 'foreground', 'subtraction', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Current Frame', dataType: 'ImageFrame', description: 'Current inspection frame', required: true },
    { id: 'background_in', name: 'Background Ref', dataType: 'ImageFrame', description: 'Golden background frame', required: false },
  ],
  outputs: [
    { id: 'image_out', name: 'Difference Mask', dataType: 'MaskFrame', description: 'Foreground difference mask', required: true },
  ],
  defaultConfig: { threshold_val: 30 },
  configSchema: z.object({ threshold_val: z.number().min(1).max(255).default(30) }),
  configFields: [
    { key: 'threshold_val', label: 'Difference Threshold', type: 'number', min: 1, max: 255, defaultValue: 30 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_background_subtraction' },
});

nodeRegistry.register({
  nodeType: 'image_registration',
  version: '1.0.0',
  displayName: 'Image Registration',
  category: 'image_processing',
  description: 'Aligns an input image with a reference template via translation / homography',
  icon: 'zap',
  tags: ['align', 'registration', 'translation', 'homography', 'processing'],
  inputs: [
    { id: 'image_in', name: 'Target Image', dataType: 'ImageFrame', description: 'Target image to align', required: true },
    { id: 'ref_image', name: 'Reference Image', dataType: 'ImageFrame', description: 'Reference alignment image', required: false },
  ],
  outputs: [
    { id: 'image_out', name: 'Aligned Image', dataType: 'ImageFrame', description: 'Warped aligned image', required: true },
  ],
  defaultConfig: { warp_mode: 'translation', num_iterations: 50 },
  configSchema: z.object({
    warp_mode: z.enum(['translation', 'euclidean', 'affine']).default('translation'),
    num_iterations: z.number().int().default(50),
  }),
  configFields: [
    {
      key: 'warp_mode',
      label: 'Warp Mode',
      type: 'select',
      defaultValue: 'translation',
      options: [
        { label: 'Translation', value: 'translation' },
        { label: 'Euclidean (Rigid)', value: 'euclidean' },
        { label: 'Affine', value: 'affine' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.processing.handle_image_registration' },
});

// ==========================================
// Category 4: Segmentation
// ==========================================
nodeRegistry.register({
  nodeType: 'threshold_segmentation',
  version: '1.0.0',
  displayName: 'Threshold Segmentation',
  category: 'segmentation',
  description: 'Segments foreground object regions using direct dual-threshold limits',
  icon: 'scissors',
  tags: ['segmentation', 'threshold', 'foreground', 'regions'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'mask_out', name: 'Segment Mask', dataType: 'MaskFrame', description: 'Segmented binary mask', required: true },
  ],
  defaultConfig: { min_thresh: 100, max_thresh: 255 },
  configSchema: z.object({
    min_thresh: z.number().min(0).max(255).default(100),
    max_thresh: z.number().min(0).max(255).default(255),
  }),
  configFields: [
    { key: 'min_thresh', label: 'Min Intensity Cutoff', type: 'range', min: 0, max: 255, defaultValue: 100 },
    { key: 'max_thresh', label: 'Max Intensity Cutoff', type: 'range', min: 0, max: 255, defaultValue: 255 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.segmentation.handle_threshold_segmentation' },
});

nodeRegistry.register({
  nodeType: 'color_segmentation',
  version: '1.0.0',
  displayName: 'Color Segmentation',
  category: 'segmentation',
  description: 'Isolates parts of interest by Hue, Saturation, and Value intervals',
  icon: 'scissors',
  tags: ['segmentation', 'color', 'hsv', 'isolate'],
  inputs: [
    { id: 'image_in', name: 'Color Image In', dataType: 'ImageFrame', description: 'Input color frame', required: true },
  ],
  outputs: [
    { id: 'mask_out', name: 'Segment Mask', dataType: 'MaskFrame', description: 'Segmented color mask', required: true },
  ],
  defaultConfig: { hue_min: 0, hue_max: 30, sat_min: 50, sat_max: 255, val_min: 50, val_max: 255 },
  configSchema: z.object({
    hue_min: z.number().min(0).max(180).default(0),
    hue_max: z.number().min(0).max(180).default(30),
    sat_min: z.number().min(0).max(255).default(50),
    sat_max: z.number().min(0).max(255).default(255),
    val_min: z.number().min(0).max(255).default(50),
    val_max: z.number().min(0).max(255).default(255),
  }),
  configFields: [
    { key: 'hue_min', label: 'Hue Min (0-180)', type: 'range', min: 0, max: 180, defaultValue: 0 },
    { key: 'hue_max', label: 'Hue Max (0-180)', type: 'range', min: 0, max: 180, defaultValue: 30 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.segmentation.handle_color_segmentation' },
});

nodeRegistry.register({
  nodeType: 'connected_components',
  version: '1.0.0',
  displayName: 'Connected Components',
  category: 'segmentation',
  description: 'Labels distinct connected foreground regions and extracts centroids and stats',
  icon: 'scissors',
  tags: ['connected', 'components', 'labels', 'stats', 'segmentation'],
  inputs: [
    { id: 'mask_in', name: 'Binary Mask', dataType: 'MaskFrame', description: 'Binary input mask', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Labeled Image', dataType: 'ImageFrame', description: 'Colorized component labels preview', required: true },
    { id: 'features', name: 'Component Stats', dataType: 'FeatureSet', description: 'Bounding boxes, areas, and centroids', required: false },
  ],
  defaultConfig: { connectivity: 8 },
  configSchema: z.object({ connectivity: z.enum([4, 8] as any).default(8) }),
  configFields: [
    {
      key: 'connectivity',
      label: 'Pixel Connectivity',
      type: 'select',
      defaultValue: 8,
      options: [
        { label: '8-Connected', value: 8 },
        { label: '4-Connected', value: 4 },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.segmentation.handle_connected_components' },
});

nodeRegistry.register({
  nodeType: 'watershed_segmentation',
  version: '1.0.0',
  displayName: 'Watershed Segmentation',
  category: 'segmentation',
  description: 'Separates touching/overlapping objects using marker-based watershed algorithm',
  icon: 'scissors',
  tags: ['watershed', 'separation', 'touching', 'markers', 'segmentation'],
  inputs: [
    { id: 'image_in', name: 'Color Image In', dataType: 'ImageFrame', description: 'Input color frame', required: true },
    { id: 'mask_in', name: 'Binary Mask In', dataType: 'MaskFrame', description: 'Binary mask of objects', required: false },
  ],
  outputs: [
    { id: 'image_out', name: 'Segmented View', dataType: 'ImageFrame', description: 'Overlay with separated boundaries', required: true },
    { id: 'mask_out', name: 'Watershed Mask', dataType: 'MaskFrame', description: 'Individual segment boundaries', required: false },
  ],
  defaultConfig: { dist_threshold: 0.5 },
  configSchema: z.object({ dist_threshold: z.number().min(0.1).max(0.9).default(0.5) }),
  configFields: [
    { key: 'dist_threshold', label: 'Distance Transform Ratio', type: 'range', min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.5 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.segmentation.handle_watershed_segmentation' },
});

nodeRegistry.register({
  nodeType: 'grabcut_segmentation',
  version: '1.0.0',
  displayName: 'GrabCut Segmentation',
  category: 'segmentation',
  description: 'Interactive foreground extraction using bounding box GrabCut algorithm',
  icon: 'scissors',
  tags: ['grabcut', 'foreground', 'cut', 'segmentation'],
  inputs: [
    { id: 'image_in', name: 'Color Image In', dataType: 'ImageFrame', description: 'Input color frame', required: true },
  ],
  outputs: [
    { id: 'mask_out', name: 'Foreground Mask', dataType: 'MaskFrame', description: 'Extracted foreground mask', required: true },
  ],
  defaultConfig: { rect: [10, 10, 200, 200], iterations: 5 },
  configSchema: z.object({
    rect: z.array(z.number()).length(4).default([10, 10, 200, 200]),
    iterations: z.number().int().min(1).max(10).default(5),
  }),
  configFields: [
    { key: 'iterations', label: 'Optimization Iterations', type: 'number', min: 1, max: 10, defaultValue: 5 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.segmentation.handle_grabcut_segmentation' },
});

nodeRegistry.register({
  nodeType: 'mask_operations',
  version: '1.0.0',
  displayName: 'Mask Operations',
  category: 'segmentation',
  description: 'Performs boolean bitwise operations (AND, OR, XOR, NOT) between binary masks',
  icon: 'scissors',
  tags: ['mask', 'bitwise', 'and', 'or', 'xor', 'not', 'segmentation'],
  inputs: [
    { id: 'mask_a', name: 'Mask A', dataType: 'MaskFrame', description: 'First binary mask', required: true },
    { id: 'mask_b', name: 'Mask B', dataType: 'MaskFrame', description: 'Second binary mask', required: false },
  ],
  outputs: [
    { id: 'mask_out', name: 'Combined Mask', dataType: 'MaskFrame', description: 'Resulting binary mask', required: true },
  ],
  defaultConfig: { operation: 'and' },
  configSchema: z.object({
    operation: z.enum(['and', 'or', 'xor', 'not']).default('and'),
  }),
  configFields: [
    {
      key: 'operation',
      label: 'Bitwise Operation',
      type: 'select',
      defaultValue: 'and',
      options: [
        { label: 'AND (Intersection)', value: 'and' },
        { label: 'OR (Union)', value: 'or' },
        { label: 'XOR (Difference)', value: 'xor' },
        { label: 'NOT (Inversion)', value: 'not' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.segmentation.handle_mask_operations' },
});

nodeRegistry.register({
  nodeType: 'region_filter',
  version: '1.0.0',
  displayName: 'Region Filter',
  category: 'segmentation',
  description: 'Filters segmented regions according to minimum/maximum surface area and aspect ratio',
  icon: 'scissors',
  tags: ['filter', 'region', 'area', 'clean', 'segmentation'],
  inputs: [
    { id: 'mask_in', name: 'Binary Mask', dataType: 'MaskFrame', description: 'Input mask to filter', required: true },
  ],
  outputs: [
    { id: 'mask_out', name: 'Filtered Mask', dataType: 'MaskFrame', description: 'Mask with noise regions removed', required: true },
  ],
  defaultConfig: { min_area: 50, max_area: 100000 },
  configSchema: z.object({
    min_area: z.number().min(0).default(50),
    max_area: z.number().min(0).default(100000),
  }),
  configFields: [
    { key: 'min_area', label: 'Minimum Region Area (px²)', type: 'number', min: 0, defaultValue: 50 },
    { key: 'max_area', label: 'Maximum Region Area (px²)', type: 'number', min: 0, defaultValue: 100000 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.segmentation.handle_region_filter' },
});

// ==========================================
// Category 5: Feature Extraction
// ==========================================
nodeRegistry.register({
  nodeType: 'contour_detection',
  version: '1.0.0',
  displayName: 'Contour Detection',
  category: 'feature_extraction',
  description: 'Finds geometric contours, computes bounding boxes, and generates annotated preview',
  icon: 'shapes',
  tags: ['contour', 'blob', 'boundary', 'shape', 'inspection', 'opencv', 'features'],
  inputs: [
    { id: 'mask_in', name: 'Binary Mask In', dataType: 'MaskFrame', description: 'Single-channel binary mask from threshold node', required: true },
  ],
  outputs: [
    { id: 'detections', name: 'Detections', dataType: 'DetectionResult', description: 'Structured detection results (count, bounding boxes, areas)', required: false },
    { id: 'contours', name: 'Contours', dataType: 'ContourSet', description: 'Extracted contour point arrays and metadata', required: false },
    { id: 'contours_out', name: 'Contour Arrays', dataType: 'ContourSet', description: 'Filtered raw contour coordinate lists', required: false },
    { id: 'image_out', name: 'Annotated Preview', dataType: 'ImageFrame', description: 'Visual overlay with contours and bounding boxes', required: true },
  ],
  defaultConfig: { mode: 'RETR_EXTERNAL', method: 'CHAIN_APPROX_SIMPLE', minArea: 50, maxArea: 500000, drawBoundingBoxes: true },
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
    { key: 'minArea', label: 'Min Contour Area (px²)', type: 'number', min: 0, defaultValue: 50 },
    { key: 'maxArea', label: 'Max Contour Area (px²)', type: 'number', min: 0, defaultValue: 500000 },
    { key: 'drawBoundingBoxes', label: 'Draw Bounding Rectangles', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_contour_detection', minRuntimeVersion: '0.1.0' },
});

nodeRegistry.register({
  nodeType: 'contour_filter',
  version: '1.0.0',
  displayName: 'Contour Filter',
  category: 'feature_extraction',
  description: 'Filters contour set by minimum/maximum area, perimeter, and circularity',
  icon: 'shapes',
  tags: ['contour', 'filter', 'area', 'circularity', 'features'],
  inputs: [
    { id: 'contours_in', name: 'Contours In', dataType: 'ContourSet', description: 'Input contour set', required: true },
  ],
  outputs: [
    { id: 'contours_out', name: 'Filtered Contours', dataType: 'ContourSet', description: 'Filtered contour set', required: true },
  ],
  defaultConfig: { min_area: 50, max_area: 100000, min_circularity: 0.0 },
  configSchema: z.object({
    min_area: z.number().min(0).default(50),
    max_area: z.number().min(0).default(100000),
    min_circularity: z.number().min(0).max(1).default(0.0),
  }),
  configFields: [
    { key: 'min_area', label: 'Min Area (px²)', type: 'number', min: 0, defaultValue: 50 },
    { key: 'max_area', label: 'Max Area (px²)', type: 'number', min: 0, defaultValue: 100000 },
    { key: 'min_circularity', label: 'Min Circularity (0-1)', type: 'range', min: 0, max: 1, step: 0.05, defaultValue: 0.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_contour_filter' },
});

nodeRegistry.register({
  nodeType: 'blob_analysis',
  version: '1.0.0',
  displayName: 'Blob Analysis',
  category: 'feature_extraction',
  description: 'Detects circular/elliptical blobs using SimpleBlobDetector',
  icon: 'shapes',
  tags: ['blob', 'detector', 'inertia', 'circularity', 'features'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input image or mask', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Overlay Image', dataType: 'ImageFrame', description: 'Image with detected blobs circled', required: true },
    { id: 'features', name: 'Blobs', dataType: 'FeatureSet', description: 'Blob centers, sizes, and count', required: false },
  ],
  defaultConfig: { min_area: 10, max_area: 5000, filter_by_circularity: false },
  configSchema: z.object({
    min_area: z.number().default(10),
    max_area: z.number().default(5000),
    filter_by_circularity: z.boolean().default(false),
  }),
  configFields: [
    { key: 'min_area', label: 'Min Blob Area', type: 'number', defaultValue: 10 },
    { key: 'max_area', label: 'Max Blob Area', type: 'number', defaultValue: 5000 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_blob_analysis' },
});

nodeRegistry.register({
  nodeType: 'shape_analysis',
  version: '1.0.0',
  displayName: 'Shape Analysis',
  category: 'feature_extraction',
  description: 'Calculates shape descriptors: circularity, aspect ratio, solidity, and moments',
  icon: 'shapes',
  tags: ['shape', 'moments', 'circularity', 'solidity', 'features'],
  inputs: [
    { id: 'contours_in', name: 'Contours In', dataType: 'ContourSet', description: 'Contour collection', required: true },
  ],
  outputs: [
    { id: 'features', name: 'Shape Descriptors', dataType: 'FeatureSet', description: 'Computed shape metrics and geometry', required: true },
  ],
  defaultConfig: { fit_ellipse: true, compute_convex_hull: true },
  configSchema: z.object({
    fit_ellipse: z.boolean().default(true),
    compute_convex_hull: z.boolean().default(true),
  }),
  configFields: [
    { key: 'fit_ellipse', label: 'Fit Ellipse to Contours', type: 'checkbox', defaultValue: true },
    { key: 'compute_convex_hull', label: 'Compute Convex Hull', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_shape_analysis' },
});

nodeRegistry.register({
  nodeType: 'bounding_geometry',
  version: '1.0.0',
  displayName: 'Bounding Geometry',
  category: 'feature_extraction',
  description: 'Extracts axis-aligned bounding rect, rotated min-area rect, and min-enclosing circle',
  icon: 'shapes',
  tags: ['bounding', 'rect', 'minarea', 'circle', 'features'],
  inputs: [
    { id: 'contours_in', name: 'Contours In', dataType: 'ContourSet', description: 'Contour collection', required: true },
  ],
  outputs: [
    { id: 'features', name: 'Bounding Geometries', dataType: 'FeatureSet', description: 'Boxes and circle coordinates', required: true },
  ],
  defaultConfig: { mode: 'all' },
  configSchema: z.object({
    mode: z.enum(['rect', 'min_area_rect', 'min_circle', 'all']).default('all'),
  }),
  configFields: [
    {
      key: 'mode',
      label: 'Geometry Mode',
      type: 'select',
      defaultValue: 'all',
      options: [
        { label: 'All Geometries', value: 'all' },
        { label: 'Upright Bounding Rect', value: 'rect' },
        { label: 'Rotated Min Area Rect', value: 'min_area_rect' },
        { label: 'Min Enclosing Circle', value: 'min_circle' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_bounding_geometry' },
});

nodeRegistry.register({
  nodeType: 'corner_detection',
  version: '1.0.0',
  displayName: 'Corner Detection',
  category: 'feature_extraction',
  description: 'Detects salient subpixel corners using Shi-Tomasi or Harris detector',
  icon: 'shapes',
  tags: ['corner', 'harris', 'shi-tomasi', 'features'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Grayscale image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Corner Preview', dataType: 'ImageFrame', description: 'Visual overlay with highlighted corners', required: true },
    { id: 'features', name: 'Corners', dataType: 'FeatureSet', description: 'Corner coordinates list', required: false },
  ],
  defaultConfig: { max_corners: 100, quality_level: 0.01, min_distance: 10 },
  configSchema: z.object({
    max_corners: z.number().int().min(1).default(100),
    quality_level: z.number().min(0.001).max(1).default(0.01),
    min_distance: z.number().min(1).default(10),
  }),
  configFields: [
    { key: 'max_corners', label: 'Max Corners', type: 'number', min: 1, defaultValue: 100 },
    { key: 'quality_level', label: 'Quality Level (0-1)', type: 'number', min: 0.001, max: 1, defaultValue: 0.01 },
    { key: 'min_distance', label: 'Min Distance Between Corners (px)', type: 'number', min: 1, defaultValue: 10 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_corner_detection' },
});

nodeRegistry.register({
  nodeType: 'keypoint_detection',
  version: '1.0.0',
  displayName: 'Keypoint Detection',
  category: 'feature_extraction',
  description: 'Extracts interest points using fast traditional keypoint extractors (ORB / FAST)',
  icon: 'shapes',
  tags: ['keypoint', 'orb', 'fast', 'descriptors', 'features'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Keypoints Preview', dataType: 'ImageFrame', description: 'Image with detected keypoint markers', required: true },
    { id: 'features', name: 'Keypoints', dataType: 'FeatureSet', description: 'Keypoint coordinates and scales', required: false },
  ],
  defaultConfig: { detector: 'orb', n_features: 500 },
  configSchema: z.object({
    detector: z.enum(['orb', 'fast']).default('orb'),
    n_features: z.number().int().min(10).default(500),
  }),
  configFields: [
    {
      key: 'detector',
      label: 'Detector Type',
      type: 'select',
      defaultValue: 'orb',
      options: [
        { label: 'ORB (Oriented FAST and Rotated BRIEF)', value: 'orb' },
        { label: 'FAST Corner Detector', value: 'fast' },
      ],
    },
    { key: 'n_features', label: 'Max Number of Features', type: 'number', min: 10, defaultValue: 500 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_keypoint_detection' },
});

nodeRegistry.register({
  nodeType: 'line_circle_extraction',
  version: '1.0.0',
  displayName: 'Line & Circle Extraction',
  category: 'feature_extraction',
  description: 'Extracts clean line segments and circles from detected edges or contours',
  icon: 'shapes',
  tags: ['line', 'circle', 'primitive', 'extraction', 'features'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input edge map or frame', required: true },
  ],
  outputs: [
    { id: 'features', name: 'Primitives', dataType: 'FeatureSet', description: 'Fitted lines and circles coordinates', required: true },
  ],
  defaultConfig: { target_primitive: 'lines' },
  configSchema: z.object({
    target_primitive: z.enum(['lines', 'circles', 'both']).default('lines'),
  }),
  configFields: [
    {
      key: 'target_primitive',
      label: 'Primitive Type',
      type: 'select',
      defaultValue: 'lines',
      options: [
        { label: 'Lines', value: 'lines' },
        { label: 'Circles', value: 'circles' },
        { label: 'Both', value: 'both' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_line_circle_extraction' },
});

nodeRegistry.register({
  nodeType: 'image_statistics',
  version: '1.0.0',
  displayName: 'Image Statistics',
  category: 'feature_extraction',
  description: 'Computes intensity statistics: mean, stddev, min, max, entropy',
  icon: 'shapes',
  tags: ['stats', 'mean', 'stddev', 'entropy', 'features'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'features', name: 'Statistics', dataType: 'FeatureSet', description: 'Scalar metrics dictionary', required: true },
  ],
  defaultConfig: {},
  configSchema: z.object({}),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_image_statistics' },
});

nodeRegistry.register({
  nodeType: 'projection_profile',
  version: '1.0.0',
  displayName: 'Projection Profile',
  category: 'feature_extraction',
  description: 'Computes horizontal and vertical pixel projection intensity profiles',
  icon: 'shapes',
  tags: ['projection', 'profile', 'histogram', 'features'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input binary mask or grayscale image', required: true },
  ],
  outputs: [
    { id: 'features', name: 'Profile Data', dataType: 'FeatureSet', description: '1D horizontal and vertical projection arrays', required: true },
  ],
  defaultConfig: { axis: 'both' },
  configSchema: z.object({
    axis: z.enum(['horizontal', 'vertical', 'both']).default('both'),
  }),
  configFields: [
    {
      key: 'axis',
      label: 'Projection Axis',
      type: 'select',
      defaultValue: 'both',
      options: [
        { label: 'Both Axes (H & V)', value: 'both' },
        { label: 'Horizontal Only', value: 'horizontal' },
        { label: 'Vertical Only', value: 'vertical' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.features.handle_projection_profile' },
});

// ==========================================
// Category 6: Measurement & Metrology
// ==========================================
nodeRegistry.register({
  nodeType: 'distance_measurement',
  version: '1.0.0',
  displayName: 'Distance Measurement',
  category: 'measurement_metrology',
  description: 'Calculates Euclidean distance and delta X/Y between two points or centroids',
  icon: 'ruler',
  tags: ['distance', 'euclidean', 'points', 'metrology'],
  inputs: [
    { id: 'point_a', name: 'Point A / Feature', dataType: 'FeatureSet', description: 'First point or feature', required: false },
    { id: 'point_b', name: 'Point B / Feature', dataType: 'FeatureSet', description: 'Second point or feature', required: false },
  ],
  outputs: [
    { id: 'measurement', name: 'Distance Result', dataType: 'MeasurementResult', description: 'Measured distance in pixels and engineering units', required: true },
  ],
  defaultConfig: { x1: 0, y1: 0, x2: 100, y2: 100, unit: 'px', scale: 1.0 },
  configSchema: z.object({
    x1: z.number().default(0),
    y1: z.number().default(0),
    x2: z.number().default(100),
    y2: z.number().default(100),
    unit: z.string().default('px'),
    scale: z.number().default(1.0),
  }),
  configFields: [
    { key: 'scale', label: 'Pixel Calibration Scale (unit/px)', type: 'number', defaultValue: 1.0 },
    { key: 'unit', label: 'Engineering Unit', type: 'text', defaultValue: 'px' },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_distance_measurement' },
});

nodeRegistry.register({
  nodeType: 'line_measurement',
  version: '1.0.0',
  displayName: 'Line Measurement',
  category: 'measurement_metrology',
  description: 'Measures length and orientation angle of detected or specified line segment',
  icon: 'ruler',
  tags: ['line', 'length', 'orientation', 'metrology'],
  inputs: [
    { id: 'features_in', name: 'Features In', dataType: 'FeatureSet', description: 'Detected lines feature set', required: false },
  ],
  outputs: [
    { id: 'measurement', name: 'Line Metrics', dataType: 'MeasurementResult', description: 'Length and angle in degrees', required: true },
  ],
  defaultConfig: { line_index: 0, scale: 1.0, unit: 'px' },
  configSchema: z.object({
    line_index: z.number().int().default(0),
    scale: z.number().default(1.0),
    unit: z.string().default('px'),
  }),
  configFields: [
    { key: 'line_index', label: 'Line Index to Measure', type: 'number', min: 0, defaultValue: 0 },
    { key: 'scale', label: 'Unit Scale (unit/px)', type: 'number', defaultValue: 1.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_line_measurement' },
});

nodeRegistry.register({
  nodeType: 'circle_measurement',
  version: '1.0.0',
  displayName: 'Circle Measurement',
  category: 'measurement_metrology',
  description: 'Measures diameter, radius, perimeter, and center of circle / hole feature',
  icon: 'ruler',
  tags: ['circle', 'diameter', 'radius', 'hole', 'metrology'],
  inputs: [
    { id: 'mask_in', name: 'Mask In', dataType: 'MaskFrame', description: 'Binary mask containing circular object or hole', required: false },
    { id: 'features_in', name: 'Features In', dataType: 'FeatureSet', description: 'Detected circles or contours', required: false },
  ],
  outputs: [
    { id: 'measurement', name: 'Circle Metrics', dataType: 'MeasurementResult', description: 'Diameter, radius, and center coordinates', required: true },
    { id: 'scalar_value', name: 'Diameter (Scalar)', dataType: 'Scalar', description: 'Measured diameter value for tolerance/compare logic', required: false },
    { id: 'image_out', name: 'Circle Preview', dataType: 'ImageFrame', description: 'Visual preview of fitted circle and contour', required: false },
  ],
  defaultConfig: { circle_index: 0, scale: 1.0, unit: 'mm' },
  configSchema: z.object({
    circle_index: z.number().int().default(0),
    scale: z.number().default(1.0),
    unit: z.string().default('mm'),
  }),
  configFields: [
    { key: 'scale', label: 'Calibration Scale (mm/px)', type: 'number', defaultValue: 1.0 },
    { key: 'unit', label: 'Unit', type: 'text', defaultValue: 'mm' },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.circle_measurement_handler' },
});

nodeRegistry.register({
  nodeType: 'rectangle_measurement',
  version: '1.0.0',
  displayName: 'Rectangle Measurement',
  category: 'measurement_metrology',
  description: 'Measures width, height, aspect ratio, and diagonal of rectangular component',
  icon: 'ruler',
  tags: ['rect', 'width', 'height', 'aspect_ratio', 'metrology'],
  inputs: [
    { id: 'features_in', name: 'Features In', dataType: 'FeatureSet', description: 'Bounding geometry features', required: false },
  ],
  outputs: [
    { id: 'measurement', name: 'Rect Metrics', dataType: 'MeasurementResult', description: 'Width, height, aspect ratio', required: true },
  ],
  defaultConfig: { scale: 1.0, unit: 'mm' },
  configSchema: z.object({
    scale: z.number().default(1.0),
    unit: z.string().default('mm'),
  }),
  configFields: [
    { key: 'scale', label: 'Scale Factor (unit/px)', type: 'number', defaultValue: 1.0 },
    { key: 'unit', label: 'Unit Name', type: 'text', defaultValue: 'mm' },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_rectangle_measurement' },
});

nodeRegistry.register({
  nodeType: 'angle_measurement',
  version: '1.0.0',
  displayName: 'Angle Measurement',
  category: 'measurement_metrology',
  description: 'Calculates angle in degrees between three points (vertex, p1, p2) or two lines',
  icon: 'ruler',
  tags: ['angle', 'degrees', 'vertex', 'protractor', 'metrology'],
  inputs: [
    { id: 'features_in', name: 'Features In', dataType: 'FeatureSet', description: 'Features containing vertex points', required: false },
  ],
  outputs: [
    { id: 'measurement', name: 'Angle Result', dataType: 'MeasurementResult', description: 'Measured angle in degrees and radians', required: true },
  ],
  defaultConfig: { vertex: [100, 100], p1: [200, 100], p2: [100, 200] },
  configSchema: z.object({
    vertex: z.array(z.number()).length(2).default([100, 100]),
    p1: z.array(z.number()).length(2).default([200, 100]),
    p2: z.array(z.number()).length(2).default([100, 200]),
  }),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_angle_measurement' },
});

nodeRegistry.register({
  nodeType: 'caliper_measurement',
  version: '1.0.0',
  displayName: '1D Caliper Measurement',
  category: 'measurement_metrology',
  description: 'Simulates 1D optical caliper tool along a search rake to find edge transitions',
  icon: 'ruler',
  tags: ['caliper', 'edge', 'rake', 'subpixel', 'metrology'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'measurement', name: 'Caliper Result', dataType: 'MeasurementResult', description: 'Caliper distance between found edge transitions', required: true },
  ],
  defaultConfig: { start_pt: [50, 100], end_pt: [250, 100], polarity: 'all', edge_threshold: 20 },
  configSchema: z.object({
    start_pt: z.array(z.number()).length(2).default([50, 100]),
    end_pt: z.array(z.number()).length(2).default([250, 100]),
    polarity: z.enum(['dark_to_light', 'light_to_dark', 'all']).default('all'),
    edge_threshold: z.number().default(20),
  }),
  configFields: [
    {
      key: 'polarity',
      label: 'Edge Polarity',
      type: 'select',
      defaultValue: 'all',
      options: [
        { label: 'Any Transition', value: 'all' },
        { label: 'Dark to Light', value: 'dark_to_light' },
        { label: 'Light to Dark', value: 'light_to_dark' },
      ],
    },
    { key: 'edge_threshold', label: 'Edge Gradient Cutoff', type: 'number', defaultValue: 20 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_caliper_measurement' },
});

nodeRegistry.register({
  nodeType: 'gap_measurement',
  version: '1.0.0',
  displayName: 'Gap & Clearance Measurement',
  category: 'measurement_metrology',
  description: 'Measures clearance gap width and flushness between two parallel part edges',
  icon: 'ruler',
  tags: ['gap', 'clearance', 'flushness', 'parallel', 'metrology'],
  inputs: [
    { id: 'features_in', name: 'Features In', dataType: 'FeatureSet', description: 'Features containing edge points', required: false },
  ],
  outputs: [
    { id: 'measurement', name: 'Gap Result', dataType: 'MeasurementResult', description: 'Gap distance value', required: true },
  ],
  defaultConfig: { scale: 1.0, unit: 'mm' },
  configSchema: z.object({
    scale: z.number().default(1.0),
    unit: z.string().default('mm'),
  }),
  configFields: [
    { key: 'scale', label: 'Scale (mm/px)', type: 'number', defaultValue: 1.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_gap_measurement' },
});

nodeRegistry.register({
  nodeType: 'area_measurement',
  version: '1.0.0',
  displayName: 'Area Measurement',
  category: 'measurement_metrology',
  description: 'Computes physical surface area in calibrated units (mm², um²)',
  icon: 'ruler',
  tags: ['area', 'surface', 'calibrated', 'metrology'],
  inputs: [
    { id: 'contours_in', name: 'Contours In', dataType: 'ContourSet', description: 'Input contours or shapes', required: true },
  ],
  outputs: [
    { id: 'measurement', name: 'Area Result', dataType: 'MeasurementResult', description: 'Total surface area and individual region areas', required: true },
  ],
  defaultConfig: { scale_x: 1.0, scale_y: 1.0, unit: 'mm²' },
  configSchema: z.object({
    scale_x: z.number().default(1.0),
    scale_y: z.number().default(1.0),
    unit: z.string().default('mm²'),
  }),
  configFields: [
    { key: 'scale_x', label: 'X Scale (mm/px)', type: 'number', defaultValue: 1.0 },
    { key: 'scale_y', label: 'Y Scale (mm/px)', type: 'number', defaultValue: 1.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_area_measurement' },
});

nodeRegistry.register({
  nodeType: 'tolerance_check',
  version: '1.0.0',
  displayName: 'Tolerance Check',
  category: 'measurement_metrology',
  description: 'Validates measured dimension against lower and upper engineering tolerance limits (LSL / USL)',
  icon: 'ruler',
  tags: ['tolerance', 'lsl', 'usl', 'nominal', 'pass_fail', 'metrology'],
  inputs: [
    { id: 'measurement_in', name: 'Measurement In', dataType: 'MeasurementResult', description: 'Input measurement value', required: true },
  ],
  outputs: [
    { id: 'inspection', name: 'Inspection Verdict', dataType: 'InspectionResult', description: 'Verdict (OK/NG), deviation, and tolerance limits', required: true },
  ],
  defaultConfig: { nominal: 50.0, upper_tol: 2.0, lower_tol: -2.0 },
  configSchema: z.object({
    nominal: z.number().default(50.0),
    upper_tol: z.number().default(2.0),
    lower_tol: z.number().default(-2.0),
  }),
  configFields: [
    { key: 'nominal', label: 'Nominal Value', type: 'number', defaultValue: 50.0 },
    { key: 'upper_tol', label: 'Upper Tolerance (+)', type: 'number', defaultValue: 2.0 },
    { key: 'lower_tol', label: 'Lower Tolerance (-)', type: 'number', defaultValue: -2.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_tolerance_check' },
});

nodeRegistry.register({
  nodeType: 'pixel_calibration',
  version: '1.0.0',
  displayName: 'Pixel Calibration',
  category: 'measurement_metrology',
  description: 'Defines pixel-to-world conversion matrix and physical scale factors (mm/pixel)',
  icon: 'ruler',
  tags: ['calibration', 'scale', 'mm_per_pixel', 'world', 'metrology'],
  inputs: [],
  outputs: [
    { id: 'scale_out', name: 'Scale Factor', dataType: 'Scalar', description: 'Calibrated scale (units/pixel)', required: true },
  ],
  defaultConfig: { known_distance: 10.0, pixel_distance: 100.0, unit: 'mm' },
  configSchema: z.object({
    known_distance: z.number().min(0.001).default(10.0),
    pixel_distance: z.number().min(0.1).default(100.0),
    unit: z.string().default('mm'),
  }),
  configFields: [
    { key: 'known_distance', label: 'Known Target Size', type: 'number', defaultValue: 10.0 },
    { key: 'pixel_distance', label: 'Measured Pixels', type: 'number', defaultValue: 100.0 },
    { key: 'unit', label: 'Target Engineering Unit', type: 'text', defaultValue: 'mm' },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.measurement.handle_pixel_calibration' },
});

// ==========================================
// Category 7: Decision & Inspection Logic
// ==========================================
nodeRegistry.register({
  nodeType: 'compare',
  version: '1.0.0',
  displayName: 'Compare',
  category: 'decision_inspection_logic',
  description: 'Compares a value against target using operators (=, !=, <, <=, >, >=)',
  icon: 'check-circle-2',
  tags: ['compare', 'operator', 'boolean', 'decision', 'logic'],
  inputs: [
    { id: 'value_in', name: 'Value In', dataType: 'Scalar', description: 'Input numerical value', required: true },
  ],
  outputs: [
    { id: 'result', name: 'Boolean Result', dataType: 'Boolean', description: 'Comparison result (true/false)', required: true },
  ],
  defaultConfig: { operator: '==', target: 0 },
  configSchema: z.object({
    operator: z.enum(['==', '!=', '<', '<=', '>', '>=']).default('=='),
    target: z.number().default(0),
  }),
  configFields: [
    {
      key: 'operator',
      label: 'Comparison Operator',
      type: 'select',
      defaultValue: '==',
      options: [
        { label: 'Equal (==)', value: '==' },
        { label: 'Not Equal (!=)', value: '!=' },
        { label: 'Less Than (<)', value: '<' },
        { label: 'Less or Equal (<=)', value: '<=' },
        { label: 'Greater Than (>)', value: '>' },
        { label: 'Greater or Equal (>=)', value: '>=' },
      ],
    },
    { key: 'target', label: 'Target Value', type: 'number', defaultValue: 0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_compare' },
});

nodeRegistry.register({
  nodeType: 'range_check',
  version: '1.0.0',
  displayName: 'Range Check',
  category: 'decision_inspection_logic',
  description: 'Verifies whether input value is inside or outside specified [min, max] range',
  icon: 'check-circle-2',
  tags: ['range', 'limits', 'bounds', 'decision', 'logic'],
  inputs: [
    { id: 'value_in', name: 'Value In', dataType: 'Scalar', description: 'Input value to evaluate', required: true },
  ],
  outputs: [
    { id: 'in_range', name: 'In Range', dataType: 'Boolean', description: 'True if inside interval [min, max]', required: true },
  ],
  defaultConfig: { min_val: 0, max_val: 100, inclusive: true },
  configSchema: z.object({
    min_val: z.number().default(0),
    max_val: z.number().default(100),
    inclusive: z.boolean().default(true),
  }),
  configFields: [
    { key: 'min_val', label: 'Minimum Bound', type: 'number', defaultValue: 0 },
    { key: 'max_val', label: 'Maximum Bound', type: 'number', defaultValue: 100 },
    { key: 'inclusive', label: 'Inclusive Bounds', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_range_check' },
});

nodeRegistry.register({
  nodeType: 'logic_gate',
  version: '1.0.0',
  displayName: 'Logic Gate',
  category: 'decision_inspection_logic',
  description: 'Standard boolean logic gate (AND, OR, NOT, XOR, NAND, NOR)',
  icon: 'check-circle-2',
  tags: ['and', 'or', 'not', 'xor', 'gate', 'logic'],
  inputs: [
    { id: 'input_a', name: 'Input A', dataType: 'Boolean', description: 'First boolean input', required: true },
    { id: 'input_b', name: 'Input B', dataType: 'Boolean', description: 'Second boolean input', required: false },
  ],
  outputs: [
    { id: 'output', name: 'Output', dataType: 'Boolean', description: 'Boolean gate output', required: true },
  ],
  defaultConfig: { gate: 'AND' },
  configSchema: z.object({
    gate: z.enum(['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR']).default('AND'),
  }),
  configFields: [
    {
      key: 'gate',
      label: 'Logic Function',
      type: 'select',
      defaultValue: 'AND',
      options: [
        { label: 'AND', value: 'AND' },
        { label: 'OR', value: 'OR' },
        { label: 'NOT (Invert A)', value: 'NOT' },
        { label: 'XOR', value: 'XOR' },
        { label: 'NAND', value: 'NAND' },
        { label: 'NOR', value: 'NOR' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_logic_gate' },
});

nodeRegistry.register({
  nodeType: 'conditional_branch',
  version: '1.0.0',
  displayName: 'Conditional Branch',
  category: 'decision_inspection_logic',
  description: 'Switches downstream data flow depending on boolean condition (True / False branch)',
  icon: 'check-circle-2',
  tags: ['branch', 'conditional', 'switch', 'router', 'logic'],
  inputs: [
    { id: 'condition', name: 'Condition', dataType: 'Boolean', description: 'Condition selector', required: true },
    { id: 'data_in', name: 'Data In', dataType: 'ImageFrame', description: 'Data packet to route', required: true },
  ],
  outputs: [
    { id: 'branch_true', name: 'True Branch', dataType: 'ImageFrame', description: 'Passed if condition is True', required: false },
    { id: 'branch_false', name: 'False Branch', dataType: 'ImageFrame', description: 'Passed if condition is False', required: false },
  ],
  defaultConfig: {},
  configSchema: z.object({}),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_conditional_branch' },
});

nodeRegistry.register({
  nodeType: 'count_check',
  version: '1.0.0',
  displayName: 'Count Check',
  category: 'decision_inspection_logic',
  description: 'Verifies whether number of detected objects matches expected count exactly or within limits',
  icon: 'check-circle-2',
  tags: ['count', 'quantity', 'pins', 'bottles', 'logic'],
  inputs: [
    { id: 'features_in', name: 'Features / Contours', dataType: 'ContourSet', description: 'Extracted features or contours', required: true },
  ],
  outputs: [
    { id: 'inspection', name: 'Verdict', dataType: 'InspectionResult', description: 'OK if count matches expected range', required: true },
  ],
  defaultConfig: { expected_count: 5, tolerance: 0 },
  configSchema: z.object({
    expected_count: z.number().int().min(0).default(5),
    tolerance: z.number().int().min(0).default(0),
  }),
  configFields: [
    { key: 'expected_count', label: 'Expected Item Count', type: 'number', min: 0, defaultValue: 5 },
    { key: 'tolerance', label: 'Allowed Deviation (±)', type: 'number', min: 0, defaultValue: 0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_count_check' },
});

nodeRegistry.register({
  nodeType: 'presence_check',
  version: '1.0.0',
  displayName: 'Presence / Absence Check',
  category: 'decision_inspection_logic',
  description: 'Determines whether a required component, seal, or label is present or missing',
  icon: 'check-circle-2',
  tags: ['presence', 'absence', 'missing', 'defect', 'logic'],
  inputs: [
    { id: 'features_in', name: 'Features In', dataType: 'FeatureSet', description: 'Detection features', required: true },
  ],
  outputs: [
    { id: 'inspection', name: 'Verdict', dataType: 'InspectionResult', description: 'Verdict (OK if present, NG if missing)', required: true },
  ],
  defaultConfig: { min_area_present: 100 },
  configSchema: z.object({ min_area_present: z.number().default(100) }),
  configFields: [
    { key: 'min_area_present', label: 'Min Surface Area for Presence', type: 'number', defaultValue: 100 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_presence_check' },
});

nodeRegistry.register({
  nodeType: 'rule_evaluation',
  version: '1.0.0',
  displayName: 'Rule Evaluation',
  category: 'decision_inspection_logic',
  description: 'Evaluates logical expression combining multiple boolean inspection conditions',
  icon: 'check-circle-2',
  tags: ['rule', 'expression', 'formula', 'logic'],
  inputs: [
    { id: 'cond_1', name: 'Condition 1', dataType: 'Boolean', description: 'First rule condition', required: true },
    { id: 'cond_2', name: 'Condition 2', dataType: 'Boolean', description: 'Second rule condition', required: false },
  ],
  outputs: [
    { id: 'result', name: 'Rule Result', dataType: 'Boolean', description: 'Rule evaluation verdict', required: true },
  ],
  defaultConfig: { rule_mode: 'all_true' },
  configSchema: z.object({
    rule_mode: z.enum(['all_true', 'any_true', 'none_true']).default('all_true'),
  }),
  configFields: [
    {
      key: 'rule_mode',
      label: 'Rule Mode',
      type: 'select',
      defaultValue: 'all_true',
      options: [
        { label: 'All Conditions Must Be TRUE', value: 'all_true' },
        { label: 'At Least One Condition Must Be TRUE', value: 'any_true' },
        { label: 'None Must Be TRUE (Inverted)', value: 'none_true' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_rule_evaluation' },
});

nodeRegistry.register({
  nodeType: 'decision_ok_ng',
  version: '1.0.0',
  displayName: 'Decision OK / NG',
  category: 'decision_inspection_logic',
  description: 'Assigns final OK / NG part verdict and associates defect reason code',
  icon: 'check-circle-2',
  tags: ['verdict', 'ok', 'ng', 'pass', 'fail', 'defect_code', 'logic'],
  inputs: [
    { id: 'pass_condition', name: 'Pass Condition', dataType: 'Boolean', description: 'Boolean pass signal', required: true },
  ],
  outputs: [
    { id: 'decision', name: 'Verdict', dataType: 'InspectionResult', description: 'Final structured verdict object', required: true },
  ],
  defaultConfig: { defect_code: 'DEFECT_DIMENSION_OUT_OF_SPEC', ok_message: 'PART OK' },
  configSchema: z.object({
    defect_code: z.string().default('DEFECT_DIMENSION_OUT_OF_SPEC'),
    ok_message: z.string().default('PART OK'),
  }),
  configFields: [
    { key: 'defect_code', label: 'NG Defect Code', type: 'text', defaultValue: 'DEFECT_DIMENSION_OUT_OF_SPEC' },
    { key: 'ok_message', label: 'OK Status Message', type: 'text', defaultValue: 'PART OK' },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_decision_ok_ng' },
});

nodeRegistry.register({
  nodeType: 'result_aggregation',
  version: '1.0.0',
  displayName: 'Result Aggregation',
  category: 'decision_inspection_logic',
  description: 'Aggregates multiple individual inspection verdicts into one combined station verdict',
  icon: 'check-circle-2',
  tags: ['aggregate', 'verdict', 'multi_station', 'logic'],
  inputs: [
    { id: 'result_1', name: 'Verdict 1', dataType: 'InspectionResult', description: 'First inspection verdict', required: true },
    { id: 'result_2', name: 'Verdict 2', dataType: 'InspectionResult', description: 'Second inspection verdict', required: false },
  ],
  outputs: [
    { id: 'overall_decision', name: 'Overall Verdict', dataType: 'InspectionResult', description: 'Consolidated inspection verdict', required: true },
  ],
  defaultConfig: {},
  configSchema: z.object({}),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.logic.handle_result_aggregation' },
});

// ==========================================
// Category 8: Visualization
// ==========================================
nodeRegistry.register({
  nodeType: 'result_viewer',
  version: '1.0.0',
  displayName: 'Result Viewer',
  category: 'visualization',
  description: 'Displays actual inspection image output, detection overlays, and verdict metrics',
  icon: 'eye',
  tags: ['view', 'display', 'screen', 'inspector', 'output', 'overlay', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Display Image', dataType: 'ImageFrame', description: 'Image stream or annotated preview to display', required: true },
    { id: 'detections_in', name: 'Detections (Optional)', dataType: 'DetectionResult', description: 'Optional structured detections metadata overlay', required: false },
  ],
  outputs: [],
  defaultConfig: { showHistogram: false, zoomLevel: 1.0, title: 'Main Inspection Output', showOverlay: true },
  configSchema: ResultViewerConfigSchema,
  configFields: [
    { key: 'title', label: 'Viewer Window Title', type: 'text', defaultValue: 'Main Inspection Output' },
    { key: 'zoomLevel', label: 'Default Zoom Level', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 1.0 },
    { key: 'showHistogram', label: 'Display Luminance Histogram', type: 'checkbox', defaultValue: false },
    { key: 'showOverlay', label: 'Show Inspection Overlays', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_result_viewer', minRuntimeVersion: '0.1.0' },
});

nodeRegistry.register({
  nodeType: 'image_overlay',
  version: '1.0.0',
  displayName: 'Image Overlay',
  category: 'visualization',
  description: 'Blends a transparent color mask or heatmap onto the source image',
  icon: 'eye',
  tags: ['overlay', 'alpha', 'blend', 'color_mask', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Source Image', dataType: 'ImageFrame', description: 'Base image', required: true },
    { id: 'mask_in', name: 'Mask In', dataType: 'MaskFrame', description: 'Mask to overlay', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Overlay Image', dataType: 'ImageFrame', description: 'Blended visual image', required: true },
  ],
  defaultConfig: { alpha: 0.4, color: [0, 255, 0] },
  configSchema: z.object({
    alpha: z.number().min(0).max(1).default(0.4),
    color: z.array(z.number()).length(3).default([0, 255, 0]),
  }),
  configFields: [
    { key: 'alpha', label: 'Overlay Opacity (0-1)', type: 'range', min: 0, max: 1, step: 0.05, defaultValue: 0.4 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_image_overlay' },
});

nodeRegistry.register({
  nodeType: 'draw_roi',
  version: '1.0.0',
  displayName: 'Draw ROI',
  category: 'visualization',
  description: 'Draws inspection Region of Interest bounding boxes and coordinate labels',
  icon: 'eye',
  tags: ['draw', 'roi', 'box', 'label', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Base image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Annotated Image', dataType: 'ImageFrame', description: 'Image with drawn ROI', required: true },
  ],
  defaultConfig: { x: 50, y: 50, width: 200, height: 150, color: [255, 128, 0], thickness: 2 },
  configSchema: z.object({
    x: z.number().default(50),
    y: z.number().default(50),
    width: z.number().default(200),
    height: z.number().default(150),
    color: z.array(z.number()).length(3).default([255, 128, 0]),
    thickness: z.number().int().default(2),
  }),
  configFields: [
    { key: 'x', label: 'ROI X', type: 'number', defaultValue: 50 },
    { key: 'y', label: 'ROI Y', type: 'number', defaultValue: 50 },
    { key: 'width', label: 'ROI Width', type: 'number', defaultValue: 200 },
    { key: 'height', label: 'ROI Height', type: 'number', defaultValue: 150 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_draw_roi' },
});

nodeRegistry.register({
  nodeType: 'draw_contours',
  version: '1.0.0',
  displayName: 'Draw Contours',
  category: 'visualization',
  description: 'Draws detected contour boundaries and vertex points with custom line colors',
  icon: 'eye',
  tags: ['draw', 'contours', 'outline', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Base image', required: true },
    { id: 'contours_in', name: 'Contours In', dataType: 'ContourSet', description: 'Contour set to draw', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Drawn Contours Image', dataType: 'ImageFrame', description: 'Image with rendered outlines', required: true },
  ],
  defaultConfig: { color: [0, 255, 0], thickness: 2 },
  configSchema: z.object({
    color: z.array(z.number()).length(3).default([0, 255, 0]),
    thickness: z.number().int().default(2),
  }),
  configFields: [
    { key: 'thickness', label: 'Line Thickness', type: 'number', min: 1, max: 10, defaultValue: 2 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_draw_contours' },
});

nodeRegistry.register({
  nodeType: 'draw_measurement',
  version: '1.0.0',
  displayName: 'Draw Measurement',
  category: 'visualization',
  description: 'Annotates measurement dimension arrows, calipers, and calibrated value tags',
  icon: 'eye',
  tags: ['draw', 'arrow', 'dimension', 'metrology', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Base image', required: true },
    { id: 'measurement_in', name: 'Measurement In', dataType: 'MeasurementResult', description: 'Measurement to draw', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Annotated Image', dataType: 'ImageFrame', description: 'Image with dimension graphics', required: true },
  ],
  defaultConfig: { show_label: true },
  configSchema: z.object({ show_label: z.boolean().default(true) }),
  configFields: [
    { key: 'show_label', label: 'Display Value Text Tag', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.draw_measurement_handler' },
});

nodeRegistry.register({
  nodeType: 'draw_labels',
  version: '1.0.0',
  displayName: 'Draw Labels',
  category: 'visualization',
  description: 'Renders custom text labels, inspection titles, or defect codes onto image',
  icon: 'eye',
  tags: ['draw', 'text', 'label', 'hud', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Base image', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Labeled Image', dataType: 'ImageFrame', description: 'Image with rendered text', required: true },
  ],
  defaultConfig: { text: 'INSPECTION PASSED', origin: [20, 40], font_scale: 1.0, color: [0, 255, 0] },
  configSchema: z.object({
    text: z.string().default('INSPECTION PASSED'),
    origin: z.array(z.number()).length(2).default([20, 40]),
    font_scale: z.number().default(1.0),
    color: z.array(z.number()).length(3).default([0, 255, 0]),
  }),
  configFields: [
    { key: 'text', label: 'Label Text', type: 'text', defaultValue: 'INSPECTION PASSED' },
    { key: 'font_scale', label: 'Font Scale', type: 'number', defaultValue: 1.0 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_draw_labels' },
});

nodeRegistry.register({
  nodeType: 'mask_viewer',
  version: '1.0.0',
  displayName: 'Mask Viewer',
  category: 'visualization',
  description: 'Renders single-channel binary mask into high-contrast colorized display',
  icon: 'eye',
  tags: ['mask', 'display', 'colorized', 'visualization'],
  inputs: [
    { id: 'mask_in', name: 'Mask In', dataType: 'MaskFrame', description: 'Binary mask', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Display Frame', dataType: 'ImageFrame', description: 'Colorized mask frame', required: true },
  ],
  defaultConfig: { colormap: 'TURBO' },
  configSchema: z.object({ colormap: z.string().default('TURBO') }),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_mask_viewer' },
});

nodeRegistry.register({
  nodeType: 'histogram_viewer',
  version: '1.0.0',
  displayName: 'Histogram Viewer',
  category: 'visualization',
  description: 'Plots pixel luminance frequency distribution curve',
  icon: 'eye',
  tags: ['histogram', 'plot', 'distribution', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Histogram Plot Image', dataType: 'ImageFrame', description: 'Rendered histogram curve', required: true },
  ],
  defaultConfig: {},
  configSchema: z.object({}),
  configFields: [],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_histogram_viewer' },
});

nodeRegistry.register({
  nodeType: 'inspection_result_viewer',
  version: '1.0.0',
  displayName: 'Inspection Result Viewer',
  category: 'visualization',
  description: 'Industrial Heads-Up Display showing full-screen OK/NG banner, defect summary and cycle time',
  icon: 'eye',
  tags: ['hud', 'verdict', 'industrial', 'banner', 'ok_ng', 'visualization'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Inspection frame', required: true },
    { id: 'inspection_in', name: 'Inspection In', dataType: 'InspectionResult', description: 'Final inspection verdict', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'HUD Image Out', dataType: 'ImageFrame', description: 'Annotated inspection HUD image', required: true },
  ],
  defaultConfig: { show_banner: true, banner_size: 60 },
  configSchema: z.object({
    show_banner: z.boolean().default(true),
    banner_size: z.number().int().default(60),
  }),
  configFields: [
    { key: 'show_banner', label: 'Display Top Status Banner', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.visualization.handle_inspection_result_viewer' },
});

// ==========================================
// Category 9: Data & Logging
// ==========================================
nodeRegistry.register({
  nodeType: 'save_image',
  version: '1.0.0',
  displayName: 'Save Image',
  category: 'data_logging',
  description: 'Saves processed image buffer to disk in PNG/JPEG/BMP format',
  icon: 'database',
  tags: ['save', 'disk', 'export', 'write', 'logging'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Image to save', required: true },
  ],
  outputs: [
    { id: 'saved_path', name: 'Saved File Path', dataType: 'FileReference', description: 'Saved file path string', required: true },
  ],
  defaultConfig: { output_dir: 'output_images', file_prefix: 'capture_', format: 'png' },
  configSchema: z.object({
    output_dir: z.string().default('output_images'),
    file_prefix: z.string().default('capture_'),
    format: z.enum(['png', 'jpg', 'bmp']).default('png'),
  }),
  configFields: [
    { key: 'output_dir', label: 'Output Directory', type: 'text', defaultValue: 'output_images' },
    { key: 'file_prefix', label: 'File Name Prefix', type: 'text', defaultValue: 'capture_' },
    {
      key: 'format',
      label: 'Image Format',
      type: 'select',
      defaultValue: 'png',
      options: [
        { label: 'PNG (Lossless)', value: 'png' },
        { label: 'JPEG', value: 'jpg' },
        { label: 'BMP', value: 'bmp' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.data_logging.handle_save_image' },
});

nodeRegistry.register({
  nodeType: 'save_defect_image',
  version: '1.0.0',
  displayName: 'Save Defect Image',
  category: 'data_logging',
  description: 'Conditionally saves image only when part fails inspection (Verdict == NG)',
  icon: 'database',
  tags: ['defect', 'ng', 'quarantine', 'audit', 'logging'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Image to quarantine', required: true },
    { id: 'inspection_in', name: 'Inspection In', dataType: 'InspectionResult', description: 'Inspection verdict', required: true },
  ],
  outputs: [
    { id: 'saved_path', name: 'Saved Defect Path', dataType: 'FileReference', description: 'File path if saved', required: false },
  ],
  defaultConfig: { defect_dir: 'defects', save_only_ng: true },
  configSchema: z.object({
    defect_dir: z.string().default('defects'),
    save_only_ng: z.boolean().default(true),
  }),
  configFields: [
    { key: 'defect_dir', label: 'Defect Quarantine Directory', type: 'text', defaultValue: 'defects' },
    { key: 'save_only_ng', label: 'Save Only on NG Verdict', type: 'checkbox', defaultValue: true },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.data_logging.handle_save_defect_image' },
});

nodeRegistry.register({
  nodeType: 'save_measurement',
  version: '1.0.0',
  displayName: 'Save Measurement',
  category: 'data_logging',
  description: 'Serializes and exports measurement metrics to structured JSON / CSV records',
  icon: 'database',
  tags: ['measurement', 'export', 'telemetry', 'json', 'logging'],
  inputs: [
    { id: 'measurement_in', name: 'Measurement In', dataType: 'MeasurementResult', description: 'Measurement object', required: true },
  ],
  outputs: [
    { id: 'saved_path', name: 'Output File Path', dataType: 'FileReference', description: 'Path to exported log', required: true },
  ],
  defaultConfig: { file_path: 'measurements.json' },
  configSchema: z.object({ file_path: z.string().default('measurements.json') }),
  configFields: [
    { key: 'file_path', label: 'Log File Path', type: 'text', defaultValue: 'measurements.json' },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.data_logging.handle_save_measurement' },
});

nodeRegistry.register({
  nodeType: 'export_csv',
  version: '1.0.0',
  displayName: 'Export CSV',
  category: 'data_logging',
  description: 'Appends continuous inspection telemetry row to CSV spreadsheet',
  icon: 'database',
  tags: ['csv', 'excel', 'export', 'table', 'logging'],
  inputs: [
    { id: 'inspection_in', name: 'Inspection In', dataType: 'InspectionResult', description: 'Verdict data to log', required: true },
  ],
  outputs: [
    { id: 'csv_path', name: 'CSV File Path', dataType: 'FileReference', description: 'Path to CSV', required: true },
  ],
  defaultConfig: { csv_file: 'inspection_history.csv' },
  configSchema: z.object({ csv_file: z.string().default('inspection_history.csv') }),
  configFields: [
    { key: 'csv_file', label: 'CSV File Destination', type: 'text', defaultValue: 'inspection_history.csv' },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.data_logging.handle_export_csv' },
});

nodeRegistry.register({
  nodeType: 'inspection_logger',
  version: '1.0.0',
  displayName: 'Inspection Logger',
  category: 'data_logging',
  description: 'Structured run event logger with cycle timestamp, part ID, and verdict',
  icon: 'database',
  tags: ['logger', 'audit', 'spc', 'timestamp', 'logging'],
  inputs: [
    { id: 'inspection_in', name: 'Inspection In', dataType: 'InspectionResult', description: 'Inspection verdict', required: true },
  ],
  outputs: [
    { id: 'log_entry', name: 'Log Entry', dataType: 'String', description: 'Serialized log line string', required: true },
  ],
  defaultConfig: { log_format: 'json' },
  configSchema: z.object({ log_format: z.enum(['json', 'text']).default('json') }),
  configFields: [
    {
      key: 'log_format',
      label: 'Log Serialization Format',
      type: 'select',
      defaultValue: 'json',
      options: [
        { label: 'JSON Lines', value: 'json' },
        { label: 'Plain Text', value: 'text' },
      ],
    },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.data_logging.handle_inspection_logger' },
});

nodeRegistry.register({
  nodeType: 'result_history',
  version: '1.0.0',
  displayName: 'Result History Buffer',
  category: 'data_logging',
  description: 'Maintains in-memory circular ring buffer of recent inspection results for SPC trends',
  icon: 'database',
  tags: ['history', 'buffer', 'spc', 'trend', 'yield', 'logging'],
  inputs: [
    { id: 'inspection_in', name: 'Inspection In', dataType: 'InspectionResult', description: 'Inspection verdict', required: true },
  ],
  outputs: [
    { id: 'history_data', name: 'History Records', dataType: 'String', description: 'Summary statistics of recent runs', required: true },
  ],
  defaultConfig: { buffer_capacity: 100 },
  configSchema: z.object({ buffer_capacity: z.number().int().min(10).max(1000).default(100) }),
  configFields: [
    { key: 'buffer_capacity', label: 'Buffer Capacity (Runs)', type: 'number', min: 10, max: 1000, defaultValue: 100 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.data_logging.handle_result_history' },
});

// ==========================================
// Legacy / Compatibility Nodes
// ==========================================
nodeRegistry.register({
  nodeType: 'grayscale',
  version: '1.0.0',
  displayName: 'Grayscale',
  category: 'image_preparation',
  description: 'Converts color input frame (BGR/RGB) to single-channel luminance grayscale',
  icon: 'sliders',
  tags: ['grayscale', 'gray', 'bgr2gray', 'luminance', 'convert', 'preprocessing'],
  inputs: [
    { id: 'image_in', name: 'Color Image In', dataType: 'ImageFrame', description: 'Input color visual frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Grayscale Image', dataType: 'ImageFrame', description: '1-channel grayscale image frame', required: true },
  ],
  defaultConfig: { equalizeHist: false },
  configSchema: GrayscaleConfigSchema,
  configFields: [
    { key: 'equalizeHist', label: 'Histogram Equalization', type: 'checkbox', defaultValue: false },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.grayscale', minRuntimeVersion: '0.1.0' },
});

nodeRegistry.register({
  nodeType: 'gaussian_blur',
  version: '1.0.0',
  displayName: 'Gaussian Blur',
  category: 'image_preparation',
  description: 'Applies Gaussian convolution kernel to suppress high-frequency noise',
  icon: 'blur',
  tags: ['blur', 'filter', 'smoothing', 'noise reduction', 'gaussian'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input visual frame', required: true },
  ],
  outputs: [
    { id: 'image_out', name: 'Blurred Image', dataType: 'ImageFrame', description: 'Smoothed output visual frame', required: true },
  ],
  defaultConfig: { kernelSize: 5, sigmaX: 1.5 },
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
    { key: 'sigmaX', label: 'Sigma X (Gaussian standard deviation)', type: 'range', min: 0.1, max: 10.0, step: 0.1, defaultValue: 1.5 },
  ],
  runtime: { supported: true, handler: 'vision_runtime.handlers.gaussian_blur', minRuntimeVersion: '0.2.0' },
});

nodeRegistry.register({
  nodeType: 'ai_detection',
  version: '1.0.0',
  displayName: 'AI Object Detection',
  category: 'ai_inference',
  description: 'Reserved for future deep neural network detector (YOLO / ONNX). Non-AI traditional vision is active in this phase.',
  icon: 'brain',
  tags: ['ai', 'deep learning', 'onnx', 'yolo', 'detection'],
  inputs: [
    { id: 'image_in', name: 'Image In', dataType: 'ImageFrame', description: 'Input frame for tensor inference', required: true },
  ],
  outputs: [
    { id: 'detections', name: 'Detections', dataType: 'DetectionResult', description: 'Predicted bounding boxes and confidence scores', required: true },
  ],
  defaultConfig: { modelPath: 'models/pcb_defect_yolov8.onnx', confidenceThreshold: 0.5, nmsThreshold: 0.45 },
  configSchema: AiDetectionConfigSchema,
  configFields: [
    { key: 'modelPath', label: 'ONNX Model Path', type: 'text', defaultValue: 'models/pcb_defect_yolov8.onnx' },
    { key: 'confidenceThreshold', label: 'Confidence Threshold', type: 'range', min: 0.05, max: 1.0, step: 0.05, defaultValue: 0.5 },
  ],
  runtime: {
    supported: false,
    handler: 'vision_runtime.handlers.onnx_detector',
    minRuntimeVersion: '0.3.0',
    notes: 'Non-AI phase: Deep learning reserved for future AI engine integration.',
  },
});

// -------------------------------------------------------------
// 4. Backwards compatibility exports & helpers
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
    image_acquisition: [],
    image_preparation: [],
    image_processing: [],
    segmentation: [],
    feature_extraction: [],
    measurement_metrology: [],
    decision_inspection_logic: [],
    visualization: [],
    data_logging: [],
    ai_inference: [],
    // Legacy aliases
    ACQUISITION: [],
    PREPROCESSING: [],
    INSPECTION: [],
    AI_INFERENCE: [],
    LOGIC_GATE: [],
    OUTPUT: [],
  };

  nodeRegistry.getAll().forEach((item) => {
    if (grouped[item.category]) {
      grouped[item.category].push(item);
    }
  });

  return grouped;
};
