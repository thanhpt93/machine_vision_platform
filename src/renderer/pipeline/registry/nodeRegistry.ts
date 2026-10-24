import { z } from 'zod';
import { NodeContract, NodeCategory } from '@/shared/contracts';

export interface NodeRegistryItem extends NodeContract {
  configSchema: z.ZodObject<any>;
}

export const ImageFileConfigSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
});

export const RoiCropConfigSchema = z.object({
  x: z.number().int().min(0, 'X must be >= 0'),
  y: z.number().int().min(0, 'Y must be >= 0'),
  width: z.number().int().min(1, 'Width must be >= 1'),
  height: z.number().int().min(1, 'Height must be >= 1'),
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

export const ResultViewerConfigSchema = z.object({
  showHistogram: z.boolean().default(false),
  zoomLevel: z.number().min(0.1, 'Zoom must be >= 0.1').max(10, 'Zoom must be <= 10'),
  title: z.string().min(1, 'Display title is required'),
});

export const NODE_REGISTRY: Record<string, NodeRegistryItem> = {
  image_file: {
    nodeType: 'image_file',
    version: '1.0.0',
    displayName: 'Image File',
    category: 'ACQUISITION',
    description: 'Loads an image from filesystem for pipeline processing',
    inputs: [],
    outputs: [
      {
        id: 'image',
        name: 'Image',
        dataType: 'IMAGE',
        description: 'Loaded image buffer (BGR)',
        required: true,
      },
    ],
    defaultConfig: {
      filePath: 'sample_images/pcb_board.png',
    },
    configSchema: ImageFileConfigSchema,
  },

  roi_crop: {
    nodeType: 'roi_crop',
    version: '1.0.0',
    displayName: 'ROI Crop',
    category: 'PREPROCESSING',
    description: 'Crops a Region of Interest with coordinates (X, Y, Width, Height)',
    inputs: [
      {
        id: 'image_in',
        name: 'Image In',
        dataType: 'IMAGE',
        description: 'Input source image',
        required: true,
      },
    ],
    outputs: [
      {
        id: 'image_out',
        name: 'Cropped Image',
        dataType: 'IMAGE',
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
  },

  threshold: {
    nodeType: 'threshold',
    version: '1.0.0',
    displayName: 'Threshold',
    category: 'PREPROCESSING',
    description: 'Binarize image using luminance thresholding and OpenCV modes',
    inputs: [
      {
        id: 'image_in',
        name: 'Image In',
        dataType: 'IMAGE',
        description: 'Input image to binarize',
        required: true,
      },
    ],
    outputs: [
      {
        id: 'image_out',
        name: 'Binary Image',
        dataType: 'IMAGE',
        description: 'Single-channel thresholded mask',
        required: true,
      },
    ],
    defaultConfig: {
      threshold: 128,
      mode: 'BINARY',
      maxVal: 255,
    },
    configSchema: ThresholdConfigSchema,
  },

  result_viewer: {
    nodeType: 'result_viewer',
    version: '1.0.0',
    displayName: 'Result Viewer',
    category: 'OUTPUT',
    description: 'Visualizes pipeline result in output viewport',
    inputs: [
      {
        id: 'image_in',
        name: 'Display Image',
        dataType: 'IMAGE',
        description: 'Image stream to display',
        required: true,
      },
    ],
    outputs: [],
    defaultConfig: {
      showHistogram: false,
      zoomLevel: 1.0,
      title: 'Main Inspection Output',
    },
    configSchema: ResultViewerConfigSchema,
  },
};

export const getNodeContract = (nodeType: string): NodeRegistryItem | undefined => {
  return NODE_REGISTRY[nodeType];
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

  Object.values(NODE_REGISTRY).forEach((item) => {
    grouped[item.category].push(item);
  });

  return grouped;
};
